package server

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"

	"traefik-route-manager/config"
	"traefik-route-manager/internal/handler"
	"traefik-route-manager/internal/middleware"
	"traefik-route-manager/internal/service"
)

func NewRouter(cfg config.Config, routeService *service.RouteService) *gin.Engine {
	router := gin.Default()

	authHandler := handler.NewAuthHandler(cfg.AuthToken)
	routeHandler := handler.NewRouteHandler(routeService)

	api := router.Group("/api")
	{
		api.POST("/auth/login", authHandler.Login)

		protected := api.Group("")
		protected.Use(middleware.Auth(cfg.AuthToken))
		protected.GET("/routes", routeHandler.ListRoutes)
		protected.POST("/routes", routeHandler.CreateRoute)
		protected.PUT("/routes/:domain", routeHandler.UpdateRoute)
		protected.DELETE("/routes/:domain", routeHandler.DeleteRoute)
	}

	registerStaticFiles(router)
	return router
}

func registerStaticFiles(router *gin.Engine) {
	distDir := filepath.Join("web", "dist")
	indexPath := filepath.Join(distDir, "index.html")

	if _, err := os.Stat(indexPath); err != nil {
		return
	}

	router.Static("/assets", filepath.Join(distDir, "assets"))
	router.StaticFile("/", indexPath)

	for _, name := range []string{"favicon.ico", "favicon.svg"} {
		path := filepath.Join(distDir, name)
		if _, err := os.Stat(path); err == nil {
			router.StaticFile("/"+name, path)
		}
	}

	router.NoRoute(func(c *gin.Context) {
		if c.Request.URL.Path == "/" {
			c.File(indexPath)
			return
		}

		c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
	})
}
