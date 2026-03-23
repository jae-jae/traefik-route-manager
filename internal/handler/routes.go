package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"traefik-route-manager/internal/model"
	"traefik-route-manager/internal/service"
)

type RouteHandler struct {
	service *service.RouteService
}

func NewRouteHandler(routeService *service.RouteService) *RouteHandler {
	return &RouteHandler{service: routeService}
}

func (h *RouteHandler) ListRoutes(c *gin.Context) {
	routes, err := h.service.ListRoutes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"routes": routes})
}

func (h *RouteHandler) CreateRoute(c *gin.Context) {
	var route model.Route
	if err := c.ShouldBindJSON(&route); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	created, err := h.service.CreateRoute(route)
	if err != nil {
		h.handleRouteError(c, err)
		return
	}

	c.JSON(http.StatusCreated, created)
}

func (h *RouteHandler) UpdateRoute(c *gin.Context) {
	var route model.Route
	if err := c.ShouldBindJSON(&route); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	updated, err := h.service.UpdateRoute(c.Param("domain"), route)
	if err != nil {
		h.handleRouteError(c, err)
		return
	}

	c.JSON(http.StatusOK, updated)
}

func (h *RouteHandler) DeleteRoute(c *gin.Context) {
	if err := h.service.DeleteRoute(c.Param("domain")); err != nil {
		h.handleRouteError(c, err)
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *RouteHandler) handleRouteError(c *gin.Context, err error) {
	var validationErr service.ValidationError

	switch {
	case errors.Is(err, service.ErrRouteNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, service.ErrRouteExists):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.As(err, &validationErr):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}
