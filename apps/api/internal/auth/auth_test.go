package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	jose "github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"

	"github.com/digibaro/net-tools-docker/apps/api/internal/config"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools"
)

// idp is a minimal OIDC provider: discovery, JWKS and a token endpoint that checks PKCE.
type idp struct {
	srv       *httptest.Server
	key       *rsa.PrivateKey
	challenge string
	nonce     string
	groups    []string
	badNonce  bool
}

func newIDP(t *testing.T) *idp {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	p := &idp{key: key, groups: []string{"staff"}}
	mux := http.NewServeMux()
	p.srv = httptest.NewServer(mux)
	t.Cleanup(p.srv.Close)
	iss := p.srv.URL
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"issuer": iss, "authorization_endpoint": iss + "/authorize", "token_endpoint": iss + "/token", "jwks_uri": iss + "/jwks", "end_session_endpoint": iss + "/logout", "id_token_signing_alg_values_supported": []string{"RS256"}})
	})
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "k1", Algorithm: "RS256", Use: "sig"}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		sum := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
		if r.Form.Get("code") != "good-code" || base64.RawURLEncoding.EncodeToString(sum[:]) != p.challenge {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
			return
		}
		nonce := p.nonce
		if p.badNonce {
			nonce = "other"
		}
		sig, _ := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, (&jose.SignerOptions{}).WithHeader("kid", "k1"))
		now := time.Now()
		tok, _ := jwt.Signed(sig).Claims(jwt.Claims{Issuer: iss, Subject: "u-1", Audience: jwt.Audience{"nettools"}, IssuedAt: jwt.NewNumericDate(now), Expiry: jwt.NewNumericDate(now.Add(time.Minute))}).
			Claims(map[string]any{"nonce": nonce, "name": "Alex Example", "email": "alex@example.org", "realm_access": map[string]any{"roles": p.groups}}).Serialize()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "at", "token_type": "Bearer", "expires_in": 60, "id_token": tok})
	})
	return p
}

func service(t *testing.T, p *idp, mod func(*config.Auth)) *Service {
	t.Helper()
	a := config.Auth{Mode: "oidc", Issuer: p.srv.URL, ClientID: "nettools", ClientSecret: "cs", RedirectURL: "https://nt.example/api/v1/auth/callback", Scopes: []string{"openid", "profile"},
		RolesClaim: "realm_access.roles", AdminGroups: []string{"netadmins"}, SessionSecret: strings.Repeat("s", 32), SessionTTL: time.Hour, AnonymousRole: RoleNone, AdminTools: []string{"sys.providers"}}
	if mod != nil {
		mod(&a)
	}
	return New(config.Config{PublicURL: "https://nt.example", Auth: a}, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

// login runs Login and the callback; it returns the callback response.
func login(t *testing.T, s *Service, p *idp, code string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	s.Login(rec, httptest.NewRequest(http.MethodGet, "/api/v1/auth/login?next=/ping%3Ftarget%3Dx", nil))
	loc, err := url.Parse(rec.Header().Get("Location"))
	if err != nil || rec.Code != http.StatusFound || loc.Query().Get("code_challenge_method") != "S256" {
		t.Fatalf("login: %d %s", rec.Code, rec.Header().Get("Location"))
	}
	p.challenge, p.nonce = loc.Query().Get("code_challenge"), loc.Query().Get("nonce")
	cb := httptest.NewRequest(http.MethodGet, "/api/v1/auth/callback?code="+code+"&state="+loc.Query().Get("state"), nil)
	for _, c := range rec.Result().Cookies() {
		cb.AddCookie(c)
	}
	out := httptest.NewRecorder()
	s.Callback(out, cb)
	return out
}

func sessionOf(rec *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == SessionCookie && c.Value != "" {
			return c
		}
	}
	return nil
}

func TestLoginFlow(t *testing.T) {
	p := newIDP(t)
	s := service(t, p, nil)
	rec := login(t, s, p, "good-code")
	c := sessionOf(rec)
	if rec.Header().Get("Location") != "/ping?target=x" || c == nil || !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode {
		t.Fatalf("callback: %d %s %+v", rec.Code, rec.Header().Get("Location"), c)
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(c)
	u := s.User(req)
	if u == nil || u.Sub != "u-1" || u.Name != "Alex Example" || u.Role != RoleUser {
		t.Fatalf("user = %+v", u)
	}
	if ok, reason := s.Check(req, "sys.providers"); ok || reason != tools.ReasonForbiddenRole {
		t.Errorf("user on admin tool: %v %s", ok, reason)
	}

	p.groups = []string{"netadmins"}
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(sessionOf(login(t, s, p, "good-code")))
	if u := s.User(req); u == nil || u.Role != RoleAdmin {
		t.Errorf("admin = %+v", u)
	}

	// Tampered, foreign-key and expired sessions are ignored.
	bad := httptest.NewRequest(http.MethodGet, "/", nil)
	bad.AddCookie(&http.Cookie{Name: SessionCookie, Value: strings.Replace(c.Value, "a", "b", 1) + "x"})
	other := service(t, p, func(a *config.Auth) { a.SessionSecret = strings.Repeat("o", 32) })
	if s.User(bad) != nil || other.User(req) != nil {
		t.Error("forged session accepted")
	}
	s.now = func() time.Time { return time.Now().Add(2 * time.Hour) }
	if s.User(req) != nil {
		t.Error("expired session accepted")
	}

	lo := httptest.NewRecorder()
	if end := s.Logout(lo, req); !strings.HasPrefix(end, p.srv.URL+"/logout?") || lo.Result().Cookies()[0].MaxAge != -1 {
		t.Errorf("logout %q", end)
	}
}

func TestLoginFailures(t *testing.T) {
	p := newIDP(t)
	for name, tc := range map[string]struct {
		mod  func(*config.Auth)
		code string
		prep func()
		want string
	}{
		"bad code":   {code: "stolen", want: "exchange"},
		"bad nonce":  {code: "good-code", prep: func() { p.badNonce = true }, want: "token"},
		"not member": {code: "good-code", mod: func(a *config.Auth) { a.UserGroups = []string{"noc"} }, want: "not_allowed"},
	} {
		p.badNonce = false
		if tc.prep != nil {
			tc.prep()
		}
		rec := login(t, service(t, p, tc.mod), p, tc.code)
		if rec.Header().Get("Location") != "/?auth_error="+tc.want || sessionOf(rec) != nil {
			t.Errorf("%s: %s", name, rec.Header().Get("Location"))
		}
	}
	// A callback without the flow cookie (or with another state) is refused.
	s := service(t, p, nil)
	rec := httptest.NewRecorder()
	s.Callback(rec, httptest.NewRequest(http.MethodGet, "/api/v1/auth/callback?code=good-code&state=guess", nil))
	if rec.Header().Get("Location") != "/?auth_error=state" {
		t.Errorf("no flow cookie: %s", rec.Header().Get("Location"))
	}
	// Unreachable IdP: the API still answers, login reports it.
	down := service(t, p, func(a *config.Auth) { a.Issuer = "http://127.0.0.1:1" })
	rec = httptest.NewRecorder()
	down.Login(rec, httptest.NewRequest(http.MethodGet, "/api/v1/auth/login", nil))
	if rec.Header().Get("Location") != "/?auth_error=idp_unreachable" {
		t.Errorf("idp down: %s", rec.Header().Get("Location"))
	}
}

func TestAllowed(t *testing.T) {
	s := service(t, newIDP(t), nil)
	for _, tc := range []struct {
		tool, role string
		signedIn   bool
		want       tools.Reason
	}{
		{"net.ping", RoleNone, false, tools.ReasonLoginRequired},
		{"net.ping", RoleUser, false, ""}, // AUTH_ANONYMOUS_ROLE=user
		{"net.ping", RoleUser, true, ""},
		{"sys.providers", RoleUser, false, tools.ReasonLoginRequired},
		{"sys.providers", RoleUser, true, tools.ReasonForbiddenRole},
		{"sys.providers", RoleAdmin, true, ""},
	} {
		if _, got := s.Allowed(tc.tool, tc.role, tc.signedIn); got != tc.want {
			t.Errorf("%+v = %q", tc, got)
		}
	}
	var off *Service
	if ok, _ := off.Allowed("sys.providers", RoleNone, false); !ok {
		t.Error("auth off must allow")
	}
}

func TestSafeNextAndOrigin(t *testing.T) {
	for in, want := range map[string]string{"/ping?x=1": "/ping?x=1", "//evil.example": "/", "/\\evil.example": "/", "https://evil.example": "/", "": "/", "/a\r\nSet-Cookie: x": "/"} {
		if got := SafeNext(in); got != want {
			t.Errorf("%q = %q", in, got)
		}
	}
	s := service(t, newIDP(t), nil)
	h := s.SameOrigin(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	for origin, want := range map[string]int{"": 200, "https://nt.example": 200, "http://localhost:8080": 200, "https://evil.example": 403} {
		req := httptest.NewRequest(http.MethodPost, "http://localhost:8080/api/v1/snmp", nil)
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Errorf("origin %q = %d", origin, rec.Code)
		}
	}
}
