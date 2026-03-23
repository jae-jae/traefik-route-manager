import { type FormEvent, useState } from "react";

import { login } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginProps {
  onLogin: (token: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login(token);
      onLogin(token);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="panel-noise flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Traefik Route Manager</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Lightweight reverse proxy management
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="token">Access Token</Label>
              <Input
                id="token"
                type="password"
                placeholder="Enter your token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                disabled={submitting}
                required
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting ? "Verifying..." : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
