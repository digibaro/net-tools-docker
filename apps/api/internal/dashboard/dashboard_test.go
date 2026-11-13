package dashboard

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func write(t *testing.T, content string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "f.yml")
	if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestDefaultsAreValid(t *testing.T) {
	if err := validateFeeds(DefaultFeeds()); err != nil {
		t.Error(err)
	}
	if err := validateLinks(DefaultLinks()); err != nil {
		t.Error(err)
	}
	f, err := LoadFeeds("")
	if err != nil || len(f) != len(DefaultFeeds()) {
		t.Errorf("LoadFeeds(\"\") = %d, %v", len(f), err)
	}
}

func TestLoadFeeds(t *testing.T) {
	tests := []struct {
		name, yaml, wantErr string
		wantN               int
	}{
		{"valid", "feeds:\n  - {id: gh, name: GitHub, kind: statuspage, page: 'https://www.githubstatus.com', feed: 'https://www.githubstatus.com/api/v2/summary.json'}\n  - {id: transip, name: TransIP, kind: link, page: 'https://www.transip-status.nl/'}\n", "", 2},
		{"json is yaml", `{"feeds":[{"id":"x","name":"X","kind":"link","page":"https://x.test/"}]}`, "", 1},
		{"empty", "feeds: []\n", "no feeds", 0},
		{"bad kind", "feeds:\n  - {id: a, name: A, kind: rss2, page: 'https://a.test/', feed: 'https://a.test/f'}\n", "unknown kind", 0},
		{"bad id", "feeds:\n  - {id: 'A B', name: A, kind: link, page: 'https://a.test/'}\n", "id", 0},
		{"dup id", "feeds:\n  - {id: a, name: A, kind: link, page: 'https://a.test/'}\n  - {id: a, name: B, kind: link, page: 'https://b.test/'}\n", "duplicate", 0},
		{"http feed", "feeds:\n  - {id: a, name: A, kind: rss, page: 'https://a.test/', feed: 'http://a.test/f'}\n", "only https", 0},
		{"js page", "feeds:\n  - {id: a, name: A, kind: link, page: 'javascript:alert(1)'}\n", "absolute URL", 0},
		{"missing feed", "feeds:\n  - {id: a, name: A, kind: rss, page: 'https://a.test/'}\n", "feed", 0},
		{"broken yaml", "feeds: [\n", "yaml", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := LoadFeeds(write(t, tt.yaml))
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("err = %v, want %q", err, tt.wantErr)
				}
				if len(got) != len(DefaultFeeds()) {
					t.Errorf("a broken file must fall back to the defaults, got %d feeds", len(got))
				}
				return
			}
			if err != nil || len(got) != tt.wantN {
				t.Fatalf("got %d feeds, err %v", len(got), err)
			}
		})
	}
	if _, err := LoadFeeds(filepath.Join(t.TempDir(), "missing.yml")); err == nil {
		t.Error("missing file must be reported")
	}
}

func TestLoadLinks(t *testing.T) {
	got, err := LoadLinks(write(t, "links:\n  - {name: NAS, url: 'http://nas.lan:5000/', group: Thuis}\n  - {name: TransIP, url: 'https://www.transip.nl/cp/', description: Domeinen}\n"))
	if err != nil || len(got) != 2 || got[0].Group != "Thuis" || got[1].Description != "Domeinen" {
		t.Fatalf("links = %+v, %v", got, err)
	}
	for _, bad := range []string{"links:\n  - {name: X, url: 'javascript:alert(1)'}\n", "links:\n  - {name: '', url: 'https://x.test/'}\n", "links:\n  - {name: X, url: 'ftp://x.test/'}\n", "links:\n  - {name: X, url: 'https://u:p@x.test/'}\n"} {
		if _, err := LoadLinks(write(t, bad)); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}

func TestResolvePath(t *testing.T) {
	dir := t.TempDir()
	if got := ResolvePath("/explicit.yml", dir, LinksFileName); got != "/explicit.yml" {
		t.Errorf("explicit = %q", got)
	}
	if got := ResolvePath("", dir, LinksFileName); got != "" {
		t.Errorf("missing file = %q", got)
	}
	p := filepath.Join(dir, LinksFileName)
	if err := os.WriteFile(p, []byte("links: []"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := ResolvePath("", dir, LinksFileName); got != p {
		t.Errorf("data dir file = %q", got)
	}
	if got := ResolvePath("", "", LinksFileName); got != "" {
		t.Errorf("no data dir = %q", got)
	}
}

// The example files shipped in data/ must load.
func TestExampleFiles(t *testing.T) {
	if f, err := LoadFeeds("../../../../data/status-feeds.example.yml"); err != nil || len(f) < 5 {
		t.Errorf("status-feeds.example.yml: %d feeds, %v", len(f), err)
	}
	if l, err := LoadLinks("../../../../data/links.example.yml"); err != nil || len(l) < 2 {
		t.Errorf("links.example.yml: %d links, %v", len(l), err)
	}
}
