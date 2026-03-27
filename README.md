[中文](https://zdoc.app/zh/jae-jae/traefik-route-manager) | 
[Deutsch](https://zdoc.app/de/jae-jae/traefik-route-manager) | 
[English](https://zdoc.app/en/jae-jae/traefik-route-manager) | 
[Español](https://zdoc.app/es/jae-jae/traefik-route-manager) | 
[français](https://zdoc.app/fr/jae-jae/traefik-route-manager) | 
[日本語](https://zdoc.app/ja/jae-jae/traefik-route-manager) | 
[한국어](https://zdoc.app/ko/jae-jae/traefik-route-manager) | 
[Português](https://zdoc.app/pt/jae-jae/traefik-route-manager) | 
[Русский](https://zdoc.app/ru/jae-jae/traefik-route-manager)


# Traefik Route Manager

A lightweight, database-free web UI for managing Traefik file provider routes. Think of it as a minimal Nginx Proxy Manager for Traefik.

> 🌟 **Recommended**: [OllaMan](https://ollaman.com/) - Powerful Ollama AI Model Manager.

![Dashboard Screenshot](docs/screenshot.png)
![Dashboard Screenshot](docs/screenshot2.png)

## Why

Traefik's file provider is powerful but editing YAML manually is tedious. This is a minimal web UI that manages route files - no database, no dependencies.

## Features

- 📝 **Form + YAML modes** - Switch between visual form and YAML editor with syntax highlighting
- 🔧 **Advanced config** - Add custom middlewares, health checks via YAML
- 🗂️ **One route, one file** - Simple YAML files, version-controllable
- 🤖 **AI Agent ready** - Manage routes via natural language
- 🪶 **Zero dependencies** - No database, single ~15MB binary

## AI Agent Integration

Let AI assistants manage your routes with natural language commands like "Add a route for my Plex server".

```
Install this skill: https://raw.githubusercontent.com/jae-jae/traefik-route-manager/main/SKILL.md
```

See [SKILL.md](SKILL.md) for the full API documentation.

## Quick Start

```bash
docker run -d \
  --name traefik-route-manager \
  -p 8892:8892 \
  -v /path/to/traefik/dynamic:/data \
  -e AUTH_TOKEN=your-secret-token \
  -e CONFIG_DIR=/data \
  ghcr.io/jae-jae/traefik-route-manager:main
```

Point Traefik to the same directory:

```yaml
providers:
  file:
    directory: /etc/traefik/dynamic
    watch: true
```

## Config

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_TOKEN` | - | Auth token (required) |
| `CONFIG_DIR` | - | Route files directory (required) |
| `ADDR` | `:8892` | Listen address |

## Example Route

```yaml
http:
  routers:
    plex-example-com:
      rule: "Host(`plex.example.com`)"
      service: plex-example-com-service
      entryPoints:
        - websecure
      tls: {}
  services:
    plex-example-com-service:
      loadBalancer:
        servers:
          - url: http://192.168.1.100:32400
```

## Advanced Configuration

Use **YAML mode** to add custom middlewares, health checks, or other Traefik features. Basic fields (domain, backend, HTTPS) sync with the form; custom configs are preserved.

## Dev

```bash
# Backend
AUTH_TOKEN=dev CONFIG_DIR=$(pwd)/data go run .

# Frontend
cd web && bun install && bun run dev
```

## Tech

Go + React + Tailwind, packaged in Docker.

## License

MIT
