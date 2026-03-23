---
name: traefik-route-manager
description: Use when an AI agent needs to manage Traefik Route Manager routes through its HTTP API, including authenticating, listing routes, and creating, updating, or deleting managed route entries that map domains to backend services.
---

# Traefik Route Manager

Use this skill to help an AI agent operate a deployed Traefik Route Manager instance over HTTP.

## Setup

Collect these values before the first API call:

1. Base URL for the Traefik Route Manager instance, such as `https://routes.example.com` or `http://192.168.1.100:8892`
2. Shared auth token configured by the server's `AUTH_TOKEN`

Reuse previously supplied credentials only when the runtime supports secure state or the user explicitly provides them again.

## Authentication

Validate the token with:

```http
POST {baseUrl}/api/auth/login
Content-Type: application/json

{
  "token": "your-secret-token"
}
```

Send this header on every route request:

```http
Authorization: Bearer <token>
```

## Route Operations

List managed routes:

```http
GET {baseUrl}/api/routes
Authorization: Bearer <token>
```

Create a route:

```http
POST {baseUrl}/api/routes
Authorization: Bearer <token>
Content-Type: application/json

{
  "domain": "app.example.com",
  "backend": "http://192.168.1.100:3000",
  "https": true,
  "redirectHttps": false
}
```

Update a route by current domain:

```http
PUT {baseUrl}/api/routes/app.example.com
Authorization: Bearer <token>
Content-Type: application/json

{
  "domain": "app.example.com",
  "backend": "http://192.168.1.100:3001",
  "https": true,
  "redirectHttps": true
}
```

Delete a route:

```http
DELETE {baseUrl}/api/routes/app.example.com
Authorization: Bearer <token>
```

## Request Rules

Use these payload rules when creating or updating routes:

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `domain` | string | Yes | Use a valid hostname such as `app.example.com` |
| `backend` | string | Yes | Include a scheme, such as `http://192.168.1.100:3000` |
| `https` | boolean | No | Enable TLS routing when `true` |
| `redirectHttps` | boolean | No | Redirect HTTP to HTTPS; only enable when `https` is also `true` |

## Responses

Expect these common responses:

- `POST /api/auth/login`: `200` on success, `401` when the token is invalid
- `GET /api/routes`: `200` with `{"routes":[...]}`
- `POST /api/routes`: `201` on success, `409` when the domain already exists, `400` on validation failure
- `PUT /api/routes/:domain`: `200` on success, `404` when the route does not exist
- `DELETE /api/routes/:domain`: `204` on success, `404` when the route does not exist

## Workflow

Follow this sequence for user requests:

1. Confirm the base URL and auth token if they are not already available in safe runtime state.
2. Validate the token with `/api/auth/login` when authentication status is unknown.
3. Choose the matching route endpoint for list, create, update, or delete.
4. Return a concise summary that includes the domain, backend, and HTTPS behavior after the API call.

## Notes

- Manage only routes handled by Traefik Route Manager.
- Expect managed files to use the `trm-` prefix, such as `trm-plex.example.com.yml`.
- Expect changes to take effect through Traefik File Provider without a service restart when the target instance is configured correctly.
