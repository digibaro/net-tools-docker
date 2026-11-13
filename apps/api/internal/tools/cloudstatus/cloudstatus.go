// Package cloudstatus implements DASH-01: the current state of widely used cloud services, read from
// their public status feeds (Statuspage, Google, AWS Health, RSS, Microsoft 365, Slack). The list
// is admin-configurable (STATUS_FEEDS_FILE); every fetch goes through the provider client
// (policy-checked, cached, size- and time-bounded).
package cloudstatus

import (
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/digibaro/net-tools-docker/apps/api/internal/dashboard"
	"github.com/digibaro/net-tools-docker/apps/api/internal/httpapi"
	"github.com/digibaro/net-tools-docker/apps/api/internal/limits"
	"github.com/digibaro/net-tools-docker/apps/api/internal/providers"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools"
)

// CacheTTL is how long a feed answer is reused; status pages change slowly and are shared by
// every visitor of the page.
const CacheTTL = 2 * time.Minute

// Provider names the upstream in provider status (one entry for all feeds).
const Provider = "Status feeds"

// Tool is status.cloud.
type Tool struct {
	deps      tools.Deps
	feeds     []dashboard.Feed
	configErr string
	// Feeds overrides the configured list (tests).
	Feeds []dashboard.Feed
}

func (*Tool) ID() string                                { return "status.cloud" }
func (*Tool) Enabled(d tools.Deps) (bool, tools.Reason) { return tools.Always(d) }

func (t *Tool) Mount(r chi.Router, d tools.Deps) {
	t.deps = d
	t.feeds = t.Feeds
	if t.feeds == nil {
		feeds, err := dashboard.LoadFeeds(dashboard.ResolvePath(d.Config.Features.StatusFeedsFile, d.Config.DataDir, dashboard.FeedsFileName))
		if err != nil {
			// The path is admin-chosen and not secret; the defaults are used instead.
			d.Logger.Warn("STATUS_FEEDS_FILE ignored, using the built-in feeds", slog.Any("err", err))
			t.configErr = "STATUS_FEEDS_FILE could not be used; showing the built-in list (see the api log)"
		}
		t.feeds = feeds
	}
	r.With(d.RateLimit(limits.Light), d.Slot, d.Timeout(25*time.Second)).Get("/status/cloud", t.handle)
}

// Service is one feed's normalized state.
type Service struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Group      string     `json:"group"`
	Kind       string     `json:"kind"`
	Page       string     `json:"page"`
	State      string     `json:"state"`
	Incidents  []Incident `json:"incidents"`
	Components []string   `json:"components"`
	Error      string     `json:"error"`
}

// Result is the DASH-01 payload.
type Result struct {
	CheckedAt   string    `json:"checkedAt"`
	Services    []Service `json:"services"`
	ConfigError string    `json:"configError"`
}

func (t *Tool) fetch(r *http.Request, f dashboard.Feed) Service {
	s := Service{ID: f.ID, Name: f.Name, Group: f.Group, Kind: f.Kind, Page: f.Page, Incidents: []Incident{}, Components: []string{}}
	if f.Kind == dashboard.KindLink {
		s.State = StateLink
		return s
	}
	req := providers.Request{Provider: Provider, URL: f.Feed, TTL: CacheTTL, Timeout: 15 * time.Second}
	if f.Kind == dashboard.KindRSS {
		req.Header = http.Header{"Accept": {"application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5"}}
	}
	body, err := t.deps.Providers.Get(r.Context(), req)
	if err != nil {
		s.State = StateUnknown
		s.Error = httpapi.ToAPIError(err).Message
		return s
	}
	p, err := parse(f, body)
	if err != nil {
		s.State = StateUnknown
		s.Error = "the status feed returned an unexpected format"
		t.deps.Logger.Debug("status feed parse failed", slog.String("feed", f.ID), slog.Any("err", err))
		return s
	}
	s.State, s.Incidents = p.State, p.Incidents
	if p.Components != nil {
		s.Components = p.Components
	}
	return s
}

func (t *Tool) handle(w http.ResponseWriter, r *http.Request) {
	out := Result{Services: make([]Service, len(t.feeds)), ConfigError: t.configErr}
	var wg sync.WaitGroup
	for i, f := range t.feeds {
		wg.Go(func() { out.Services[i] = t.fetch(r, f) })
	}
	wg.Wait()
	out.CheckedAt = time.Now().UTC().Format(time.RFC3339)
	httpapi.JSON(w, r, out, &httpapi.Meta{Tool: t.ID(), Vantage: "public status feeds"})
}
