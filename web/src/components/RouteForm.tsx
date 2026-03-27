import { type FormEvent, useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";

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
 * Build complete YAML from basic route fields
 */
function buildRouteYAML(route: Pick<Route, "domain" | "backend" | "https" | "redirectHttps">): string {
  const resourceName = route.domain
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "") || "route";
  const serviceName = resourceName + "-service";

  const lines: string[] = ["http:", "  routers:"];

  // Main router
  lines.push(`    ${resourceName}:`);
  lines.push(`      rule: "Host(\`${route.domain || "example.com"}\`)"`);
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
    lines.push(`      rule: "Host(\`${route.domain || "example.com"}\`)"`);
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
  lines.push(`          - url: ${route.backend || "http://127.0.0.1:8080"}`);

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
 * Parse basic route fields from YAML
 */
function parseRouteFromYAML(yaml: string): Pick<Route, "domain" | "backend" | "https" | "redirectHttps"> {
  const route = {
    domain: "",
    backend: "",
    https: false,
    redirectHttps: false,
  };

  const lines = yaml.split("\n");

  // Extract domain from rule
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("rule:")) {
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

  return route;
}

/**
 * Check if YAML has custom config beyond basic router/service
 */
function hasCustomConfig(yaml: string): boolean {
  // Count lines beyond basic structure
  // Basic structure has: routers (1), services (1), middlewares for redirect (optional)
  // Custom config adds extra routers, services, middlewares, or other sections
  
  const lines = yaml.split("\n");
  let routerCount = 0;
  let serviceCount = 0;
  let middlewareCount = 0;
  let hasExtraSections = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Count routers
    if (line.startsWith("    ") && !line.startsWith("      ") && trimmed.endsWith(":")) {
      // This is a router/service/middleware name
      // Need to determine which section we're in
    }
    
    // Check for extra sections beyond http:
    if (trimmed === "tcp:" || trimmed === "udp:") {
      hasExtraSections = true;
    }
  }
  
  // Simple heuristic: if YAML is significantly longer than basic template, it has custom config
  // A basic route is ~15-25 lines
  const basicLineCount = 25;
  return yaml.split("\n").length > basicLineCount || hasExtraSections;
}

/**
 * Update specific fields in YAML without full rebuild
 */
function updateYAMLField(yaml: string, field: "domain" | "backend", value: string): string {
  const lines = yaml.split("\n");
  let updated = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (field === "domain" && trimmed.startsWith("rule:")) {
      // Update domain in Host() rule
      const newLine = line.replace(/Host\(`[^`]*`\)/, `Host(\`${value}\`)`);
      if (newLine !== line) {
        lines[i] = newLine;
        updated = true;
      }
    }

    if (field === "backend" && trimmed.startsWith("- url:")) {
      // Update backend URL
      const newLine = line.replace(/- url:.*/, `- url: ${value}`);
      if (newLine !== line) {
        lines[i] = newLine;
        updated = true;
      }
    }
  }

  return updated ? lines.join("\n") : yaml;
}

export function RouteForm({
  open,
  onOpenChange,
  initialRoute,
  submitting,
  onSubmit,
}: RouteFormProps) {
  // yamlContent is the SINGLE SOURCE OF TRUTH
  const [yamlContent, setYamlContent] = useState("");
  // formState is just for display/editing, derived from yamlContent
  const [formState, setFormState] = useState<Pick<Route, "domain" | "backend" | "https" | "redirectHttps">>({
    domain: "",
    backend: "",
    https: true,
    redirectHttps: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("visual");

  const isEditing = Boolean(initialRoute);

  // Track if YAML has been customized (has advanced config)
  const [hasCustomYaml, setHasCustomYaml] = useState(false);

  useEffect(() => {
    if (!open) return;

    const route = initialRoute ?? emptyRoute;

    // Initialize YAML content - this is the source of truth
    if (route.advancedConfig && route.advancedConfig.trim()) {
      setYamlContent(route.advancedConfig);
      setHasCustomYaml(true);
    } else {
      setYamlContent(buildRouteYAML(route));
      setHasCustomYaml(false);
    }

    // Initialize form state from route
    setFormState({
      domain: route.domain,
      backend: route.backend,
      https: route.https,
      redirectHttps: route.redirectHttps,
    });

    setError(null);
    setMode("visual");
  }, [initialRoute, open]);

  // Sync form state from YAML when YAML changes
  const syncFormFromYaml = (yaml: string) => {
    const parsed = parseRouteFromYAML(yaml);
    setFormState(parsed);
  };

  const updateField = <K extends keyof typeof formState>(key: K, value: (typeof formState)[K]) => {
    const newFormState = { ...formState, [key]: value };
    setFormState(newFormState);

    // Determine how to update YAML:
    // - If has custom YAML: use string replacement (preserve custom config)
    // - If no custom YAML: rebuild from form state (simpler, cleaner)
    if (hasCustomYaml && (key === "domain" || key === "backend")) {
      // Try to update via string replacement
      const newYaml = updateYAMLField(yamlContent, key, value as string);
      setYamlContent(newYaml);
    } else {
      // Rebuild YAML (for https/redirect changes, or when no custom config)
      const newYaml = buildRouteYAML(newFormState);
      setYamlContent(newYaml);
      // If we rebuild, mark as no custom config
      setHasCustomYaml(false);
    }
  };

  const handleYamlChange = (yaml: string) => {
    setYamlContent(yaml);
    setHasCustomYaml(true); // User edited YAML, treat as custom
    syncFormFromYaml(yaml);

    if (yaml.trim()) {
      const parsed = parseRouteFromYAML(yaml);
      if (!parsed.domain || !parsed.backend) {
        setError("Invalid YAML: missing required fields (domain, backend)");
        return;
      }
    }
    setError(null);
  };

  const handleModeChange = (newMode: EditorMode) => {
    setMode(newMode);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // Validate from yamlContent (source of truth)
    const parsed = parseRouteFromYAML(yamlContent);
    if (!parsed.domain.trim()) {
      setError("Domain is required");
      return;
    }
    if (!parsed.backend.trim()) {
      setError("Backend URL is required");
      return;
    }

    try {
      // Always save the full YAML content
      const routeToSubmit: Route = {
        domain: parsed.domain,
        backend: parsed.backend,
        https: parsed.https,
        redirectHttps: parsed.redirectHttps,
        advancedConfig: yamlContent,
      };

      await onSubmit(routeToSubmit);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Request failed",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>{isEditing ? "Edit Route" : "New Route"}</DialogTitle>

            {/* Mode Toggle - Clean Pill Style */}
            <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => handleModeChange("visual")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  mode === "visual"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Form
              </button>
              <button
                type="button"
                onClick={() => handleModeChange("yaml")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  mode === "yaml"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                YAML
              </button>
            </div>
          </div>
        </DialogHeader>

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

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
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
              <div className="flex items-center justify-between">
                <Label htmlFor="yaml">Configuration</Label>
                <span className="text-xs text-slate-400">Traefik YAML</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-700">
                <CodeMirror
                  value={yamlContent}
                  height="280px"
                  extensions={[yaml()]}
                  theme={oneDark}
                  onChange={handleYamlChange}
                  editable={!submitting}
                  basicSetup={{
                    lineNumbers: true,
                    highlightActiveLineGutter: true,
                    highlightSpecialChars: true,
                    history: true,
                    foldGutter: true,
                    drawSelection: true,
                    dropCursor: true,
                    allowMultipleSelections: true,
                    indentOnInput: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    autocompletion: true,
                    rectangularSelection: true,
                    crosshairCursor: true,
                    highlightActiveLine: true,
                    highlightSelectionMatches: true,
                  }}
                  className="text-sm"
                />
              </div>
              <p className="text-xs text-slate-500">
                Edit the full configuration. Basic fields (domain, backend, HTTPS) sync with form mode.
              </p>
            </div>
          )}

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : isEditing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
