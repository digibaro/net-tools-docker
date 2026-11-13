package email

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/miekg/dns"

	"github.com/digibaro/net-tools-docker/apps/api/internal/httpapi"
	"github.com/digibaro/net-tools-docker/apps/api/internal/limits"
	"github.com/digibaro/net-tools-docker/apps/api/internal/providers"
	"github.com/digibaro/net-tools-docker/apps/api/internal/tools"
)

// M365Tool is EM-13: the DNS records Microsoft 365 needs for a domain, plus the tenant behind it
// (Microsoft's public, keyless sign-in discovery endpoints).
type M365Tool struct {
	deps tools.Deps
	// lookup answers one DNS question (tests inject a fake); defaults to the system resolver.
	lookup func(ctx context.Context, name string, qtype uint16) ([]dns.RR, error)
	// LoginBase overrides https://login.microsoftonline.com (tests).
	LoginBase string
}

func (*M365Tool) ID() string                                { return "email.m365" }
func (*M365Tool) Enabled(d tools.Deps) (bool, tools.Reason) { return tools.Always(d) }

func (t *M365Tool) Mount(r chi.Router, d tools.Deps) {
	t.deps = d
	if t.lookup == nil {
		t.lookup = func(ctx context.Context, name string, qtype uint16) ([]dns.RR, error) {
			m, err := sysResolver{}.query(ctx, name, qtype)
			if err != nil {
				return nil, err
			}
			return m.Answer, nil
		}
	}
	if t.LoginBase == "" {
		t.LoginBase = "https://login.microsoftonline.com"
	}
	r.With(d.RateLimit(limits.Light), d.Slot, d.Timeout(25*time.Second)).Get("/email/m365", t.handle)
}

// M365Tenant is what Microsoft's discovery endpoints say about the domain.
type M365Tenant struct {
	Found bool   `json:"found"`
	ID    string `json:"id"`
	// Region is tenant_region_scope (NA, EU, WW, …); Cloud the cloud instance.
	Region string `json:"region"`
	Cloud  string `json:"cloud"`
	// Namespace is Managed (cloud identities), Federated (ADFS/third-party IdP) or Unknown.
	Namespace string `json:"namespace"`
	Brand     string `json:"brand"`
	// FederationHost is the host of the federated sign-in page (never the full URL).
	FederationHost string `json:"federationHost"`
	Error          string `json:"error"`
}

// M365Check is one expected record. Status: pass, warn, fail or info.
type M365Check struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Type     string   `json:"type"`
	Expected string   `json:"expected"`
	Found    []string `json:"found"`
	Status   string   `json:"status"`
}

// M365Result is the EM-13 payload.
type M365Result struct {
	Domain string      `json:"domain"`
	Tenant M365Tenant  `json:"tenant"`
	Checks []M365Check `json:"checks"`
	// UsesExchange: at least one MX points at Exchange Online.
	UsesExchange bool `json:"usesExchange"`
}

// m365Spec describes one record and how to judge it.
type m365Spec struct {
	id, prefix, typ, expected string
	qtype                     uint16
	// match reports whether one found value is what Microsoft 365 expects.
	match func(v, domain string) bool
	// missing is the status when nothing matches (warn for records most tenants need).
	missing string
}

func hasSuffixFold(v string, suffixes ...string) bool {
	v = strings.ToLower(strings.TrimSuffix(v, "."))
	return slices.ContainsFunc(suffixes, func(s string) bool { return strings.HasSuffix(v, s) })
}

func eqFold(want string) func(string, string) bool {
	return func(v, _ string) bool { return strings.EqualFold(strings.TrimSuffix(v, "."), want) }
}

func isExchangeMX(v string) bool {
	return hasSuffixFold(v, ".mail.protection.outlook.com", ".mx.microsoft")
}

// m365Specs follow Microsoft's "External DNS records for Microsoft 365" list.
var m365Specs = []m365Spec{
	{id: "mx", typ: "MX", qtype: dns.TypeMX, expected: "<tenant>.mail.protection.outlook.com", missing: "info", match: func(v, _ string) bool { return isExchangeMX(v) }},
	{id: "spf", typ: "TXT", qtype: dns.TypeTXT, expected: "v=spf1 include:spf.protection.outlook.com -all", missing: "warn", match: func(v, _ string) bool {
		return strings.HasPrefix(strings.ToLower(v), "v=spf1") && strings.Contains(strings.ToLower(v), "include:spf.protection.outlook.com")
	}},
	{id: "verification", typ: "TXT", qtype: dns.TypeTXT, expected: "MS=ms########", missing: "info", match: func(v, _ string) bool { return strings.HasPrefix(v, "MS=") }},
	{id: "autodiscover", prefix: "autodiscover", typ: "CNAME", qtype: dns.TypeCNAME, expected: "autodiscover.outlook.com", missing: "warn", match: eqFold("autodiscover.outlook.com")},
	{id: "dkim1", prefix: "selector1._domainkey", typ: "CNAME", qtype: dns.TypeCNAME, expected: "selector1-<domain>._domainkey.<tenant>.onmicrosoft.com", missing: "warn", match: dkimTarget},
	{id: "dkim2", prefix: "selector2._domainkey", typ: "CNAME", qtype: dns.TypeCNAME, expected: "selector2-<domain>._domainkey.<tenant>.onmicrosoft.com", missing: "warn", match: dkimTarget},
	{id: "dmarc", prefix: "_dmarc", typ: "TXT", qtype: dns.TypeTXT, expected: "v=DMARC1; p=…", missing: "warn", match: func(v, _ string) bool { return strings.HasPrefix(strings.ToLower(v), "v=dmarc1") }},
	{id: "enterpriseRegistration", prefix: "enterpriseregistration", typ: "CNAME", qtype: dns.TypeCNAME, expected: "enterpriseregistration.windows.net", missing: "info", match: eqFold("enterpriseregistration.windows.net")},
	{id: "enterpriseEnrollment", prefix: "enterpriseenrollment", typ: "CNAME", qtype: dns.TypeCNAME, expected: "enterpriseenrollment-s.manage.microsoft.com", missing: "info", match: func(v, _ string) bool {
		return hasSuffixFold(v, "manage.microsoft.com")
	}},
	{id: "lyncdiscover", prefix: "lyncdiscover", typ: "CNAME", qtype: dns.TypeCNAME, expected: "webdir.online.lync.com", missing: "info", match: eqFold("webdir.online.lync.com")},
	{id: "sip", prefix: "sip", typ: "CNAME", qtype: dns.TypeCNAME, expected: "sipdir.online.lync.com", missing: "info", match: eqFold("sipdir.online.lync.com")},
	{id: "sipTls", prefix: "_sip._tls", typ: "SRV", qtype: dns.TypeSRV, expected: "100 1 443 sipdir.online.lync.com", missing: "info", match: func(v, _ string) bool { return hasSuffixFold(v, "sipdir.online.lync.com") }},
	{id: "sipFederation", prefix: "_sipfederationtls._tcp", typ: "SRV", qtype: dns.TypeSRV, expected: "100 1 5061 sipfed.online.lync.com", missing: "info", match: func(v, _ string) bool { return hasSuffixFold(v, "sipfed.online.lync.com") }},
}

// dkimTarget accepts the classic onmicrosoft.com CNAME and the newer *.dkim.mail.microsoft one.
func dkimTarget(v, _ string) bool {
	v = strings.ToLower(strings.TrimSuffix(v, "."))
	return strings.Contains(v, "._domainkey.") && (strings.HasSuffix(v, ".onmicrosoft.com") || strings.HasSuffix(v, ".dkim.mail.microsoft"))
}

// rrValue renders the part of a record the specs compare (target, TXT text, SRV line).
func rrValue(rr dns.RR) (string, uint16) {
	switch v := rr.(type) {
	case *dns.MX:
		return strings.TrimSuffix(v.Mx, "."), dns.TypeMX
	case *dns.TXT:
		return strings.Join(v.Txt, ""), dns.TypeTXT
	case *dns.CNAME:
		return strings.TrimSuffix(v.Target, "."), dns.TypeCNAME
	case *dns.SRV:
		return strings.Join([]string{strconv.Itoa(int(v.Priority)), strconv.Itoa(int(v.Weight)), strconv.Itoa(int(v.Port)), strings.TrimSuffix(v.Target, ".")}, " "), dns.TypeSRV
	}
	return "", 0
}

func (s m365Spec) name(domain string) string {
	if s.prefix == "" {
		return domain
	}
	return s.prefix + "." + domain
}

// judge turns the answers for one spec into a check.
func (s m365Spec) judge(domain string, rrs []dns.RR, err error) M365Check {
	c := M365Check{ID: s.id, Name: s.name(domain), Type: s.typ, Expected: s.expected, Found: []string{}}
	if err != nil {
		c.Status = "warn"
		c.Found = append(c.Found, "lookup failed")
		return c
	}
	matched := 0
	for _, rr := range rrs {
		v, t := rrValue(rr)
		if t != s.qtype || v == "" {
			continue
		}
		// TXT at the apex holds many records; only show the relevant ones.
		if s.qtype == dns.TypeTXT && s.id == "spf" && !strings.HasPrefix(strings.ToLower(v), "v=spf1") {
			continue
		}
		if s.qtype == dns.TypeTXT && s.id == "verification" && !strings.HasPrefix(v, "MS=") {
			continue
		}
		c.Found = append(c.Found, v)
		if s.match(v, domain) {
			matched++
		}
	}
	switch {
	case matched > 0 && s.id == "mx" && matched < len(c.Found):
		c.Status = "warn" // mixed: some MX bypass Exchange Online
	case matched > 0:
		c.Status = "pass"
	case len(c.Found) > 0 && s.id == "mx":
		c.Status = "info" // a third-party filter (Mimecast, Proofpoint, …) in front of Exchange
	case len(c.Found) > 0 && s.missing == "warn":
		c.Status = "fail" // present, but not what Microsoft 365 needs
	default:
		c.Status = s.missing
	}
	return c
}

// Check runs every record lookup and the tenant discovery in parallel.
func (t *M365Tool) Check(ctx context.Context, domain string) M365Result {
	out := M365Result{Domain: domain, Checks: make([]M365Check, len(m365Specs))}
	var wg sync.WaitGroup
	for i, s := range m365Specs {
		wg.Go(func() {
			rrs, err := t.lookup(ctx, s.name(domain), s.qtype)
			out.Checks[i] = s.judge(domain, rrs, err)
		})
	}
	wg.Go(func() { out.Tenant = t.tenant(ctx, domain) })
	wg.Wait()
	out.UsesExchange = out.Checks[0].Status == "pass" || out.Checks[0].Status == "warn"
	return out
}

// tenant asks Microsoft's OpenID discovery (tenant id, region) and user-realm endpoints
// (managed vs federated). Both are public and keyless; the probe login is a fixed dummy name.
func (t *M365Tool) tenant(ctx context.Context, domain string) M365Tenant {
	var ten M365Tenant
	var oidc struct {
		Issuer string `json:"issuer"`
		Region string `json:"tenant_region_scope"`
		Cloud  string `json:"cloud_instance_name"`
	}
	var realm struct {
		NameSpaceType       string `json:"NameSpaceType"`
		FederationBrandName string `json:"FederationBrandName"`
		AuthURL             string `json:"AuthURL"`
	}
	var oidcErr, realmErr error
	var wg sync.WaitGroup
	wg.Go(func() {
		oidcErr = t.deps.Providers.GetJSON(ctx, providers.Request{Provider: "Microsoft Entra ID", URL: t.LoginBase + "/" + url.PathEscape(domain) + "/v2.0/.well-known/openid-configuration", TTL: time.Hour}, &oidc)
	})
	wg.Go(func() {
		q := url.Values{"login": {"nettools-probe@" + domain}, "json": {"1"}}
		realmErr = t.deps.Providers.GetJSON(ctx, providers.Request{Provider: "Microsoft Entra ID", URL: t.LoginBase + "/getuserrealm.srf?" + q.Encode(), TTL: time.Hour}, &realm)
	})
	wg.Wait()
	if oidcErr == nil {
		// issuer: https://login.microsoftonline.com/<tenant-guid>/v2.0
		if u, err := url.Parse(oidc.Issuer); err == nil {
			if parts := strings.Split(strings.Trim(u.Path, "/"), "/"); len(parts) > 0 {
				ten.ID = parts[0]
			}
		}
		ten.Found = ten.ID != ""
		ten.Region, ten.Cloud = oidc.Region, oidc.Cloud
	} else if !isBadRequest(oidcErr) {
		// 400 invalid_tenant just means "no tenant"; anything else is worth showing.
		ten.Error = httpapi.ToAPIError(oidcErr).Message
	}
	if realmErr == nil {
		ten.Namespace, ten.Brand = realm.NameSpaceType, realm.FederationBrandName
		if u, err := url.Parse(realm.AuthURL); err == nil && realm.AuthURL != "" {
			ten.FederationHost = u.Hostname()
		}
	} else if ten.Error == "" {
		ten.Error = httpapi.ToAPIError(realmErr).Message
	}
	return ten
}

func isBadRequest(err error) bool {
	var se *providers.StatusError
	return errors.As(err, &se) && se.Status == http.StatusBadRequest
}

func (t *M365Tool) handle(w http.ResponseWriter, r *http.Request) {
	domain, ok := domainParam(w, r, "domain")
	if !ok {
		return
	}
	httpapi.JSON(w, r, t.Check(r.Context(), domain), &httpapi.Meta{Tool: t.ID(), Vantage: "server", Target: &httpapi.TargetMeta{Input: domain}})
}
