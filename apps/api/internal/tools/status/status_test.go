package status

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
