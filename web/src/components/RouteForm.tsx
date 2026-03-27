import { type FormEvent, useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { createTheme } from "@uiw/codemirror-themes";

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

// Dark theme for YAML editor
const yamlTheme = createTheme({
  theme: "dark",
  settings: {
    background: "#0f172a",
    foreground: "#e2e8f0",
    caret: "#f8fafc",
    selection: "#334155",
    selectionMatch: "#334155",
    lineHighlight: "#1e293b",
    gutterBackground: "#0f172a",
    gutterForeground: "#64748b",
    gutterActiveForeground: "#94a3b8",
  },
  styles: [],
});

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
    } else if (yaml.trim()) {
      setError("Invalid YAML: missing required fields (domain, backend)");
    } else {
      setError(null);
    }
  };

  const handleModeChange = (newMode: EditorMode) => {
    if (newMode === "yaml") {
      // Switching to YAML mode: sync current form state
      setYamlContent(buildRouteYAML(formState));
      setError(null);
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
                  theme={yamlTheme}
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
                    closeBracketsKeymap: true,
                    defaultKeymap: true,
                    searchKeymap: true,
                    historyKeymap: true,
                    foldKeymap: true,
                    completionKeymap: true,
                    lintKeymap: true,
                  }}
                  className="text-sm"
                />
              </div>
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
