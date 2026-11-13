package links

import (
	"os"
	"testing"

	"github.com/digibaro/net-tools-docker/apps/api/internal/dashboard"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools/tooltest"
)

func TestLinks(t *testing.T) {
	var out Result
	tooltest.New(t, &Tool{}, tooltest.Options{}).Get("/api/v1/links").Must(t).Decode(t, &out)
	if out.Custom || out.ConfigError != "" || len(out.Links) != len(dashboard.DefaultLinks()) {
		t.Errorf("defaults = %+v", out)
	}

	p := t.TempDir() + "/links.yml"
	if err := os.WriteFile(p, []byte("links:\n  - {name: Router, url: 'http://192.168.1.1/', group: LAN}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	tooltest.New(t, &Tool{}, tooltest.Options{Env: map[string]string{"LINKS_FILE": p}}).Get("/api/v1/links").Must(t).Decode(t, &out)
	if !out.Custom || len(out.Links) != 1 || out.Links[0].URL != "http://192.168.1.1/" {
		t.Errorf("custom = %+v", out)
	}

	if err := os.WriteFile(p, []byte("links:\n  - {name: Evil, url: 'javascript:alert(1)'}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	tooltest.New(t, &Tool{}, tooltest.Options{Env: map[string]string{"LINKS_FILE": p}}).Get("/api/v1/links").Must(t).Decode(t, &out)
	if out.Custom || out.ConfigError == "" || len(out.Links) != len(dashboard.DefaultLinks()) {
		t.Errorf("broken file = %+v", out)
	}
}
