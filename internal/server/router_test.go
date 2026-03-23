package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"traefik-route-manager/config"
	"traefik-route-manager/internal/service"
)

func TestRouterAuthAndRouteCRUD(t *testing.T) {
	t.Parallel()

	routeService, err := service.NewRouteService(t.TempDir())
	if err != nil {
		t.Fatalf("NewRouteService() error = %v", err)
	}

	router := NewRouter(config.Config{
		Addr:      ":0",
		AuthToken: "secret-token",
		ConfigDir: routeService.ConfigDir(),
	}, routeService)

	t.Run("login success", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/api/auth/login", jsonBody(t, map[string]string{
			"token": "secret-token",
		}))
		request.Header.Set("Content-Type", "application/json")

		router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
		}
	})

	t.Run("protected endpoint requires auth", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/api/routes", nil)
		router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
		}
	})

	t.Run("route CRUD", func(t *testing.T) {
		createRecorder := httptest.NewRecorder()
		createRequest := httptest.NewRequest(http.MethodPost, "/api/routes", jsonBody(t, map[string]any{
			"domain":        "app.example.com",
			"backend":       "http://10.0.0.2:8080",
			"https":         true,
			"redirectHttps": true,
		}))
		createRequest.Header.Set("Authorization", "Bearer secret-token")
		createRequest.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(createRecorder, createRequest)

		if createRecorder.Code != http.StatusCreated {
			t.Fatalf("create status = %d, want %d body=%s", createRecorder.Code, http.StatusCreated, createRecorder.Body.String())
		}

		listRecorder := httptest.NewRecorder()
		listRequest := httptest.NewRequest(http.MethodGet, "/api/routes", nil)
		listRequest.Header.Set("Authorization", "Bearer secret-token")
		router.ServeHTTP(listRecorder, listRequest)

		if listRecorder.Code != http.StatusOK {
			t.Fatalf("list status = %d, want %d body=%s", listRecorder.Code, http.StatusOK, listRecorder.Body.String())
		}

		updateRecorder := httptest.NewRecorder()
		updateRequest := httptest.NewRequest(http.MethodPut, "/api/routes/app.example.com", jsonBody(t, map[string]any{
			"domain":        "api.example.com",
			"backend":       "https://10.0.0.3:8443",
			"https":         true,
			"redirectHttps": false,
		}))
		updateRequest.Header.Set("Authorization", "Bearer secret-token")
		updateRequest.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(updateRecorder, updateRequest)

		if updateRecorder.Code != http.StatusOK {
			t.Fatalf("update status = %d, want %d body=%s", updateRecorder.Code, http.StatusOK, updateRecorder.Body.String())
		}

		deleteRecorder := httptest.NewRecorder()
		deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/routes/api.example.com", nil)
		deleteRequest.Header.Set("Authorization", "Bearer secret-token")
		router.ServeHTTP(deleteRecorder, deleteRequest)

		if deleteRecorder.Code != http.StatusNoContent {
			t.Fatalf("delete status = %d, want %d body=%s", deleteRecorder.Code, http.StatusNoContent, deleteRecorder.Body.String())
		}
	})
}

func jsonBody(t *testing.T, value any) *bytes.Reader {
	t.Helper()

	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	return bytes.NewReader(payload)
}
