package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/netip"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/digibaro/net-tools-docker/apps/api/internal/auth"
	"github.com/digibaro/net-tools-docker/apps/api/internal/config"
	"github.com/digibaro/net-tools-docker/apps/api/internal/execx"
	"github.com/digibaro/net-tools-docker/apps/api/internal/limits"
	"github.com/digibaro/net-tools-docker/apps/api/internal/middleware"
	"github.com/digibaro/net-tools-docker/apps/api/internal/providers"
	"github.com/digibaro/net-tools-docker/apps/api/internal/target"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools"
)

// maxRequestBody caps request bodies for every route; tools may lower it.
const maxRequestBody = 1 << 20

// BuildInfo is injected at link time (see docker/api.Dockerfile).
type BuildInfo struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"buildDate"`
	GoVersion string `json:"goVersion"`
}

// ReadyCheck reports whether a dependency is ready; name appears in /api/readyz output.
type ReadyCheck struct {
	Name  string
	Check func(context.Context) error
}

// Options configures the router.
type Options struct {
	Config config.Config
	Logger *slog.Logger
	Build  BuildInfo
	Tools  []tools.Tool
	Ready  []ReadyCheck
	// Target, Exec, Limiter and Pool default to production instances built from Config.
	Target  *target.Resolver
	Exec    *execx.Runner
	Limiter *limits.RateLimiter
	Pool    *limits.Pool
	// Providers defaults to a new client (tests pass one to inspect it).
	Providers *providers.Client
	// Auth defaults to auth.New(Config); nil when AUTH_MODE=off.
	Auth *auth.Service
}

// BuildDeps fills defaults and returns the dependencies handed to tools.
func BuildDeps(o *Options) tools.Deps {
	cfg := o.Config
	if o.Target == nil {
		o.Target = target.NewResolver(target.Policy{
			AllowPrivate: cfg.Features.AllowPrivate,
			Deny:         cfg.Features.DenyCIDRs,
			Allow:        cfg.Features.AllowCIDRs,
		})
	}
	if o.Exec == nil {
		o.Exec = execx.New(execx.DefaultCandidates())
	}
	if o.Limiter == nil {
		o.Limiter = limits.NewRateLimiter(cfg.Limits.RateLimitRPM, cfg.Limits.RateLimitHeavyRPM)
	}
	if o.Pool == nil {
		o.Pool = limits.NewPool(cfg.Limits.ConcurrencyGlobal, cfg.Limits.ConcurrencyPerIP)
	}
	limiter := o.Limiter
	ua := "NetTools/" + o.Build.Version + " (+" + cfg.PublicURL + ")"
	if o.Providers == nil {
		o.Providers = providers.New(o.Target, ua)
	}
	return tools.Deps{
		Providers: o.Providers,
		Config:    cfg,
		Logger:    o.Logger,
		Target:    o.Target,
		Exec:      o.Exec,
		Pool:      o.Pool,
		RateLimit: func(c limits.Class) tools.Middleware {
			return limiter.Middleware(c, func(r *http.Request) netip.Addr { return middleware.GetClientIP(r.Context()) },
				func(w http.ResponseWriter, r *http.Request) {
					rejectStreamAware(w, r, &APIError{Code: CodeRateLimited, Message: "too many requests, please wait", Details: retryDetails(w)})
				})
		},
		Timeout:   limits.Timeout,
		UserAgent: ua,
		Slot: func(next http.Handler) http.Handler {
			pool := o.Pool
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				release, err := pool.Acquire(middleware.GetClientIP(r.Context()))
				if err != nil {
					rejectStreamAware(w, r, err)
					return
				}
				defer release()
				next.ServeHTTP(w, r)
			})
		},
	}
}

// NewRouter builds the API handler. All routes live under /api.
func NewRouter(o Options) http.Handler {
	deps := BuildDeps(&o)
	if o.Auth == nil {
		o.Auth = auth.New(o.Config, o.Logger)
	}
	authz := o.Auth
	r := chi.NewRouter()
	r.Use(
		middleware.RequestID(o.Logger),
		middleware.ClientIP(o.Config.Features.TrustedProxies),
		middleware.AccessLog(ipFormatter(o.Config.Features.LogHashIPs)),
		middleware.Recover(func(w http.ResponseWriter, r *http.Request) {
			Error(w, r, NewError(CodeInternal, "internal error"))
		}),
		limitBody(maxRequestBody, "/api/v1/speedtest/upload"), // the speed test enforces its own, larger cap
	)
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		Error(w, r, NewError(CodeNotFound, "no such endpoint"))
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		Error(w, r, NewError(CodeMethodNotAllowed, "method not allowed"))
	})

	r.Route("/api", func(r chi.Router) {
		r.Get("/healthz", handleHealthz)
		r.Get("/readyz", handleReadyz(o.Ready))

		r.Route("/v1", func(r chi.Router) {
			r.Use(authz.SameOrigin)
			r.Get("/version", handleVersion(o.Build))
			r.Get("/capabilities", handleCapabilities(deps, o.Tools, authz))
			if authz != nil {
				// Login and callback make outbound calls to the IdP: rate-limited like light tools.
				r.Group(func(g chi.Router) {
					g.Use(deps.RateLimit(limits.Light))
					g.Get("/auth/login", authz.Login)
					g.Get("/auth/callback", authz.Callback)
					g.Post("/auth/logout", func(w http.ResponseWriter, r *http.Request) {
						JSON(w, r, map[string]string{"logoutUrl": authz.Logout(w, r)}, nil)
					})
				})
			}
			r.Get("/echo", handleEcho(o.Config.Features.TrustedProxies))

			auditIP := ipFormatter(o.Config.Features.LogHashIPs)
			for _, t := range o.Tools {
				if ok, _ := t.Enabled(deps); !ok {
					continue
				}
				if !o.Config.Features.AuditLog && authz == nil {
					t.Mount(r, deps)
					continue
				}
				r.Group(func(g chi.Router) {
					if authz != nil {
						g.Use(authz.Require(t.ID(), denyAuth))
					}
					// AUDIT_LOG: every route of the tool gets the audit middleware.
					if o.Config.Features.AuditLog {
						g.Use(middleware.Audit(t.ID(), auditIP))
					}
					t.Mount(g, deps)
				})
			}
		})
	})
	return r
}

func handleHealthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, r, http.StatusOK, map[string]string{"status": "ok"})
}

func handleReadyz(checks []ReadyCheck) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		failed := map[string]string{}
		for _, c := range checks {
			if err := c.Check(ctx); err != nil {
				middleware.Logger(ctx).WarnContext(ctx, "readiness check failed",
					slog.String("check", c.Name), slog.Any("err", err))
				failed[c.Name] = "not ready"
			}
		}
		if len(failed) > 0 {
			writeJSON(w, r, http.StatusServiceUnavailable, map[string]any{"status": "not_ready", "checks": failed})
			return
		}
		writeJSON(w, r, http.StatusOK, map[string]string{"status": "ready"})
	}
}

func handleVersion(b BuildInfo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		JSON(w, r, b, nil)
	}
}

// CapabilitiesData is the payload of /api/v1/capabilities.
type CapabilitiesData struct {
	Mode   ModeInfo                    `json:"mode"`
	Tools  map[string]tools.Capability `json:"tools"`
	Limits LimitsInfo                  `json:"limits"`
	Auth   AuthInfo                    `json:"auth"`
}

// AuthInfo tells the UI whether login exists and who is signed in.
type AuthInfo struct {
	Mode string    `json:"mode"` // off | oidc
	User *AuthUser `json:"user"`
}

// AuthUser is the signed-in user (from the session cookie).
type AuthUser struct {
	Name  string `json:"name"`
	Email string `json:"email,omitempty"`
	Role  string `json:"role"`
}

func denyAuth(w http.ResponseWriter, r *http.Request, reason tools.Reason) {
	if reason == tools.ReasonForbiddenRole {
		rejectStreamAware(w, r, NewError(CodeForbidden, "this tool is limited to administrators"))
		return
	}
	rejectStreamAware(w, r, NewError(CodeUnauthenticated, "sign in to use this tool"))
}

// ModeInfo describes the deployment mode.
type ModeInfo struct {
	Profile             config.Profile `json:"profile"`
	AllowPrivateTargets bool           `json:"allowPrivateTargets"`
	LAN                 bool           `json:"lan"`
}

// LimitsInfo exposes the limits the UI needs to bound its inputs.
type LimitsInfo struct {
	PingMaxCount      int   `json:"pingMaxCount"`
	PingMinIntervalMs int64 `json:"pingMinIntervalMs"`
	TracerouteMaxHops int   `json:"tracerouteMaxHops"`
	MTRMaxCycles      int   `json:"mtrMaxCycles"`
	PortscanMaxPorts  int   `json:"portscanMaxPorts"`
	IperfMaxSeconds   int   `json:"iperfMaxSeconds"`
	BulkMaxTargets    int   `json:"bulkMaxTargets"`
	MonitorMaxMinutes int   `json:"monitorMaxMinutes"`
}

func handleCapabilities(deps tools.Deps, all []tools.Tool, authz *auth.Service) http.HandlerFunc {
	cfg := deps.Config
	base := CapabilitiesData{
		Mode: ModeInfo{
			Profile:             cfg.Profile,
			AllowPrivateTargets: cfg.Features.AllowPrivate,
			LAN:                 cfg.Features.LAN,
		},
		Tools: tools.Capabilities(deps, all),
		Limits: LimitsInfo{
			PingMaxCount:      cfg.Limits.PingMaxCount,
			PingMinIntervalMs: cfg.Limits.PingMinInterval.Milliseconds(),
			TracerouteMaxHops: cfg.Limits.TracerouteMaxHops,
			MTRMaxCycles:      cfg.Limits.MTRMaxCycles,
			PortscanMaxPorts:  cfg.Limits.PortscanMaxPorts,
			IperfMaxSeconds:   cfg.Limits.IperfMaxSeconds,
			BulkMaxTargets:    cfg.Limits.BulkMaxTargets,
			MonitorMaxMinutes: cfg.Limits.MonitorMaxMinutes,
		},
		Auth: AuthInfo{Mode: cfg.Auth.Mode},
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if authz == nil {
			JSON(w, r, base, nil)
			return
		}
		// Per visitor: tools the role may not use are reported as disabled with the reason.
		data := base
		data.Tools = make(map[string]tools.Capability, len(base.Tools))
		for id, c := range base.Tools {
			if c.Enabled {
				if ok, reason := authz.Check(r, id); !ok {
					c = tools.Capability{Enabled: false, Reason: reason}
				}
			}
			data.Tools[id] = c
		}
		if u := authz.User(r); u != nil {
			data.Auth.User = &AuthUser{Name: u.Name, Email: u.Email, Role: u.Role}
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Vary", "Cookie")
		JSON(w, r, data, nil)
	}
}

// limitBody caps request bodies at n bytes, except for the listed paths (which must cap their own).
func limitBody(n int64, exempt ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil && !slices.Contains(exempt, r.URL.Path) {
				r.Body = http.MaxBytesReader(w, r.Body, n)
			}
			next.ServeHTTP(w, r)
		})
	}
}

func ipFormatter(hash bool) func(string) string {
	if !hash {
		return func(s string) string { return s }
	}
	return func(s string) string {
		sum := sha256.Sum256([]byte(s))
		return hex.EncodeToString(sum[:8])
	}
}

// retryDetails exposes Retry-After (set by the limiter) in the error details for the UI.
func retryDetails(w http.ResponseWriter) map[string]any {
	if n, err := strconv.Atoi(w.Header().Get("Retry-After")); err == nil {
		return map[string]any{"retryAfter": n}
	}
	return nil
}

// rejectStreamAware writes a rate-limit / busy / auth rejection. EventSource cannot read the body of a
// non-200 response, so streaming requests get the error as an SSE "error" event instead.
func rejectStreamAware(w http.ResponseWriter, r *http.Request, err error) {
	if !strings.Contains(r.Header.Get("Accept"), "text/event-stream") {
		Error(w, r, err)
		return
	}
	a := ToAPIError(err)
	body, _ := json.Marshal(map[string]any{"code": a.Code, "message": a.Message, "details": a.Details})
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprintf(w, "retry: 86400000\nevent: error\ndata: %s\n\n", body)
}
