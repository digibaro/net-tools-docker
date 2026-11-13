package email

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/miekg/dns"

	"github.com/digibaro/net-tools-docker/apps/api/internal/tools/tooltest"
)

func fakeM365Zone(zone map[string][]string) func(context.Context, string, uint16) ([]dns.RR, error) {
	return func(_ context.Context, name string, qtype uint16) ([]dns.RR, error) {
		var out []dns.RR
		for _, line := range zone[name] {
			rr, err := dns.NewRR(name + ". 300 IN " + line)
			if err != nil {
				return nil, err
			}
			if rr.Header().Rrtype == qtype {
				out = append(out, rr)
			}
		}
		return out, nil
	}
}

func m365Login(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/getuserrealm.srf":
			login := r.URL.Query().Get("login")
			if !strings.HasPrefix(login, "nettools-probe@") {
				t.Errorf("unexpected probe login %q", login)
			}
			if strings.HasSuffix(login, "@fed.test") {
				_, _ = w.Write([]byte(`{"NameSpaceType":"Federated","FederationBrandName":"Fed","AuthURL":"https://sts.fed.test/adfs/ls/?username=x"}`))
				return
			}
			if strings.HasSuffix(login, "@none.test") {
				_, _ = w.Write([]byte(`{"NameSpaceType":"Unknown"}`))
				return
			}
			_, _ = w.Write([]byte(`{"NameSpaceType":"Managed","FederationBrandName":"Contoso"}`))
		case strings.HasPrefix(r.URL.Path, "/none.test/"):
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"invalid_tenant"}`))
		case strings.HasSuffix(r.URL.Path, "/v2.0/.well-known/openid-configuration"):
			_, _ = w.Write([]byte(`{"issuer":"https://login.microsoftonline.com/6babcaad-604b-40ac-a9d7-9fd97c0b779f/v2.0","tenant_region_scope":"EU","cloud_instance_name":"microsoftonline.com"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestM365(t *testing.T) {
	zone := map[string][]string{
		"contoso.test":                        {"MX 0 contoso-test.mail.protection.outlook.com.", `TXT "v=spf1 include:spf.protection.outlook.com -all"`, `TXT "MS=ms12345678"`, `TXT "google-site-verification=x"`},
		"autodiscover.contoso.test":           {"CNAME autodiscover.outlook.com."},
		"selector1._domainkey.contoso.test":   {"CNAME selector1-contoso-test._domainkey.contoso.onmicrosoft.com."},
		"selector2._domainkey.contoso.test":   {"CNAME selector2-contoso-test._domainkey.contoso.n-v1.dkim.mail.microsoft."},
		"_dmarc.contoso.test":                 {`TXT "v=DMARC1; p=reject"`},
		"enterpriseregistration.contoso.test": {"CNAME enterpriseregistration.windows.net."},
		"_sip._tls.contoso.test":              {"SRV 100 1 443 sipdir.online.lync.com."},
		// fed.test: mail filter in front, SPF without Microsoft, wrong autodiscover target.
		"fed.test":              {"MX 10 eu-smtp-inbound-1.mimecast.com.", `TXT "v=spf1 include:_netblocks.mimecast.com -all"`},
		"autodiscover.fed.test": {"CNAME mail.fed.test."},
		// mixed.test: one MX bypasses Exchange Online.
		"mixed.test": {"MX 0 mixed-test.mail.protection.outlook.com.", "MX 10 backup.mixed.test."},
	}
	login := m365Login(t)
	tool := &M365Tool{lookup: fakeM365Zone(zone), LoginBase: login.URL}
	env := tooltest.New(t, tool, tooltest.Options{AllowPrivate: true})

	byID := func(r M365Result) map[string]M365Check {
		m := map[string]M365Check{}
		for _, c := range r.Checks {
			m[c.ID] = c
		}
		return m
	}

	var r M365Result
	env.Get("/api/v1/email/m365?domain=Contoso.test").Must(t).Decode(t, &r)
	if !r.Tenant.Found || r.Tenant.ID != "6babcaad-604b-40ac-a9d7-9fd97c0b779f" || r.Tenant.Region != "EU" || r.Tenant.Namespace != "Managed" || !r.UsesExchange {
		t.Errorf("tenant = %+v usesExchange=%v", r.Tenant, r.UsesExchange)
	}
	want := map[string]string{
		"mx": "pass", "spf": "pass", "verification": "pass", "autodiscover": "pass", "dkim1": "pass", "dkim2": "pass",
		"dmarc": "pass", "enterpriseRegistration": "pass", "enterpriseEnrollment": "info", "lyncdiscover": "info", "sipTls": "pass",
	}
	got := byID(r)
	for id, status := range want {
		if got[id].Status != status {
			t.Errorf("contoso %s = %s (%v), want %s", id, got[id].Status, got[id].Found, status)
		}
	}
	if f := got["spf"].Found; len(f) != 1 || !strings.HasPrefix(f[0], "v=spf1") {
		t.Errorf("spf found = %v (other TXT records must be hidden)", f)
	}
	if f := got["sipTls"].Found; len(f) != 1 || f[0] != "100 1 443 sipdir.online.lync.com" {
		t.Errorf("srv found = %v", f)
	}

	env.Get("/api/v1/email/m365?domain=fed.test").Must(t).Decode(t, &r)
	got = byID(r)
	if r.Tenant.Namespace != "Federated" || r.Tenant.FederationHost != "sts.fed.test" || r.UsesExchange {
		t.Errorf("fed tenant = %+v", r.Tenant)
	}
	for id, status := range map[string]string{"mx": "info", "spf": "fail", "autodiscover": "fail", "dkim1": "warn", "dmarc": "warn"} {
		if got[id].Status != status {
			t.Errorf("fed %s = %s, want %s", id, got[id].Status, status)
		}
	}

	env.Get("/api/v1/email/m365?domain=mixed.test").Must(t).Decode(t, &r)
	if byID(r)["mx"].Status != "warn" || !r.UsesExchange {
		t.Errorf("mixed mx = %+v", byID(r)["mx"])
	}

	env.Get("/api/v1/email/m365?domain=none.test").Must(t).Decode(t, &r)
	if r.Tenant.Found || r.Tenant.Error != "" || r.Tenant.Namespace != "Unknown" {
		t.Errorf("none tenant = %+v (a 400 invalid_tenant means no tenant, not an error)", r.Tenant)
	}

	env.Get("/api/v1/email/m365?domain=localhost").ExpectError(t, "INVALID_INPUT")
	env.Get("/api/v1/email/m365").ExpectError(t, "INVALID_INPUT")
}
