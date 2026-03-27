import { type FormEvent, useEffect, useState } from "react";
import { Code2, FormInput } from "lucide-react";

import type { Route } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface RouteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRoute: Route | null;
  submitting: boolean;
  onSubmit: (route: Route) => Promise<void>;
}

const emptyRoute: Route = {
  domain: "",
  backend: "",
  https: true,
  redirectHttps: true,
};

type EditorMode = "visual" | "yaml";

/**
 * Build Traefik YAML config from Route object (matches backend logic)
 */
function buildRouteYAML(route: Route): string {
  const resourceName = route.domain
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const serviceName = resourceName + "-service";

  const lines: string[] = ["http:", "  routers:"];

  // Main router
  lines.push(`    ${resourceName}:`);
  lines.push(`      rule: "Host(\`${route.domain}\`)"`);
  lines.push(`      service: ${serviceName}`);
  lines.push("      entryPoints:");
  if (route.https) {
    lines.push("        - websecure");
    lines.push("      tls: {}");
  } else {
    lines.push("        - web");
  }

  // Redirect router (if HTTPS redirect enabled)
  if (route.redirectHttps) {
    const middlewareName = resourceName + "-redirect-https";
    lines.push(`    ${resourceName}-redirect:`);
    lines.push(`      rule: "Host(\`${route.domain}\`)"`);
    lines.push(`      service: ${serviceName}`);
    lines.push("      entryPoints:");
    lines.push("        - web");
    lines.push("      middlewares:");
    lines.push(`        - ${middlewareName}`);
  }

  // Service
  lines.push("  services:");
  lines.push(`    ${serviceName}:`);
  lines.push("      loadBalancer:");
  lines.push("        servers:");
  lines.push(`          - url: ${route.backend}`);

  // Middleware (if HTTPS redirect enabled)
  if (route.redirectHttps) {
    const middlewareName = resourceName + "-redirect-https";
    lines.push("  middlewares:");
    lines.push(`    ${middlewareName}:`);
    lines.push("      redirectScheme:");
    lines.push("        scheme: https");
    lines.push("        permanent: true");
  }

  return lines.join("\n");
}

/**
 * Parse Route from YAML config (simple parser matching backend logic)
 */
function parseRouteYAML(yaml: string): Route | null {
  try {
    const route: Route = {
      domain: "",
      backend: "",
      https: false,
      redirectHttps: false,
    };

    const lines = yaml.split("\n");

    // Extract domain from rule
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('rule:')) {
        const match = trimmed.match(/Host\(`([^`]+)`\)/);
        if (match) {
          route.domain = match[1];
          break;
        }
      }
    }

    // Extract backend URL
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("- url:") || trimmed.startsWith("url:")) {
        const url = trimmed.includes("- url:")
          ? trimmed.split("- url:")[1].trim().replace(/"/g, "")
          : trimmed.split("url:")[1].trim().replace(/"/g, "");
        route.backend = url;
        break;
      }
    }

    // Detect HTTPS
    if (yaml.includes("- websecure") || yaml.includes("tls:")) {
      route.https = true;
    }

    // Detect HTTPS redirect
    if (yaml.includes("redirectScheme:")) {
      route.redirectHttps = true;
    }

    // Validate
    if (!route.domain || !route.backend) {
      return null;
    }

    return route;
  } catch {
    return null;
  }
}

export function RouteForm({
  open,
  onOpenChange,
  initialRoute,
  submitting,
  onSubmit,
}: RouteFormProps) {
  const [formState, setFormState] = useState<Route>(emptyRoute);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("visual");
  const [yamlContent, setYamlContent] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    const route = initialRoute ?? emptyRoute;
    setFormState(route);
    setYamlContent(buildRouteYAML(route));
    setError(null);
    setMode("visual");
  }, [initialRoute, open]);

  const isEditing = Boolean(initialRoute);

  const updateField = <K extends keyof Route>(key: K, value: Route[K]) => {
    setFormState((current) => {
      const updated = { ...current, [key]: value };
      // Sync YAML content
      setYamlContent(buildRouteYAML(updated));
      return updated;
    });
  };

  const handleYamlChange = (yaml: string) => {
    setYamlContent(yaml);
    const parsed = parseRouteYAML(yaml);
    if (parsed) {
      setFormState(parsed);
      setError(null);
    } else {
      setError("Invalid YAML format or missing required fields");
    }
  };

  const handleModeChange = (newMode: EditorMode) => {
    if (newMode === "yaml") {
      // Switching to YAML mode: sync current form state
      setYamlContent(buildRouteYAML(formState));
    }
    setMode(newMode);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // Validate
    if (!formState.domain.trim()) {
      setError("Domain is required");
      return;
    }
    if (!formState.backend.trim()) {
      setError("Backend URL is required");
      return;
    }

    try {
      await onSubmit(formState);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Request failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Route" : "New Route"}</DialogTitle>
        </DialogHeader>

        {/* Mode Toggle */}
        <div className="flex items-center justify-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => handleModeChange("visual")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "visual"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FormInput className="h-4 w-4" />
            Visual
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("yaml")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "yaml"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Code2 className="h-4 w-4" />
            YAML
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === "visual" ? (
            /* Visual Mode */
            <>
              <div className="space-y-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  placeholder="app.example.com"
                  value={formState.domain}
                  onChange={(event) => updateField("domain", event.target.value)}
                  disabled={submitting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="backend">Backend URL</Label>
                <Input
                  id="backend"
                  placeholder="http://192.168.1.100:3000"
                  value={formState.backend}
                  onChange={(event) => updateField("backend", event.target.value)}
                  disabled={submitting}
                  required
                />
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="https">HTTPS</Label>
                  <Switch
                    id="https"
                    checked={formState.https}
                    onCheckedChange={(checked) => {
                      updateField("https", checked);
                      if (!checked) {
                        updateField("redirectHttps", false);
                      }
                    }}
                    disabled={submitting}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="redirectHttps">Redirect HTTP → HTTPS</Label>
                  <Switch
                    id="redirectHttps"
                    checked={formState.redirectHttps}
                    onCheckedChange={(checked) => updateField("redirectHttps", checked)}
                    disabled={submitting || !formState.https}
                  />
                </div>
              </div>
            </>
          ) : (
            /* YAML Mode */
            <div className="space-y-2">
              <Label htmlFor="yaml">YAML Configuration</Label>
              <textarea
                id="yaml"
                value={yamlContent}
                onChange={(event) => handleYamlChange(event.target.value)}
                disabled={submitting}
                className="h-64 w-full rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-sm text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20 disabled:opacity-50"
                placeholder="http:
  routers:
    ..."
                spellCheck={false}
              />
              <p className="text-xs text-slate-500">
                Edit the YAML directly. Changes sync with visual mode.
              </p>
            </div>
          )}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              {submitting ? "Saving..." : isEditing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
