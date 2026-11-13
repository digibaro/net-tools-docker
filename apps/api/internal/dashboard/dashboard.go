// Package dashboard loads the admin-editable lists behind the dashboard tools: cloud status feeds
// (DASH-01, STATUS_FEEDS_FILE) and quick links (DASH-02, LINKS_FILE). Both are YAML (JSON is valid
// YAML too); without a file the built-in defaults apply. A broken file never stops the server: the
// defaults are used and the tool reports the problem.
package dashboard

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"go.yaml.in/yaml/v3"
)

// Feed kinds understood by the cloud status tool.
const (
	KindStatuspage   = "statuspage"   // Atlassian Statuspage / incident.io: <base>/api/v2/summary.json
	KindGoogle       = "google"       // Google Workspace / Cloud incidents.json
	KindAWS          = "aws"          // AWS Health public currentevents (UTF-16 JSON)
	KindRSS          = "rss"          // RSS 2.0 / Atom: every item is an active incident (Azure)
	KindM365Consumer = "m365consumer" // status.cloud.microsoft/api/posts/<workload>
	KindSlack        = "slack"        // slack-status.com/api/v2.0.0/current
	KindLink         = "link"         // no machine-readable feed: shown as a link only
)

var kinds = map[string]bool{KindStatuspage: true, KindGoogle: true, KindAWS: true, KindRSS: true, KindM365Consumer: true, KindSlack: true, KindLink: true}

// Feed is one status source.
type Feed struct {
	ID    string `yaml:"id" json:"id"`
	Name  string `yaml:"name" json:"name"`
	Kind  string `yaml:"kind" json:"kind"`
	Group string `yaml:"group" json:"group"`
	// Page is the human status page; Feed the machine-readable URL (empty for links).
	Page string `yaml:"page" json:"page"`
	Feed string `yaml:"feed" json:"-"`
}

// Link is one quick link.
type Link struct {
	Name        string `yaml:"name" json:"name"`
	URL         string `yaml:"url" json:"url"`
	Description string `yaml:"description" json:"description"`
	Group       string `yaml:"group" json:"group"`
}

// Default file names looked up in DATA_DIR when the variable is not set.
const (
	FeedsFileName = "status-feeds.yml"
	LinksFileName = "links.yml"
)

// ResolvePath returns the explicit path, else dataDir/name when that file exists, else "".
func ResolvePath(explicit, dataDir, name string) string {
	if explicit != "" {
		return explicit
	}
	if dataDir == "" {
		return ""
	}
	p := filepath.Join(dataDir, name)
	if st, err := os.Stat(p); err == nil && st.Mode().IsRegular() {
		return p
	}
	return ""
}

// MaxItems bounds both lists (a status refresh fans out to every feed).
const MaxItems = 60

var idRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,40}$`)

// LoadFeeds reads STATUS_FEEDS_FILE. An empty path returns the defaults.
func LoadFeeds(path string) ([]Feed, error) {
	if path == "" {
		return DefaultFeeds(), nil
	}
	var doc struct {
		Feeds []Feed `yaml:"feeds"`
	}
	if err := readYAML(path, &doc); err != nil {
		return DefaultFeeds(), err
	}
	if err := validateFeeds(doc.Feeds); err != nil {
		return DefaultFeeds(), fmt.Errorf("%s: %w", path, err)
	}
	return doc.Feeds, nil
}

// LoadLinks reads LINKS_FILE. An empty path returns the defaults.
func LoadLinks(path string) ([]Link, error) {
	if path == "" {
		return DefaultLinks(), nil
	}
	var doc struct {
		Links []Link `yaml:"links"`
	}
	if err := readYAML(path, &doc); err != nil {
		return DefaultLinks(), err
	}
	if err := validateLinks(doc.Links); err != nil {
		return DefaultLinks(), fmt.Errorf("%s: %w", path, err)
	}
	return doc.Links, nil
}

func readYAML(path string, out any) error {
	b, err := os.ReadFile(path) //nolint:gosec // admin-configured path
	if err != nil {
		return fmt.Errorf("read %w", err)
	}
	if err := yaml.Unmarshal(b, out); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	return nil
}

// httpsURL accepts absolute http(s) URLs only (no javascript:, data:, relative paths).
func httpsURL(raw string, allowHTTP bool) error {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil {
		return fmt.Errorf("%q is not an absolute URL", raw)
	}
	if u.Scheme != "https" && (!allowHTTP || u.Scheme != "http") {
		return fmt.Errorf("%q: only https URLs are allowed", raw)
	}
	return nil
}

func validateFeeds(feeds []Feed) error {
	if len(feeds) == 0 {
		return errors.New("no feeds listed (expected a top-level feeds: list)")
	}
	if len(feeds) > MaxItems {
		return fmt.Errorf("%d feeds, at most %d", len(feeds), MaxItems)
	}
	seen := map[string]bool{}
	for i, f := range feeds {
		at := fmt.Sprintf("feed %d", i+1)
		if !idRe.MatchString(f.ID) {
			return fmt.Errorf("%s: id %q must be lower-case letters, digits and dashes", at, f.ID)
		}
		if seen[f.ID] {
			return fmt.Errorf("%s: duplicate id %q", at, f.ID)
		}
		seen[f.ID] = true
		if strings.TrimSpace(f.Name) == "" {
			return fmt.Errorf("%s (%s): name is required", at, f.ID)
		}
		if !kinds[f.Kind] {
			return fmt.Errorf("%s (%s): unknown kind %q", at, f.ID, f.Kind)
		}
		if err := httpsURL(f.Page, false); err != nil {
			return fmt.Errorf("%s (%s) page: %w", at, f.ID, err)
		}
		if f.Kind != KindLink {
			if err := httpsURL(f.Feed, false); err != nil {
				return fmt.Errorf("%s (%s) feed: %w", at, f.ID, err)
			}
		}
	}
	return nil
}

func validateLinks(links []Link) error {
	if len(links) == 0 {
		return errors.New("no links listed (expected a top-level links: list)")
	}
	if len(links) > MaxItems*2 {
		return fmt.Errorf("%d links, at most %d", len(links), MaxItems*2)
	}
	for i, l := range links {
		if strings.TrimSpace(l.Name) == "" {
			return fmt.Errorf("link %d: name is required", i+1)
		}
		// Intranet links (a NAS, a router UI) are often plain http.
		if err := httpsURL(l.URL, true); err != nil {
			return fmt.Errorf("link %d (%s): %w", i+1, l.Name, err)
		}
	}
	return nil
}

// DefaultFeeds are public, keyless status feeds of widely used cloud services.
func DefaultFeeds() []Feed {
	sp := func(id, name, group, page string) Feed {
		return Feed{ID: id, Name: name, Kind: KindStatuspage, Group: group, Page: page, Feed: strings.TrimSuffix(page, "/") + "/api/v2/summary.json"}
	}
	return []Feed{
		{ID: "m365", Name: "Microsoft 365 (consumer)", Kind: KindM365Consumer, Group: "microsoft", Page: "https://status.cloud.microsoft/", Feed: "https://status.cloud.microsoft/api/posts/m365Consumer"},
		{ID: "m365-admin", Name: "Microsoft 365 (your tenant)", Kind: KindLink, Group: "microsoft", Page: "https://admin.microsoft.com/#/servicehealth"},
		{ID: "azure", Name: "Microsoft Azure", Kind: KindRSS, Group: "microsoft", Page: "https://azure.status.microsoft/en-us/status", Feed: "https://azure.status.microsoft/en-us/status/feed/"},
		{ID: "google-workspace", Name: "Google Workspace", Kind: KindGoogle, Group: "google", Page: "https://www.google.com/appsstatus/dashboard/", Feed: "https://www.google.com/appsstatus/dashboard/incidents.json"},
		{ID: "google-cloud", Name: "Google Cloud", Kind: KindGoogle, Group: "google", Page: "https://status.cloud.google.com/", Feed: "https://status.cloud.google.com/incidents.json"},
		{ID: "aws", Name: "Amazon Web Services", Kind: KindAWS, Group: "cloud", Page: "https://health.aws.amazon.com/health/status", Feed: "https://health.aws.amazon.com/public/currentevents"},
		sp("cloudflare", "Cloudflare", "cloud", "https://www.cloudflarestatus.com"),
		sp("github", "GitHub", "dev", "https://www.githubstatus.com"),
		sp("atlassian", "Atlassian", "dev", "https://status.atlassian.com"),
		sp("openai", "OpenAI", "ai", "https://status.openai.com"),
		sp("anthropic", "Claude (Anthropic)", "ai", "https://status.claude.com"),
		{ID: "slack", Name: "Slack", Kind: KindSlack, Group: "collab", Page: "https://slack-status.com/", Feed: "https://slack-status.com/api/v2.0.0/current"},
		sp("zoom", "Zoom", "collab", "https://www.zoomstatus.com"),
		sp("dropbox", "Dropbox", "collab", "https://status.dropbox.com"),
		sp("discord", "Discord", "collab", "https://discordstatus.com"),
		{ID: "meta", Name: "WhatsApp / Meta", Kind: KindLink, Group: "collab", Page: "https://metastatus.com/"},
	}
}

// DefaultLinks are common admin portals; replace them with LINKS_FILE.
func DefaultLinks() []Link {
	return []Link{
		{Name: "Microsoft 365 admin center", URL: "https://admin.microsoft.com/", Group: "Microsoft"},
		{Name: "Microsoft Entra admin center", URL: "https://entra.microsoft.com/", Group: "Microsoft"},
		{Name: "Microsoft Intune", URL: "https://intune.microsoft.com/", Group: "Microsoft"},
		{Name: "Microsoft Defender", URL: "https://security.microsoft.com/", Group: "Microsoft"},
		{Name: "Exchange admin center", URL: "https://admin.exchange.microsoft.com/", Group: "Microsoft"},
		{Name: "Azure portal", URL: "https://portal.azure.com/", Group: "Microsoft"},
		{Name: "Google Admin console", URL: "https://admin.google.com/", Group: "Google"},
		{Name: "Google Cloud console", URL: "https://console.cloud.google.com/", Group: "Google"},
		{Name: "AWS Management Console", URL: "https://console.aws.amazon.com/", Group: "Cloud"},
		{Name: "Cloudflare dashboard", URL: "https://dash.cloudflare.com/", Group: "Cloud"},
	}
}
