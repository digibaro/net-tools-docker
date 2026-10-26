package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/digibaro/net-tools-docker/apps/api/internal/config"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools"
)

// Cookie names.
const (
	SessionCookie = "nt_session"
	flowCookie    = "nt_oidc"
	flowTTL       = 10 * time.Minute
	callbackPath  = "/api/v1/auth"
)

// Service holds the OIDC client (discovered lazily, so the API starts while the IdP is down).
type Service struct {
	cfg        config.Auth
	publicURL  string
	secure     bool
	session    codec
	flow       codec
	adminTools map[string]bool
	logger     *slog.Logger
	// HTTP is used for discovery, JWKS and the token exchange: the issuer is admin configuration,
	// so it may be an internal IdP and is not subject to the target policy.
	HTTP *http.Client
	now  func() time.Time

	mu       sync.Mutex
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	oauth    *oauth2.Config
	endURL   string
}

// New returns nil when auth is off.
func New(cfg config.Config, logger *slog.Logger) *Service {
	if !cfg.Auth.Enabled() {
		return nil
	}
	s := &Service{
		cfg: cfg.Auth, publicURL: strings.TrimSuffix(cfg.PublicURL, "/"), secure: strings.HasPrefix(cfg.PublicURL, "https://"),
		session: newCodec(cfg.Auth.SessionSecret, "session"), flow: newCodec(cfg.Auth.SessionSecret, "flow"),
		adminTools: map[string]bool{}, logger: logger, HTTP: &http.Client{Timeout: 10 * time.Second}, now: time.Now,
	}
	for _, id := range cfg.Auth.AdminTools {
		s.adminTools[id] = true
	}
	return s
}

func (s *Service) setup(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.provider != nil {
		return nil
	}
	ctx = oidc.ClientContext(ctx, s.HTTP)
	p, err := oidc.NewProvider(ctx, s.cfg.Issuer)
	if err != nil {
		return fmt.Errorf("oidc discovery: %w", err)
	}
	var extra struct {
		EndSession string `json:"end_session_endpoint"`
	}
	_ = p.Claims(&extra)
	s.provider, s.endURL = p, extra.EndSession
	// The verifier keeps this context for later JWKS refreshes, so it must outlive the request.
	s.verifier = p.VerifierContext(context.WithoutCancel(ctx), &oidc.Config{ClientID: s.cfg.ClientID, Now: s.now})
	s.oauth = &oauth2.Config{ClientID: s.cfg.ClientID, ClientSecret: s.cfg.ClientSecret, Endpoint: p.Endpoint(), RedirectURL: s.cfg.RedirectURL, Scopes: s.cfg.Scopes}
	return nil
}

// User returns the signed-in user, or nil.
func (s *Service) User(r *http.Request) *User {
	if s == nil {
		return nil
	}
	c, err := r.Cookie(SessionCookie)
	if err != nil {
		return nil
	}
	var u User
	if s.session.decode(c.Value, &u) != nil || s.now().Unix() >= u.Exp {
		return nil
	}
	return &u
}

// Allowed decides whether a visitor may use a tool; the reason says what would help.
// Admin tools always need a signed-in admin, even when anonymous visitors get the user role.
func (s *Service) Allowed(toolID, role string, signedIn bool) (bool, tools.Reason) {
	switch {
	case s == nil, role == RoleAdmin && signedIn:
		return true, ""
	case s.adminTools[toolID] && !signedIn, role == RoleNone:
		return false, tools.ReasonLoginRequired
	case s.adminTools[toolID]:
		return false, tools.ReasonForbiddenRole
	}
	return true, ""
}

// Check is Allowed for a request.
func (s *Service) Check(r *http.Request, toolID string) (bool, tools.Reason) {
	if s == nil {
		return true, ""
	}
	u := s.User(r)
	if u != nil {
		return s.Allowed(toolID, u.Role, true)
	}
	return s.Allowed(toolID, s.cfg.AnonymousRole, false)
}

// Require guards a tool's routes; denied writes the error envelope (401 or 403).
func (s *Service) Require(toolID string, denied func(w http.ResponseWriter, r *http.Request, reason tools.Reason)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if ok, reason := s.Check(r, toolID); !ok {
				denied(w, r, reason)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

type flowState struct {
	State    string `json:"s"`
	Nonce    string `json:"n"`
	Verifier string `json:"v"`
	Next     string `json:"x"`
	Exp      int64  `json:"e"`
}

func random() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// SafeNext keeps redirects on this site: a path starting with one "/".
func SafeNext(next string) string {
	if !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//") || strings.HasPrefix(next, "/\\") || strings.ContainsAny(next, "\r\n") {
		return "/"
	}
	return next
}

func (s *Service) cookie(name, value, path string, maxAge time.Duration) *http.Cookie {
	//nolint:gosec // Secure follows PUBLIC_URL: plain-http installs (localhost, LAN) still need the cookie
	c := &http.Cookie{Name: name, Value: value, Path: path, HttpOnly: true, Secure: s.secure, SameSite: http.SameSiteLaxMode, MaxAge: int(maxAge.Seconds())}
	if maxAge < 0 {
		c.MaxAge = -1
	}
	return c
}

// fail sends the browser back to the app with a short error code it can explain.
func (s *Service) fail(w http.ResponseWriter, r *http.Request, code string, err error) {
	if err != nil {
		s.logger.WarnContext(r.Context(), "oidc login failed", slog.String("code", code), slog.Any("err", err))
	}
	http.SetCookie(w, s.cookie(flowCookie, "", callbackPath, -1))
	http.Redirect(w, r, "/?auth_error="+code, http.StatusFound)
}

// Login starts the authorization code flow (PKCE, state and nonce in a signed short-lived cookie).
func (s *Service) Login(w http.ResponseWriter, r *http.Request) {
	if err := s.setup(r.Context()); err != nil {
		s.fail(w, r, "idp_unreachable", err)
		return
	}
	f := flowState{State: random(), Nonce: random(), Verifier: oauth2.GenerateVerifier(), Next: SafeNext(r.URL.Query().Get("next")), Exp: s.now().Add(flowTTL).Unix()}
	v, err := s.flow.encode(f)
	if err != nil {
		s.fail(w, r, "internal", err)
		return
	}
	http.SetCookie(w, s.cookie(flowCookie, v, callbackPath, flowTTL))
	http.Redirect(w, r, s.oauth.AuthCodeURL(f.State, oidc.Nonce(f.Nonce), oauth2.S256ChallengeOption(f.Verifier)), http.StatusFound)
}

var errState = errors.New("state mismatch or expired login")

// Callback finishes the flow, maps groups to a role and sets the session cookie.
func (s *Service) Callback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if e := q.Get("error"); e != "" {
		s.fail(w, r, "denied", fmt.Errorf("idp error %q", e))
		return
	}
	var f flowState
	c, err := r.Cookie(flowCookie)
	if err != nil || s.flow.decode(c.Value, &f) != nil || f.State == "" || f.State != q.Get("state") || s.now().Unix() > f.Exp {
		s.fail(w, r, "state", errState)
		return
	}
	if err := s.setup(r.Context()); err != nil {
		s.fail(w, r, "idp_unreachable", err)
		return
	}
	ctx := oidc.ClientContext(r.Context(), s.HTTP)
	tok, err := s.oauth.Exchange(ctx, q.Get("code"), oauth2.VerifierOption(f.Verifier))
	if err != nil {
		s.fail(w, r, "exchange", err)
		return
	}
	raw, _ := tok.Extra("id_token").(string)
	id, err := s.verifier.Verify(ctx, raw)
	if err != nil || id.Nonce != f.Nonce {
		s.fail(w, r, "token", errors.Join(err, errors.New("id token rejected")))
		return
	}
	var claims map[string]any
	if err := id.Claims(&claims); err != nil {
		s.fail(w, r, "token", err)
		return
	}
	u, ok := s.userFrom(id.Subject, claims)
	if !ok {
		s.fail(w, r, "not_allowed", nil)
		return
	}
	v, err := s.session.encode(u)
	if err != nil {
		s.fail(w, r, "internal", err)
		return
	}
	http.SetCookie(w, s.cookie(flowCookie, "", callbackPath, -1))
	http.SetCookie(w, s.cookie(SessionCookie, v, "/", s.cfg.SessionTTL))
	s.logger.InfoContext(r.Context(), "signed in", slog.String("sub", u.Sub), slog.String("role", u.Role))
	http.Redirect(w, r, f.Next, http.StatusFound)
}

// groups reads the roles claim; a dotted name walks nested objects (realm_access.roles).
func groups(claims map[string]any, name string) []string {
	var cur any = claims
	for _, part := range strings.Split(name, ".") {
		m, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = m[part]
	}
	switch v := cur.(type) {
	case string:
		return strings.Fields(v)
	case []any:
		out := make([]string, 0, len(v))
		for _, x := range v {
			if s, ok := x.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

func (s *Service) userFrom(sub string, claims map[string]any) (User, bool) {
	str := func(k string) string { v, _ := claims[k].(string); return v }
	g := groups(claims, s.cfg.RolesClaim)
	in := func(list []string) bool {
		return slices.ContainsFunc(g, func(x string) bool { return slices.Contains(list, x) })
	}
	u := User{Sub: sub, Email: str("email"), Role: RoleUser, Exp: s.now().Add(s.cfg.SessionTTL).Unix()}
	u.Name = cmpOr(str("name"), str("preferred_username"), u.Email, sub)
	switch {
	case in(s.cfg.AdminGroups):
		u.Role = RoleAdmin
	case len(s.cfg.UserGroups) > 0 && !in(s.cfg.UserGroups):
		return User{}, false
	}
	return u, true
}

func cmpOr(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// Logout clears the session; it returns the IdP's end-session URL when it has one.
func (s *Service) Logout(w http.ResponseWriter, _ *http.Request) string {
	http.SetCookie(w, s.cookie(SessionCookie, "", "/", -1))
	s.mu.Lock()
	end := s.endURL
	s.mu.Unlock()
	if end == "" {
		return ""
	}
	q := url.Values{"client_id": {s.cfg.ClientID}, "post_logout_redirect_uri": {s.publicURL + "/"}}
	return end + "?" + q.Encode()
}

// SameOrigin rejects cross-site state-changing requests while cookie auth is on: an Origin header,
// when present, must match PUBLIC_URL or the request's own host.
func (s *Service) SameOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		o := r.Header.Get("Origin")
		if s == nil || o == "" || r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		if u, err := url.Parse(o); err == nil && (o == s.publicURL || u.Host == r.Host) {
			next.ServeHTTP(w, r)
			return
		}
		http.Error(w, "cross-site request refused", http.StatusForbidden)
	})
}

// IssueSession signs a session for u (tests and tooling; the login flow uses the same codec).
func (s *Service) IssueSession(u User) (string, error) { return s.session.encode(u) }
