import { useState } from "react";

import { Dashboard } from "@/pages/Dashboard";
import { Login } from "@/pages/Login";

const TOKEN_STORAGE_KEY = "traefik-route-manager.token";

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY),
  );

  const handleLogin = (nextToken: string) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    setToken(nextToken);
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
  };

  return token ? (
    <Dashboard token={token} onLogout={handleLogout} />
  ) : (
    <Login onLogin={handleLogin} />
  );
}
