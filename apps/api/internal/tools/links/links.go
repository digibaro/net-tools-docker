// Package links implements DASH-02: an admin-maintained list of quick links (admin portals,
// provider control panels, outage pages), read from LINKS_FILE. Nothing is fetched; the browser
// just renders the list.
package links

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/digibaro/net-tools-docker/apps/api/internal/dashboard"
	"github.com/digibaro/net-tools-docker/apps/api/internal/httpapi"
	"github.com/digibaro/net-tools-docker/apps/api/internal/limits"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools"
)

// Tool is dash.links.
type Tool struct {
	result Result
}

func (*Tool) ID() string                                { return "dash.links" }
func (*Tool) Enabled(d tools.Deps) (bool, tools.Reason) { return tools.Always(d) }

// Result is the DASH-02 payload. Custom is false while the built-in examples are shown.
type Result struct {
	Links       []dashboard.Link `json:"links"`
	Custom      bool             `json:"custom"`
	ConfigError string           `json:"configError"`
}

func (t *Tool) Mount(r chi.Router, d tools.Deps) {
	path := dashboard.ResolvePath(d.Config.Features.LinksFile, d.Config.DataDir, dashboard.LinksFileName)
	list, err := dashboard.LoadLinks(path)
	t.result = Result{Links: list, Custom: path != "" && err == nil}
	if err != nil {
		d.Logger.Warn("LINKS_FILE ignored, using the built-in links", slog.Any("err", err))
		t.result.ConfigError = "LINKS_FILE could not be used; showing the built-in list (see the api log)"
	}
	r.With(d.RateLimit(limits.Light)).Get("/links", t.handle)
}

func (t *Tool) handle(w http.ResponseWriter, r *http.Request) {
	httpapi.JSON(w, r, t.result, &httpapi.Meta{Tool: t.ID(), Vantage: "server"})
}
