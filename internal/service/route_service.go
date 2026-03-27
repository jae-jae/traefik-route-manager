package service

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"traefik-route-manager/internal/model"
)

const filePrefix = "trm-"

var (
	ErrRouteNotFound = errors.New("route not found")
	ErrRouteExists   = errors.New("route already exists")
)

type ValidationError struct {
	Err error
}

func (e ValidationError) Error() string {
	return e.Err.Error()
}

func (e ValidationError) Unwrap() error {
	return e.Err
}

type RouteService struct {
	configDir string
}

func (s *RouteService) ConfigDir() string {
	return s.configDir
}

func NewRouteService(configDir string) (*RouteService, error) {
	if configDir == "" {
		return nil, errors.New("config directory is required")
	}
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		return nil, fmt.Errorf("create config dir: %w", err)
	}

	return &RouteService{configDir: configDir}, nil
}

func (s *RouteService) ListRoutes() ([]model.Route, error) {
	entries, err := os.ReadDir(s.configDir)
	if err != nil {
		return nil, fmt.Errorf("read config dir: %w", err)
	}

	routes := make([]model.Route, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".yml" {
			continue
		}

		// Only manage files with trm- prefix
		if !strings.HasPrefix(entry.Name(), filePrefix) {
			continue
		}

		route, err := s.readRouteFromFile(filepath.Join(s.configDir, entry.Name()))
		if err != nil {
			return nil, err
		}
		routes = append(routes, route)
	}

	slices.SortFunc(routes, func(a, b model.Route) int {
		return strings.Compare(a.Domain, b.Domain)
	})

	return routes, nil
}

func (s *RouteService) CreateRoute(route model.Route) (model.Route, error) {
	route = route.Normalized()
	if err := route.Validate(); err != nil {
		return model.Route{}, ValidationError{Err: err}
	}

	path := s.routeFilePath(route.Domain)
	if _, err := os.Stat(path); err == nil {
		return model.Route{}, ErrRouteExists
	} else if !errors.Is(err, fs.ErrNotExist) {
		return model.Route{}, fmt.Errorf("check route file: %w", err)
	}

	if err := s.writeRouteFile(path, route); err != nil {
		return model.Route{}, err
	}

	return route, nil
}

func (s *RouteService) UpdateRoute(currentDomain string, route model.Route) (model.Route, error) {
	route = route.Normalized()
	currentDomain = strings.ToLower(strings.TrimSpace(currentDomain))
	if currentDomain == "" {
		return model.Route{}, ValidationError{Err: errors.New("current domain is required")}
	}
	if err := route.Validate(); err != nil {
		return model.Route{}, ValidationError{Err: err}
	}

	currentPath := s.routeFilePath(currentDomain)
	if _, err := os.Stat(currentPath); errors.Is(err, fs.ErrNotExist) {
		return model.Route{}, ErrRouteNotFound
	} else if err != nil {
		return model.Route{}, fmt.Errorf("check current route file: %w", err)
	}

	nextPath := s.routeFilePath(route.Domain)
	if route.Domain != currentDomain {
		if _, err := os.Stat(nextPath); err == nil {
			return model.Route{}, ErrRouteExists
		} else if !errors.Is(err, fs.ErrNotExist) {
			return model.Route{}, fmt.Errorf("check next route file: %w", err)
		}
	}

	if err := s.writeRouteFile(nextPath, route); err != nil {
		return model.Route{}, err
	}
	if route.Domain != currentDomain {
		if err := os.Remove(currentPath); err != nil {
			return model.Route{}, fmt.Errorf("remove old route file: %w", err)
		}
	}

	return route, nil
}

func (s *RouteService) DeleteRoute(domain string) error {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return ValidationError{Err: errors.New("domain is required")}
	}

	path := s.routeFilePath(domain)
	if err := os.Remove(path); errors.Is(err, fs.ErrNotExist) {
		return ErrRouteNotFound
	} else if err != nil {
		return fmt.Errorf("delete route file: %w", err)
	}

	return nil
}

func (s *RouteService) routeFilePath(domain string) string {
	return filepath.Join(s.configDir, filePrefix+domain+".yml")
}

// validateAdvancedConfig checks if the advanced YAML config is valid and contains
// required fields (at least one backend URL). Returns an error if invalid.
func validateAdvancedConfig(yamlStr string) error {
	hasBackend := false
	for _, line := range strings.Split(yamlStr, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "- url:") || strings.HasPrefix(trimmed, "url:") {
			hasBackend = true
			break
		}
	}
	if !hasBackend {
		return errors.New("advancedConfig must contain at least one backend server URL")
	}
	return nil
}

func (s *RouteService) writeRouteFile(path string, route model.Route) error {
	// Build YAML: if AdvancedConfig is provided, use it as-is (frontend handles merging)
	// Otherwise, generate from basic fields
	var content string
	if route.AdvancedConfig != nil && strings.TrimSpace(*route.AdvancedConfig) != "" {
		// Validate the advanced config before writing
		if err := validateAdvancedConfig(*route.AdvancedConfig); err != nil {
			return ValidationError{Err: err}
		}
		content = *route.AdvancedConfig
	} else {
		content = buildRouteYAML(route)
	}

	tempFile, err := os.CreateTemp(s.configDir, "route-*.yml")
	if err != nil {
		return fmt.Errorf("create temp route file: %w", err)
	}

	tempName := tempFile.Name()
	defer func() {
		_ = os.Remove(tempName)
	}()

	if _, err := tempFile.WriteString(content); err != nil {
		_ = tempFile.Close()
		return fmt.Errorf("write temp route file: %w", err)
	}
	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("close temp route file: %w", err)
	}

	if err := os.Rename(tempName, path); err != nil {
		return fmt.Errorf("rename temp route file: %w", err)
	}

	return nil
}

func (s *RouteService) readRouteFromFile(path string) (model.Route, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return model.Route{}, fmt.Errorf("read route file %s: %w", filepath.Base(path), err)
	}

	// Extract domain from filename, removing the trm- prefix
	filename := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	domain := strings.TrimPrefix(filename, filePrefix)
	route := model.Route{Domain: domain}

	yamlStr := string(content)

	// Store full YAML as AdvancedConfig so frontend can preserve all customizations
	route.AdvancedConfig = &yamlStr

	// Extract basic fields for form display
	for _, line := range strings.Split(yamlStr, "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "- url:"):
			route.Backend = strings.Trim(strings.TrimSpace(strings.TrimPrefix(trimmed, "- url:")), `"`)
		case strings.HasPrefix(trimmed, "url:"):
			route.Backend = strings.Trim(strings.TrimSpace(strings.TrimPrefix(trimmed, "url:")), `"`)
		case trimmed == "- websecure":
			route.HTTPS = true
		case strings.HasPrefix(trimmed, "tls:"):
			route.HTTPS = true
		case strings.HasPrefix(trimmed, "redirectScheme:"):
			route.RedirectHTTPS = true
		}
	}

	if route.Backend == "" {
		return model.Route{}, fmt.Errorf("route file %s does not contain a backend server", filepath.Base(path))
	}

	return route, nil
}

func buildRouteYAML(route model.Route) string {
	resourceName := route.ResourceName()
	serviceName := resourceName + "-service"

	var b strings.Builder
	b.WriteString("http:\n")
	b.WriteString("  routers:\n")
	b.WriteString(fmt.Sprintf("    %s:\n", resourceName))
	b.WriteString(fmt.Sprintf("      rule: \"Host(`%s`)\"\n", route.Domain))
	b.WriteString(fmt.Sprintf("      service: %s\n", serviceName))
	b.WriteString("      entryPoints:\n")
	if route.HTTPS {
		b.WriteString("        - websecure\n")
		b.WriteString("      tls: {}\n")
	} else {
		b.WriteString("        - web\n")
	}

	if route.RedirectHTTPS {
		middlewareName := resourceName + "-redirect-https"
		b.WriteString(fmt.Sprintf("    %s-redirect:\n", resourceName))
		b.WriteString(fmt.Sprintf("      rule: \"Host(`%s`)\"\n", route.Domain))
		b.WriteString(fmt.Sprintf("      service: %s\n", serviceName))
		b.WriteString("      entryPoints:\n")
		b.WriteString("        - web\n")
		b.WriteString("      middlewares:\n")
		b.WriteString(fmt.Sprintf("        - %s\n", middlewareName))
	}

	b.WriteString("  services:\n")
	b.WriteString(fmt.Sprintf("    %s:\n", serviceName))
	b.WriteString("      loadBalancer:\n")
	b.WriteString("        servers:\n")
	b.WriteString(fmt.Sprintf("          - url: %s\n", route.Backend))

	if route.RedirectHTTPS {
		middlewareName := resourceName + "-redirect-https"
		b.WriteString("  middlewares:\n")
		b.WriteString(fmt.Sprintf("    %s:\n", middlewareName))
		b.WriteString("      redirectScheme:\n")
		b.WriteString("        scheme: https\n")
		b.WriteString("        permanent: true\n")
	}

	return b.String()
}
