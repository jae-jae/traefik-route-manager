package service

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"traefik-route-manager/internal/model"
)

func TestRouteServiceCRUD(t *testing.T) {
	t.Parallel()

	service, err := NewRouteService(t.TempDir())
	if err != nil {
		t.Fatalf("NewRouteService() error = %v", err)
	}

	created, err := service.CreateRoute(model.Route{
		Domain:        "nas.example.com",
		Backend:       "http://192.168.1.100:5000",
		HTTPS:         true,
		RedirectHTTPS: true,
	})
	if err != nil {
		t.Fatalf("CreateRoute() error = %v", err)
	}

	content, err := os.ReadFile(filepath.Join(service.ConfigDir(), "nas.example.com.yml"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}

	for _, fragment := range []string{
		"Host(`nas.example.com`)",
		"url: http://192.168.1.100:5000",
		"redirectScheme:",
		"entryPoints:",
		"- websecure",
	} {
		if !strings.Contains(string(content), fragment) {
			t.Fatalf("route file missing fragment %q\n%s", fragment, content)
		}
	}

	routes, err := service.ListRoutes()
	if err != nil {
		t.Fatalf("ListRoutes() error = %v", err)
	}
	if len(routes) != 1 {
		t.Fatalf("ListRoutes() len = %d, want 1", len(routes))
	}
	if routes[0] != created {
		t.Fatalf("ListRoutes()[0] = %+v, want %+v", routes[0], created)
	}

	updated, err := service.UpdateRoute("nas.example.com", model.Route{
		Domain:        "media.example.com",
		Backend:       "https://10.0.0.5:9443",
		HTTPS:         true,
		RedirectHTTPS: false,
	})
	if err != nil {
		t.Fatalf("UpdateRoute() error = %v", err)
	}

	if _, err := os.Stat(filepath.Join(service.ConfigDir(), "nas.example.com.yml")); !os.IsNotExist(err) {
		t.Fatalf("old route file still exists, stat err = %v", err)
	}
	if _, err := os.Stat(filepath.Join(service.ConfigDir(), "media.example.com.yml")); err != nil {
		t.Fatalf("new route file missing, stat err = %v", err)
	}
	if updated.Domain != "media.example.com" || updated.Backend != "https://10.0.0.5:9443" {
		t.Fatalf("UpdateRoute() = %+v", updated)
	}

	if err := service.DeleteRoute("media.example.com"); err != nil {
		t.Fatalf("DeleteRoute() error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(service.ConfigDir(), "media.example.com.yml")); !os.IsNotExist(err) {
		t.Fatalf("route file still exists after delete, stat err = %v", err)
	}
}

func TestRouteServiceValidation(t *testing.T) {
	t.Parallel()

	service, err := NewRouteService(t.TempDir())
	if err != nil {
		t.Fatalf("NewRouteService() error = %v", err)
	}

	_, err = service.CreateRoute(model.Route{
		Domain:        "bad domain",
		Backend:       "http://backend.internal",
		HTTPS:         false,
		RedirectHTTPS: true,
	})
	if err == nil {
		t.Fatal("CreateRoute() error = nil, want validation error")
	}

	var validationErr ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("CreateRoute() error = %T, want ValidationError", err)
	}
	if !strings.Contains(err.Error(), "domain") {
		t.Fatalf("CreateRoute() error = %v, want domain validation error", err)
	}
}
