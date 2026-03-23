# Traefik Route Manager Skill

A skill for AI agents to manage Traefik reverse proxy routes through the Traefik Route Manager API.

## First-Time Setup

When first using this skill, ask the user for:

1. **Base URL** - The Traefik Route Manager web address (e.g., `https://routes.example.com` or `http://192.168.1.100:8892`)
2. **Auth Token** - The shared token configured via `AUTH_TOKEN` environment variable

Save these credentials securely for future use. Do not ask again on subsequent requests.

## Authentication

All API requests (except login) require the `Authorization` header:

```
Authorization: Bearer <token>
```

## API Reference

### Login

Validate the auth token.

**Request:**
```http
POST {baseUrl}/api/auth/login
Content-Type: application/json

{
  "token": "your-secret-token"
}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Invalid token"
}
```

---

### List Routes

Get all managed routes.

**Request:**
```http
GET {baseUrl}/api/routes
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "routes": [
    {
      "domain": "plex.example.com",
      "backend": "http://192.168.1.100:32400",
      "https": true,
      "redirectHttps": true
    },
    {
      "domain": "home.example.com",
      "backend": "http://192.168.1.100:5000",
      "https": false,
      "redirectHttps": false
    }
  ]
}
```

---

### Create Route

Create a new route. Returns error if domain already exists.

**Request:**
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

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `domain` | string | Yes | The domain name (e.g., `app.example.com`) |
| `backend` | string | Yes | Backend URL with scheme (e.g., `http://192.168.1.100:3000`) |
| `https` | boolean | No | Enable HTTPS with Traefik TLS (default: `false`) |
| `redirectHttps` | boolean | No | Redirect HTTP to HTTPS (requires `https: true`) |

**Response (201 Created):**
```json
{
  "domain": "app.example.com",
  "backend": "http://192.168.1.100:3000",
  "https": true,
  "redirectHttps": false
}
```

**Response (409 Conflict):**
```json
{
  "error": "route already exists"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "domain format is invalid"
}
```

---

### Update Route

Update an existing route. The `:domain` URL parameter is the current domain name.

**Request:**
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

**Response (200 OK):**
```json
{
  "domain": "app.example.com",
  "backend": "http://192.168.1.100:3001",
  "https": true,
  "redirectHttps": true
}
```

**Response (404 Not Found):**
```json
{
  "error": "route not found"
}
```

---

### Delete Route

Delete a route by domain.

**Request:**
```http
DELETE {baseUrl}/api/routes/app.example.com
Authorization: Bearer <token>
```

**Response (204 No Content):** Empty body on success.

**Response (404 Not Found):**
```json
{
  "error": "route not found"
}
```

## Usage Examples

### User: "Add a route for my Plex server at plex.home.local pointing to 192.168.1.100:32400"

1. Check if credentials are saved; if not, ask for base URL and token
2. Create the route:

```http
POST {baseUrl}/api/routes
Authorization: Bearer <token>
Content-Type: application/json

{
  "domain": "plex.home.local",
  "backend": "http://192.168.1.100:32400",
  "https": false,
  "redirectHttps": false
}
```

3. Confirm to user: "Created route for plex.home.local → http://192.168.1.100:32400"

### User: "List all my routes"

```http
GET {baseUrl}/api/routes
Authorization: Bearer <token>
```

Return a formatted list to the user.

### User: "Delete the route for old.example.com"

```http
DELETE {baseUrl}/api/routes/old.example.com
Authorization: Bearer <token>
```

Confirm deletion to the user.

## Notes

- Route files are prefixed with `trm-` (e.g., `trm-plex.example.com.yml`) to avoid conflicts with manual configurations
- Only routes created through this manager are listed/managed
- Traefik must be configured to watch the same `CONFIG_DIR` directory for changes to take effect
- Changes are immediate - no restart required

## Error Handling

| Status Code | Meaning |
|-------------|---------|
| 400 | Validation error (invalid domain, backend URL, etc.) |
| 401 | Invalid or missing auth token |
| 404 | Route not found |
| 409 | Route already exists (on create) |
| 500 | Server error |
