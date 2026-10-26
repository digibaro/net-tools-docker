package status

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/digibaro/net-tools-docker/apps/api/internal/auth"
	"github.com/digibaro/net-tools-docker/apps/api/internal/providers"
	"github.com/digibaro/net-tools-docker/apps/api/internal/target"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools/tooltest"
)

func TestStatus(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/fail" {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		_, _ = w.Write([]byte(`{}`))
	}))
	defer up.Close()
	res0 := target.NewResolver(target.Policy{AllowPrivate: true})
	p := providers.New(res0, "test")
	env := tooltest.New(t, &Tool{}, tooltest.Options{AllowPrivate: true, Providers: p, Env: map[string]string{"IPINFO_TOKEN": "secret-token"}})
	for range 2 {
		_, _ = p.Get(context.Background(), providers.Request{Provider: "RIPEstat", URL: up.URL + "/ok"})
	}
	_, _ = p.Get(context.Background(), providers.Request{Provider: "AbuseIPDB", URL: up.URL + "/fail?key=secret-token"})
	var res Result
	r := env.Get("/api/v1/providers/status").Must(t)
	r.Decode(t, &res)
	by := map[string]Provider{}
	for _, x := range res.Providers {
		by[x.Name] = x
	}
	if by["RIPEstat"].Requests != 2 || by["RIPEstat"].Fetches != 1 || by["RIPEstat"].LastOK == nil {
		t.Errorf("ripestat = %+v", by["RIPEstat"])
	}
	if by["AbuseIPDB"].Errors != 1 || by["AbuseIPDB"].LastProblem != "HTTP 429" || by["AbuseIPDB"].KeyConfigured {
		t.Errorf("abuseipdb = %+v", by["AbuseIPDB"])
	}
	if !by["ipinfo.io"].KeyConfigured {
		t.Error("ipinfo key not reported")
	}
	if body := r.Raw.Body.String(); contains(body, "secret-token") || contains(body, up.URL) {
		t.Error("secret or URL leaked")
	}
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }

// With AUTH_MODE=oidc the router enforces roles per tool and capabilities explain why.
func TestAuthRoles(t *testing.T) {
	env := map[string]string{"AUTH_MODE": "oidc", "OIDC_ISSUER": "http://127.0.0.1:1", "OIDC_CLIENT_ID": "nt", "SESSION_SECRET": strings.Repeat("k", 32)}
	authz := auth.New(tooltest.Config(t, env), slog.New(slog.NewTextHandler(io.Discard, nil)))
	e := tooltest.New(t, &Tool{}, tooltest.Options{Env: env, Auth: authz})
	as := func(role string) tooltest.Response {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/providers/status", nil)
		if role != "" {
			v, _ := authz.IssueSession(auth.User{Sub: "s", Name: "n", Role: role, Exp: time.Now().Add(time.Hour).Unix()})
			req.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: v})
		}
		return e.Do(req)
	}
	as("").ExpectError(t, "UNAUTHENTICATED")
	if r := as(""); r.Status != http.StatusUnauthorized {
		t.Errorf("anonymous status %d", r.Status)
	}
	as(auth.RoleUser).ExpectError(t, "FORBIDDEN")
	as(auth.RoleAdmin).Must(t)

	var caps struct {
		Tools map[string]struct {
			Enabled bool   `json:"enabled"`
			Reason  string `json:"reason"`
		} `json:"tools"`
		Auth struct {
			Mode string `json:"mode"`
		} `json:"auth"`
	}
	r := e.Get("/api/v1/capabilities")
	r.Decode(t, &caps)
	if caps.Auth.Mode != "oidc" || caps.Tools["sys.providers"].Enabled || caps.Tools["sys.providers"].Reason != "login_required" || r.Raw.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("capabilities = %+v", caps)
	}
	// Cross-site POSTs are refused while cookie auth is on.
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/v1/auth/logout", nil)
	req.Header.Set("Origin", "https://evil.example")
	if r := e.Do(req); r.Status != http.StatusForbidden {
		t.Errorf("cross-site logout = %d", r.Status)
	}
}
