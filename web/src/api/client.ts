export interface Route {
  domain: string;
  backend: string;
  https: boolean;
  redirectHttps: boolean;
  advancedConfig?: string;
}

export interface RouteListResponse {
  routes: Route[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  const raw = response.status === 204 ? null : await response.text();
  const data = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message = data?.error ?? response.statusText ?? "Request failed";
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export function login(token: string) {
  return request<{ success: boolean }>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ token }),
    },
  );
}

export function listRoutes(token: string) {
  return request<RouteListResponse>("/api/routes", { method: "GET" }, token);
}

export function createRoute(token: string, route: Route) {
  return request<Route>(
    "/api/routes",
    {
      method: "POST",
      body: JSON.stringify(route),
    },
    token,
  );
}

export function updateRoute(token: string, currentDomain: string, route: Route) {
  return request<Route>(
    `/api/routes/${encodeURIComponent(currentDomain)}`,
    {
      method: "PUT",
      body: JSON.stringify(route),
    },
    token,
  );
}

export function deleteRoute(token: string, domain: string) {
  return request<void>(
    `/api/routes/${encodeURIComponent(domain)}`,
    {
      method: "DELETE",
    },
    token,
  );
}
