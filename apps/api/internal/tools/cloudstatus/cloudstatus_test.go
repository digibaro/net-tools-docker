package cloudstatus

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/digibaro/net-tools-docker/apps/api/internal/dashboard"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools/tooltest"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestParsers(t *testing.T) {
	tests := []struct {
		kind, file, page string
		state            string
		incidents        int
		check            func(t *testing.T, p parsed)
	}{
		{dashboard.KindStatuspage, "statuspage.json", "https://status.openai.com/", StateDegraded, 2, func(t *testing.T, p parsed) {
			if p.Incidents[0].URL != "https://status.openai.com/" || p.Incidents[0].Impact != StateDegraded {
				t.Errorf("incident without shortlink = %+v", p.Incidents[0])
			}
			if p.Incidents[1].Impact != StateMaintenance || p.Incidents[1].URL != "https://stspg.io/x" {
				t.Errorf("maintenance = %+v", p.Incidents[1])
			}
			if len(p.Components) != 1 || p.Components[0] != "Codex" {
				t.Errorf("components = %v (groups must be skipped)", p.Components)
			}
		}},
		{dashboard.KindGoogle, "google.json", "https://www.google.com/appsstatus/dashboard/", StateOutage, 2, func(t *testing.T, p parsed) {
			if !strings.HasPrefix(p.Incidents[0].Title, "Gmail: ") || !strings.HasPrefix(p.Incidents[0].URL, "https://www.google.com/appsstatus/dashboard/incidents/") {
				t.Errorf("google incident = %+v", p.Incidents[0])
			}
			if p.Incidents[1].Impact != "info" {
				t.Errorf("SERVICE_INFORMATION must be info, got %+v", p.Incidents[1])
			}
		}},
		{dashboard.KindAWS, "aws.json", "https://health.aws.amazon.com/health/status", StateOutage, 2, func(t *testing.T, p parsed) {
			if !strings.Contains(p.Incidents[0].Title, "(UAE)") || p.Incidents[0].Started == "" || p.Incidents[0].Updated == "" {
				t.Errorf("aws incident = %+v", p.Incidents[0])
			}
			if p.Incidents[1].Impact != "info" {
				t.Errorf("status 1 = %+v", p.Incidents[1])
			}
		}},
		{dashboard.KindRSS, "azure.xml", "https://azure.status.microsoft/en-us/status", StateDegraded, 1, func(t *testing.T, p parsed) {
			if p.Incidents[0].Started != "2026-11-13T09:30:00Z" || !strings.Contains(p.Incidents[0].URL, "trackingid=") {
				t.Errorf("rss item = %+v", p.Incidents[0])
			}
		}},
		{dashboard.KindRSS, "azure-empty.xml", "https://azure.status.microsoft/en-us/status", StateOperational, 0, nil},
		{dashboard.KindM365Consumer, "m365.json", "https://status.cloud.microsoft/", StateDegraded, 1, func(t *testing.T, p parsed) {
			if !strings.HasPrefix(p.Incidents[0].Title, "Microsoft 365 (Consumer): ") {
				t.Errorf("m365 = %+v", p.Incidents[0])
			}
		}},
		{dashboard.KindSlack, "slack.json", "https://slack-status.com/", StateDegraded, 2, func(t *testing.T, p parsed) {
			if p.Incidents[1].URL != "https://slack-status.com/" {
				t.Errorf("non-https incident URL must fall back to the page, got %q", p.Incidents[1].URL)
			}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.file, func(t *testing.T) {
			p, err := parse(dashboard.Feed{Kind: tt.kind, Page: tt.page}, fixture(t, tt.file))
			if err != nil {
				t.Fatal(err)
			}
			if p.State != tt.state || len(p.Incidents) != tt.incidents {
				t.Fatalf("state %s with %d incidents, want %s with %d: %+v", p.State, len(p.Incidents), tt.state, tt.incidents, p.Incidents)
			}
			if tt.check != nil {
				tt.check(t, p)
			}
		})
	}
	for _, kind := range []string{dashboard.KindStatuspage, dashboard.KindGoogle, dashboard.KindAWS, dashboard.KindRSS, dashboard.KindM365Consumer, dashboard.KindSlack} {
		if _, err := parse(dashboard.Feed{Kind: kind}, []byte("<html>maintenance</html>")); err == nil {
			t.Errorf("%s accepted an HTML page", kind)
		}
	}
}

func TestHandler(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/sp":
			_, _ = w.Write(fixture(t, "statuspage.json"))
		case "/rss":
			if !strings.Contains(r.Header.Get("Accept"), "rss") {
				t.Errorf("rss Accept = %q", r.Header.Get("Accept"))
			}
			_, _ = w.Write(fixture(t, "azure-empty.xml"))
		case "/html":
			_, _ = w.Write([]byte("<html>down for maintenance</html>"))
		default:
			w.WriteHeader(http.StatusServiceUnavailable)
		}
	}))
	defer srv.Close()
	// httptest serves plain http on 127.0.0.1; feeds are https-only in config files, but tests
	// inject the list directly.
	feeds := []dashboard.Feed{
		{ID: "sp", Name: "SP", Kind: dashboard.KindStatuspage, Page: "https://sp.test/", Feed: srv.URL + "/sp"},
		{ID: "rss", Name: "RSS", Kind: dashboard.KindRSS, Page: "https://rss.test/", Feed: srv.URL + "/rss"},
		{ID: "html", Name: "HTML", Kind: dashboard.KindGoogle, Page: "https://html.test/", Feed: srv.URL + "/html"},
		{ID: "down", Name: "Down", Kind: dashboard.KindSlack, Page: "https://down.test/", Feed: srv.URL + "/down"},
		{ID: "link", Name: "Link", Kind: dashboard.KindLink, Page: "https://link.test/"},
	}
	env := tooltest.New(t, &Tool{Feeds: feeds}, tooltest.Options{AllowPrivate: true})
	var out Result
	env.Get("/api/v1/status/cloud").Must(t).Decode(t, &out)
	want := map[string]string{"sp": StateDegraded, "rss": StateOperational, "html": StateUnknown, "down": StateUnknown, "link": StateLink}
	if len(out.Services) != len(feeds) || out.CheckedAt == "" {
		t.Fatalf("out = %+v", out)
	}
	for i, s := range out.Services {
		if s.ID != feeds[i].ID {
			t.Errorf("order: %d = %s", i, s.ID)
		}
		if s.State != want[s.ID] {
			t.Errorf("%s = %s (%s), want %s", s.ID, s.State, s.Error, want[s.ID])
		}
		if strings.Contains(s.Error, srv.URL) || strings.Contains(s.Error, "127.0.0.1") {
			t.Errorf("%s error leaks the feed URL: %q", s.ID, s.Error)
		}
	}
	if out.Services[2].Error == "" || out.Services[3].Error == "" {
		t.Errorf("errors missing: %+v", out.Services)
	}
}

func TestPrivateFeedBlocked(t *testing.T) {
	// A feed URL pointing into a private range must not be fetched (provider client policy).
	feeds := []dashboard.Feed{{ID: "x", Name: "X", Kind: dashboard.KindStatuspage, Page: "https://x.test/", Feed: "http://127.0.0.1:1/api/v2/summary.json"}}
	env := tooltest.New(t, &Tool{Feeds: feeds}, tooltest.Options{})
	var out Result
	env.Get("/api/v1/status/cloud").Must(t).Decode(t, &out)
	if out.Services[0].State != StateUnknown || out.Services[0].Error == "" {
		t.Errorf("private feed = %+v", out.Services[0])
	}
}

func TestConfigFallback(t *testing.T) {
	p := t.TempDir() + "/feeds.yml"
	if err := os.WriteFile(p, []byte("feeds: [{id: x, kind: nope}]"), 0o600); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(http.NotFoundHandler())
	defer srv.Close()
	tool := &Tool{}
	tooltest.New(t, tool, tooltest.Options{Env: map[string]string{"STATUS_FEEDS_FILE": p}})
	if tool.configErr == "" || len(tool.feeds) != len(dashboard.DefaultFeeds()) {
		t.Errorf("broken file: configErr=%q feeds=%d", tool.configErr, len(tool.feeds))
	}
	if strings.Contains(tool.configErr, p) {
		t.Errorf("config error leaks the path to visitors: %q", tool.configErr)
	}
}
