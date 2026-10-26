// Package status implements the provider status page (which public services are configured and
// reachable). Never exposes keys: only whether one is set.
package status

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/digibaro/net-tools-docker/apps/api/internal/httpapi"
	"github.com/digibaro/net-tools-docker/apps/api/internal/limits"
	"github.com/digibaro/net-tools-docker/apps/api/internal/providers"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools"
)

// Known lists the providers and the secret each one uses ("" = keyless, Optional = works without).
var Known = []struct {
	Name     string
	Secret   string
	Optional bool
}{
	{"AbuseIPDB", "ABUSEIPDB_KEY", false},
	{"crt.sh", "", false},
	{"Globalping", "GLOBALPING_TOKEN", true},
	{"Google Safe Browsing", "SAFEBROWSING_KEY", false},
	{"hstspreload.org", "", false},
	{"ipinfo.io", "IPINFO_TOKEN", false},
	{"Mozilla Observatory", "", false},
	{"Onionoo", "", false},
	{"PeeringDB", "PEERINGDB_KEY", true},
	{"RIPEstat", "", false},
	{"Shodan InternetDB", "", false},
	{"Tor Project", "", false},
	{"urlscan.io", "URLSCAN_KEY", false},
	{"VirusTotal", "VIRUSTOTAL_KEY", false},
}

// Tool is the provider status endpoint.
type Tool struct{ deps tools.Deps }

func (*Tool) ID() string                                { return "sys.providers" }
func (*Tool) Enabled(d tools.Deps) (bool, tools.Reason) { return tools.Always(d) }

func (t *Tool) Mount(r chi.Router, d tools.Deps) {
	t.deps = d
	r.With(d.RateLimit(limits.Light)).Get("/providers/status", t.handle)
}

// Provider is one row.
type Provider struct {
	Name          string     `json:"name"`
	Secret        string     `json:"secret"`
	KeyConfigured bool       `json:"keyConfigured"`
	KeyOptional   bool       `json:"keyOptional"`
	Requests      int        `json:"requests"`
	Fetches       int        `json:"fetches"`
	Errors        int        `json:"errors"`
	LastOK        *time.Time `json:"lastOk"`
	LastError     *time.Time `json:"lastError"`
	LastProblem   string     `json:"lastProblem"`
	LastLatencyMs int64      `json:"lastLatencyMs"`
}

// Result is the response payload.
type Result struct {
	Since     time.Time  `json:"since"`
	Providers []Provider `json:"providers"`
}

var started = time.Now()

func ptr(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}

func (t *Tool) handle(w http.ResponseWriter, r *http.Request) {
	seen := map[string]providers.Stat{}
	for _, s := range t.deps.Providers.Stats() {
		seen[s.Provider] = s
	}
	res := Result{Since: started, Providers: []Provider{}}
	for _, k := range Known {
		s := seen[k.Name]
		res.Providers = append(res.Providers, Provider{
			Name: k.Name, Secret: k.Secret, KeyConfigured: k.Secret != "" && t.deps.Config.HasSecret(k.Secret), KeyOptional: k.Optional,
			Requests: s.Requests, Fetches: s.Fetches, Errors: s.Errors, LastOK: ptr(s.LastOK), LastError: ptr(s.LastError), LastProblem: s.LastProblem, LastLatencyMs: s.LastLatencyMs,
		})
	}
	httpapi.JSON(w, r, res, &httpapi.Meta{Tool: t.ID(), Vantage: "server"})
}
