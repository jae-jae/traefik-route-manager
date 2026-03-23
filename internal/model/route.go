package model

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
)

var domainPattern = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$`)

type Route struct {
	Domain        string `json:"domain"`
	Backend       string `json:"backend"`
	HTTPS         bool   `json:"https"`
	RedirectHTTPS bool   `json:"redirectHttps"`
}

func (r Route) Validate() error {
	domain := strings.ToLower(strings.TrimSpace(r.Domain))
	if domain == "" {
		return errors.New("domain is required")
	}
	if !domainPattern.MatchString(domain) || strings.Contains(domain, "..") {
		return errors.New("domain format is invalid")
	}

	u, err := url.Parse(strings.TrimSpace(r.Backend))
	if err != nil || u == nil {
		return errors.New("backend must be a valid URL")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return errors.New("backend must use http or https")
	}
	if u.Host == "" {
		return errors.New("backend host is required")
	}
	if r.RedirectHTTPS && !r.HTTPS {
		return errors.New("redirectHttps requires https to be enabled")
	}

	return nil
}

func (r Route) Normalized() Route {
	r.Domain = strings.ToLower(strings.TrimSpace(r.Domain))
	r.Backend = strings.TrimSpace(r.Backend)
	return r
}

func (r Route) ResourceName() string {
	return SlugifyDomain(r.Domain)
}

func SlugifyDomain(domain string) string {
	domain = strings.ToLower(strings.TrimSpace(domain))

	var b strings.Builder
	lastDash := false
	for _, ch := range domain {
		switch {
		case ch >= 'a' && ch <= 'z':
			b.WriteRune(ch)
			lastDash = false
		case ch >= '0' && ch <= '9':
			b.WriteRune(ch)
			lastDash = false
		default:
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}

	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		return "route"
	}

	return slug
}
