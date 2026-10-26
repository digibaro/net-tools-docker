// Package auth implements the optional OIDC login (AUTH_MODE=oidc, docs/SECURITY.md §7):
// authorization code flow with PKCE, an HMAC-signed session cookie (no server-side state) and
// two roles. Tools listed in AUTH_ADMIN_TOOLS need the admin role.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
)

// Roles, lowest first.
const (
	RoleNone  = "none"
	RoleUser  = "user"
	RoleAdmin = "admin"
)

// User is the signed session payload.
type User struct {
	Sub   string `json:"sub"`
	Name  string `json:"name"`
	Email string `json:"email,omitempty"`
	Role  string `json:"role"`
	Exp   int64  `json:"exp"`
}

var errBadToken = errors.New("invalid signed value")

// codec signs small JSON values: base64url(json) "." base64url(HMAC-SHA256).
type codec struct{ key []byte }

func newCodec(secret, purpose string) codec {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte("nettools/" + purpose))
	return codec{key: m.Sum(nil)}
}

func (c codec) mac(b []byte) []byte {
	m := hmac.New(sha256.New, c.key)
	m.Write(b)
	return m.Sum(nil)
}

func (c codec) encode(v any) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", err //nolint:wrapcheck // plain structs
	}
	p := base64.RawURLEncoding.EncodeToString(b)
	return p + "." + base64.RawURLEncoding.EncodeToString(c.mac([]byte(p))), nil
}

func (c codec) decode(s string, v any) error {
	p, sig, ok := strings.Cut(s, ".")
	if !ok {
		return errBadToken
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil || !hmac.Equal(got, c.mac([]byte(p))) {
		return errBadToken
	}
	b, err := base64.RawURLEncoding.DecodeString(p)
	if err != nil {
		return errBadToken
	}
	if err := json.Unmarshal(b, v); err != nil {
		return errBadToken
	}
	return nil
}
