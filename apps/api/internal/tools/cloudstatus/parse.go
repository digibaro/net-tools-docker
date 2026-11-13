package cloudstatus

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/digibaro/net-tools-docker/apps/api/internal/dashboard"
)

// States, worst last (see worse).
const (
	StateOperational = "operational"
	StateMaintenance = "maintenance"
	StateDegraded    = "degraded"
	StateOutage      = "outage"
	StateUnknown     = "unknown"
	StateLink        = "link"
)

var rank = map[string]int{StateOperational: 0, StateMaintenance: 1, StateDegraded: 2, StateOutage: 3}

func worse(a, b string) string {
	if rank[b] > rank[a] {
		return b
	}
	return a
}

// Incident is one active incident or maintenance, normalized across feed kinds.
type Incident struct {
	Title string `json:"title"`
	// Impact: outage, degraded, maintenance or info.
	Impact  string `json:"impact"`
	Status  string `json:"status"`
	Started string `json:"started"`
	Updated string `json:"updated"`
	URL     string `json:"url"`
}

// parsed is what one feed says.
type parsed struct {
	State     string
	Incidents []Incident
	// Components lists affected components (Statuspage), capped.
	Components []string
}

const maxIncidents = 10

func parse(f dashboard.Feed, body []byte) (parsed, error) {
	switch f.Kind {
	case dashboard.KindStatuspage:
		return parseStatuspage(body, f.Page)
	case dashboard.KindGoogle:
		return parseGoogle(body, f.Page)
	case dashboard.KindAWS:
		return parseAWS(body, f.Page)
	case dashboard.KindRSS:
		return parseRSS(body, f.Page)
	case dashboard.KindM365Consumer:
		return parseM365(body, f.Page)
	case dashboard.KindSlack:
		return parseSlack(body, f.Page)
	}
	return parsed{}, fmt.Errorf("unsupported kind %q", f.Kind)
}

func capped(in []Incident) []Incident {
	if in == nil {
		return []Incident{}
	}
	if len(in) > maxIncidents {
		return in[:maxIncidents]
	}
	return in
}

// parseStatuspage reads <page>/api/v2/summary.json (Atlassian Statuspage; incident.io pages serve
// the same shape).
func parseStatuspage(body []byte, page string) (parsed, error) {
	var d struct {
		Status struct {
			Indicator string `json:"indicator"`
		} `json:"status"`
		Components []struct {
			Name   string `json:"name"`
			Status string `json:"status"`
			Group  bool   `json:"group"`
		} `json:"components"`
		Incidents []spIncident `json:"incidents"`
		Maint     []spIncident `json:"scheduled_maintenances"`
	}
	if err := json.Unmarshal(body, &d); err != nil {
		return parsed{}, fmt.Errorf("statuspage: %w", err)
	}
	if d.Status.Indicator == "" {
		return parsed{}, errors.New("statuspage: no status indicator")
	}
	out := parsed{State: map[string]string{"none": StateOperational, "minor": StateDegraded, "major": StateOutage, "critical": StateOutage, "maintenance": StateMaintenance}[d.Status.Indicator]}
	if out.State == "" {
		out.State = StateUnknown
	}
	for _, i := range d.Incidents {
		out.Incidents = append(out.Incidents, i.normalize(page, false))
	}
	for _, i := range d.Maint {
		if i.Status == "in_progress" || i.Status == "verifying" {
			out.Incidents = append(out.Incidents, i.normalize(page, true))
		}
	}
	for _, c := range d.Components {
		if !c.Group && c.Status != "" && c.Status != "operational" && len(out.Components) < 20 {
			out.Components = append(out.Components, c.Name)
		}
	}
	out.Incidents = capped(out.Incidents)
	return out, nil
}

type spIncident struct {
	Name      string `json:"name"`
	Status    string `json:"status"`
	Impact    string `json:"impact"`
	CreatedAt string `json:"created_at"`
	StartedAt string `json:"started_at"`
	UpdatedAt string `json:"updated_at"`
	Shortlink string `json:"shortlink"`
}

func (i spIncident) normalize(page string, maint bool) Incident {
	impact := map[string]string{"none": "info", "minor": StateDegraded, "major": StateOutage, "critical": StateOutage, "maintenance": StateMaintenance}[i.Impact]
	if maint {
		impact = StateMaintenance
	}
	if impact == "" {
		impact = "info"
	}
	started := i.StartedAt
	if started == "" {
		started = i.CreatedAt
	}
	u := i.Shortlink
	if u == "" {
		u = page
	}
	return Incident{Title: i.Name, Impact: impact, Status: i.Status, Started: started, Updated: i.UpdatedAt, URL: u}
}

// parseGoogle reads incidents.json (Workspace and Cloud): incidents without an end are active.
func parseGoogle(body []byte, page string) (parsed, error) {
	var d []struct {
		Begin        string `json:"begin"`
		End          string `json:"end"`
		Modified     string `json:"modified"`
		ExternalDesc string `json:"external_desc"`
		StatusImpact string `json:"status_impact"`
		ServiceName  string `json:"service_name"`
		URI          string `json:"uri"`
		Recent       struct {
			Status string `json:"status"`
		} `json:"most_recent_update"`
	}
	if err := json.Unmarshal(body, &d); err != nil {
		return parsed{}, fmt.Errorf("google: %w", err)
	}
	out := parsed{State: StateOperational}
	for _, i := range d {
		if i.End != "" {
			continue
		}
		impact := map[string]string{"SERVICE_OUTAGE": StateOutage, "SERVICE_DISRUPTION": StateDegraded}[i.StatusImpact]
		if impact == "" {
			impact = "info"
		} else {
			out.State = worse(out.State, impact)
		}
		title := firstLine(strings.TrimPrefix(strings.TrimSpace(i.ExternalDesc), "**Summary:**"))
		if i.ServiceName != "" {
			title = i.ServiceName + ": " + title
		}
		u := page
		if i.URI != "" {
			u = strings.TrimSuffix(page, "/") + "/" + strings.TrimPrefix(i.URI, "/")
		}
		out.Incidents = append(out.Incidents, Incident{Title: title, Impact: impact, Status: strings.ToLower(i.Recent.Status), Started: i.Begin, Updated: i.Modified, URL: u})
	}
	out.Incidents = capped(out.Incidents)
	return out, nil
}

// decodeUTF16 converts the AWS feed (UTF-16 with a byte-order mark) to UTF-8; other input is
// returned unchanged.
func decodeUTF16(b []byte) []byte {
	if len(b) < 2 {
		return b
	}
	var be bool
	switch {
	case b[0] == 0xFE && b[1] == 0xFF:
		be = true
	case b[0] == 0xFF && b[1] == 0xFE:
	default:
		return b
	}
	b = b[2:]
	u := make([]uint16, 0, len(b)/2)
	for i := 0; i+1 < len(b); i += 2 {
		if be {
			u = append(u, uint16(b[i])<<8|uint16(b[i+1]))
		} else {
			u = append(u, uint16(b[i+1])<<8|uint16(b[i]))
		}
	}
	return []byte(string(utf16.Decode(u)))
}

// parseAWS reads health.aws.amazon.com/public/currentevents. Status: 0 resolved, 1 informational,
// 2 degraded, 3 disruption.
func parseAWS(body []byte, page string) (parsed, error) {
	var d []struct {
		Date        string `json:"date"`
		Status      string `json:"status"`
		ServiceName string `json:"service_name"`
		RegionName  string `json:"region_name"`
		Summary     string `json:"summary"`
		Log         []struct {
			Summary   string `json:"summary"`
			Timestamp int64  `json:"timestamp"`
		} `json:"event_log"`
	}
	if err := json.Unmarshal(bytes.TrimSpace(decodeUTF16(body)), &d); err != nil {
		return parsed{}, fmt.Errorf("aws: %w", err)
	}
	out := parsed{State: StateOperational}
	for _, e := range d {
		impact := map[string]string{"1": "info", "2": StateDegraded, "3": StateOutage}[e.Status]
		if impact == "" {
			continue
		}
		if impact != "info" {
			out.State = worse(out.State, impact)
		}
		title := e.ServiceName
		if e.RegionName != "" {
			title += " (" + e.RegionName + ")"
		}
		if s := e.Summary; s != "" {
			title += ": " + s
		}
		i := Incident{Title: title, Impact: impact, URL: page, Started: unixToRFC3339(e.Date)}
		if n := len(e.Log); n > 0 {
			i.Status = e.Log[n-1].Summary
			i.Updated = time.Unix(e.Log[n-1].Timestamp, 0).UTC().Format(time.RFC3339)
		}
		out.Incidents = append(out.Incidents, i)
	}
	out.Incidents = capped(out.Incidents)
	return out, nil
}

func unixToRFC3339(s string) string {
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return ""
	}
	return time.Unix(n, 0).UTC().Format(time.RFC3339)
}

// parseRSS treats every item of an RSS 2.0 or Atom feed as an active incident (Azure lists only
// current issues).
func parseRSS(body []byte, page string) (parsed, error) {
	var d struct {
		XMLName xml.Name
		Items   []struct {
			Title   string `xml:"title"`
			Link    string `xml:"link"`
			PubDate string `xml:"pubDate"`
		} `xml:"channel>item"`
		Entries []struct {
			Title   string `xml:"title"`
			Updated string `xml:"updated"`
			Link    struct {
				Href string `xml:"href,attr"`
			} `xml:"link"`
		} `xml:"entry"`
	}
	if err := xml.Unmarshal(body, &d); err != nil {
		return parsed{}, fmt.Errorf("rss: %w", err)
	}
	if d.XMLName.Local != "rss" && d.XMLName.Local != "feed" {
		return parsed{}, fmt.Errorf("rss: unexpected root element <%s>", d.XMLName.Local)
	}
	out := parsed{State: StateOperational}
	add := func(title, link, when string) {
		if link == "" || !strings.HasPrefix(link, "https://") {
			link = page
		}
		out.Incidents = append(out.Incidents, Incident{Title: strings.TrimSpace(title), Impact: StateDegraded, Started: rssTime(when), URL: link})
		out.State = StateDegraded
	}
	for _, i := range d.Items {
		add(i.Title, i.Link, i.PubDate)
	}
	for _, e := range d.Entries {
		add(e.Title, e.Link.Href, e.Updated)
	}
	out.Incidents = capped(out.Incidents)
	return out, nil
}

func rssTime(s string) string {
	for _, layout := range []string{time.RFC1123Z, time.RFC1123, time.RFC3339, "Mon, 2 Jan 2006 15:04:05 Z"} {
		if t, err := time.Parse(layout, strings.TrimSpace(s)); err == nil {
			return t.UTC().Format(time.RFC3339)
		}
	}
	return ""
}

// parseM365 reads status.cloud.microsoft/api/posts/<workload>: one entry per service.
func parseM365(body []byte, page string) (parsed, error) {
	var d []struct {
		Service string `json:"ServiceDisplayName"`
		Status  string `json:"Status"`
		Title   string `json:"Title"`
		Updated string `json:"LastUpdatedTime"`
	}
	if err := json.Unmarshal(body, &d); err != nil {
		return parsed{}, fmt.Errorf("m365: %w", err)
	}
	if len(d) == 0 {
		return parsed{}, errors.New("m365: empty service list")
	}
	out := parsed{State: StateOperational}
	for _, s := range d {
		st := strings.ToLower(s.Status)
		if st == "operational" || st == "" {
			continue
		}
		impact := StateDegraded
		if strings.Contains(st, "interruption") || strings.Contains(st, "outage") {
			impact = StateOutage
		}
		out.State = worse(out.State, impact)
		title := s.Service
		if s.Title != "" {
			title += ": " + s.Title
		}
		out.Incidents = append(out.Incidents, Incident{Title: title, Impact: impact, Status: s.Status, Updated: s.Updated, URL: page})
	}
	out.Incidents = capped(out.Incidents)
	return out, nil
}

// parseSlack reads slack-status.com/api/v2.0.0/current.
func parseSlack(body []byte, page string) (parsed, error) {
	var d struct {
		Status    string `json:"status"`
		Incidents []struct {
			Title   string `json:"title"`
			Type    string `json:"type"`
			Status  string `json:"status"`
			Created string `json:"date_created"`
			Updated string `json:"date_updated"`
			URL     string `json:"url"`
		} `json:"active_incidents"`
	}
	if err := json.Unmarshal(body, &d); err != nil {
		return parsed{}, fmt.Errorf("slack: %w", err)
	}
	if d.Status == "" {
		return parsed{}, errors.New("slack: no status")
	}
	out := parsed{State: StateOperational}
	for _, i := range d.Incidents {
		impact := map[string]string{"outage": StateOutage, "incident": StateDegraded, "notice": "info"}[i.Type]
		if impact == "" {
			impact = StateDegraded
		}
		if impact != "info" {
			out.State = worse(out.State, impact)
		}
		u := i.URL
		if !strings.HasPrefix(u, "https://") {
			u = page
		}
		out.Incidents = append(out.Incidents, Incident{Title: i.Title, Impact: impact, Status: i.Status, Started: i.Created, Updated: i.Updated, URL: u})
	}
	out.Incidents = capped(out.Incidents)
	return out, nil
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i]
	}
	if len(s) > 200 {
		s = s[:200] + "…"
	}
	return s
}
