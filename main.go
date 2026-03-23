package main

import (
	"log"

	"traefik-route-manager/config"
	"traefik-route-manager/internal/server"
	"traefik-route-manager/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	routeService, err := service.NewRouteService(cfg.ConfigDir)
	if err != nil {
		log.Fatalf("init route service: %v", err)
	}

	router := server.NewRouter(cfg, routeService)
	log.Printf("starting server on %s (%s)", cfg.Addr, cfg.String())
	if err := router.Run(cfg.Addr); err != nil {
		log.Fatalf("run server: %v", err)
	}
}
