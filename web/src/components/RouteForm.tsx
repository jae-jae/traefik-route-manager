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
 * Build complete YAML from Route object
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
 * Parse basic route fields from YAML
 */
function parseRouteFromYAML(yaml: string): Route {
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

  return route;
}

/**
 * Get resource name from domain (must match backend logic)
 */
function getResourceName(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Extract advanced config from full YAML
 * Removes basic route items (router, service, redirect middleware) and returns the rest
 */
function extractAdvancedConfig(fullYaml: string, route: Route): string {
  if (!route.domain) return "";

  const resourceName = getResourceName(route.domain);
  const serviceName = resourceName + "-service";
  const redirectMiddleware = resourceName + "-redirect-https";

  const lines = fullYaml.split("\n");
  const advancedLines: string[] = [];

  let inHTTP = false;
  let inSection = ""; // routers, services, middlewares
  let currentItem = "";
  let skipItem = false;
  let itemIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track http: section
    if (trimmed === "http:" && !line.startsWith(" ")) {
      inHTTP = true;
      continue;
    }

    if (!inHTTP) continue;

    // Detect section headers (2-space indent)
    if (line.startsWith("  ") && !line.startsWith("    ") && trimmed.endsWith(":")) {
      inSection = trimmed.slice(0, -1); // routers, services, middlewares
      continue;
    }

    // Detect item keys (4-space indent, ends with :)
    if (line.startsWith("    ") && !line.startsWith("      ") && trimmed.endsWith(":")) {
      currentItem = trimmed.slice(0, -1);
      skipItem = false;
      itemIndent = line.length - line.trimStart().length;

      // Check if this is a basic item to skip
      if (inSection === "routers") {
        if (currentItem === resourceName || currentItem === `${resourceName}-redirect`) {
          skipItem = true;
          continue;
        }
      } else if (inSection === "services") {
        if (currentItem === serviceName) {
          skipItem = true;
          continue;
        }
      } else if (inSection === "middlewares") {
        if (currentItem === redirectMiddleware) {
          skipItem = true;
          continue;
        }
      }

      // This is an advanced item
      advancedLines.push(line);
      continue;
    }

    // Collect lines under items
    if (currentItem && !skipItem) {
      // Check if still under current item (more indented)
      if (line.startsWith("      ") || (trimmed === "" && i + 1 < lines.length && lines[i + 1].startsWith("      "))) {
        advancedLines.push(line);
      } else if (line.startsWith("    ") && !line.startsWith("      ")) {
        // New item
        currentItem = trimmed.endsWith(":") ? trimmed.slice(0, -1) : "";
        skipItem = false;

        // Check if this basic item
        if (inSection === "routers") {
          if (currentItem === resourceName || currentItem === `${resourceName}-redirect`) {
            skipItem = true;
            continue;
          }
        } else if (inSection === "services") {
          if (currentItem === serviceName) {
            skipItem = true;
            continue;
          }
        } else if (inSection === "middlewares") {
          if (currentItem === redirectMiddleware) {
            skipItem = true;
            continue;
          }
        }

        advancedLines.push(line);
      }
    }
  }

  // Build the advanced config YAML structure
  const result: string[] = [];
  let hasRouters = false;
  let hasServices = false;
  let hasMiddlewares = false;

  let currentSection = "";
  for (const line of advancedLines) {
    const trimmed = line.trim();

    // Detect which section by checking indentation patterns
    if (line.startsWith("    ") && !line.startsWith("      ")) {
      // Determine section based on position
      // We need to track sections differently
    }
  }

  // Simple approach: return lines grouped by detected section
  // Build proper YAML structure
  const routers: string[] = [];
  const services: string[] = [];
  const middlewares: string[] = [];

  currentSection = "";
  let collectingFor = "";
  for (let i = 0; i < advancedLines.length; i++) {
    const line = advancedLines[i];

    // This is a simplified approach - just wrap in http:
    // In a production app, you'd use a proper YAML library
    if (line.startsWith("    ") && !line.startsWith("      ")) {
      // Item key - determine which section it belongs to
      // We need to track section from previous parsing
    }
  }

  // For simplicity, return the advanced lines wrapped in minimal structure
  // The frontend merge logic will handle re-inserting into proper sections
  if (advancedLines.length === 0) return "";

  return advancedLines.join("\n");
}

/**
 * Merge advanced config into base YAML
 */
function mergeAdvancedConfig(baseYaml: string, advancedConfig: string): string {
  if (!advancedConfig.trim()) return baseYaml;

  // Parse advanced config to extract routers, services, middlewares additions
  const advancedLines = advancedConfig.split("\n");
  const routerAdditions: string[] = [];
  const serviceAdditions: string[] = [];
  const middlewareAdditions: string[] = [];

  let currentSection = "";
  let currentItem: string[] = [];
  let itemIndent = 0;

  for (const line of advancedLines) {
    const trimmed = line.trim();

    // Detect which section this item belongs to by checking context
    // Items at 4-space indent are top-level keys under routers/services/middlewares
    if (line.startsWith("    ") && !line.startsWith("      ")) {
      // Save previous item
      if (currentItem.length > 0 && currentSection) {
        if (currentSection === "routers") routerAdditions.push(...currentItem);
        else if (currentSection === "services") serviceAdditions.push(...currentItem);
        else if (currentSection === "middlewares") middlewareAdditions.push(...currentItem);
      }

      // Start new item - need to detect section from position or content
      // For simplicity, we'll use heuristics:
      // - Items with "rule:" or "entryPoints:" are likely routers
      // - Items with "loadBalancer:" are likely services
      // - Items with redirect/auth are likely middlewares
      currentItem = [line];
      itemIndent = line.length - line.trimStart().length;
    } else if (line.startsWith("      ") && currentItem.length > 0) {
      currentItem.push(line);
    } else if (trimmed === "" && currentItem.length > 0) {
      // Continue collecting if next line is still part of item
      currentItem.push(line);
    }
  }

  // Save last item
  if (currentItem.length > 0) {
    // Try to detect section from content
    const itemContent = currentItem.join("\n");
    if (itemContent.includes("rule:") || itemContent.includes("entryPoints:")) {
      routerAdditions.push(...currentItem);
    } else if (itemContent.includes("loadBalancer:") || itemContent.includes("servers:")) {
      serviceAdditions.push(...currentItem);
    } else if (itemContent.includes("redirect") || itemContent.includes("auth") || itemContent.includes("limit")) {
      middlewareAdditions.push(...currentItem);
    }
  }

  // If we can't determine sections, just append to middlewares
  // (this is a fallback for simple cases)

  // Now merge into base YAML
  const baseLines = baseYaml.split("\n");
  const result: string[] = [];

  let inRouters = false;
  let inServices = false;
  let inMiddlewares = false;
  let addedRouterAdditions = false;
  let addedServiceAdditions = false;
  let addedMiddlewareAdditions = false;
  let hasMiddlewaresSection = baseYaml.includes("middlewares:");

  for (let i = 0; i < baseLines.length; i++) {
    const line = baseLines[i];
    const trimmed = line.trim();

    result.push(line);

    // Track sections
    if (line === "  routers:") {
      inRouters = true;
      inServices = false;
      inMiddlewares = false;
    } else if (line === "  services:") {
      inRouters = false;
      inServices = true;
      inMiddlewares = false;

      // Add router additions before services section
      if (!addedRouterAdditions && routerAdditions.length > 0) {
        // Find where to insert (after existing routers)
        for (const addLine of routerAdditions) {
          result.push(addLine);
        }
        addedRouterAdditions = true;
      }
    } else if (line === "  middlewares:") {
      inRouters = false;
      inServices = false;
      inMiddlewares = true;

      // Add service additions before middlewares section
      if (!addedServiceAdditions && serviceAdditions.length > 0) {
        for (const addLine of serviceAdditions) {
          result.push(addLine);
        }
        addedServiceAdditions = true;
      }
    }

    // Add middleware additions at end of middlewares section
    if (inMiddlewares && !addedMiddlewareAdditions && middlewareAdditions.length > 0) {
      // Check if next line is a new item (4-space indent that's not continuation)
      const nextLine = baseLines[i + 1];
      if (!nextLine || (nextLine.startsWith("    ") && !nextLine.startsWith("      "))) {
        for (const addLine of middlewareAdditions) {
          result.push(addLine);
        }
        addedMiddlewareAdditions = true;
      }
    }
  }

  // If no middlewares section exists but we have middleware additions
  if (!hasMiddlewaresSection && middlewareAdditions.length > 0) {
    result.push("  middlewares:");
    for (const addLine of middlewareAdditions) {
      result.push(addLine);
    }
  }

  // Handle case where additions weren't placed
  if (routerAdditions.length > 0 && !addedRouterAdditions) {
    // Insert after last router entry
    const routersIdx = result.findIndex((l) => l === "  routers:");
    if (routersIdx >= 0) {
      // Find end of routers section
      for (let i = routersIdx + 1; i < result.length; i++) {
        if (result[i] === "  services:" || result[i] === "  middlewares:") {
          result.splice(i, 0, ...routerAdditions);
          break;
        }
      }
    }
  }

  return result.join("\n");
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
  const [advancedConfig, setAdvancedConfig] = useState<string>("");

  // Track if YAML was user-edited
  const [yamlUserEdited, setYamlUserEdited] = useState(false);

  useEffect(() => {
    if (!open) return;

    const route = initialRoute ?? emptyRoute;
    setFormState(route);

    // Initialize YAML and advanced config
    if (route.advancedConfig) {
      // Existing route with full YAML
      setYamlContent(route.advancedConfig);
      setAdvancedConfig(extractAdvancedConfig(route.advancedConfig, route));
    } else {
      // New route - generate from basic fields
      setYamlContent(buildRouteYAML(route));
      setAdvancedConfig("");
    }

    setError(null);
    setMode("visual");
    setYamlUserEdited(false);
  }, [initialRoute, open]);

  const isEditing = Boolean(initialRoute);

  const updateField = <K extends keyof Route>(key: K, value: Route[K]) => {
    setFormState((current) => {
      const updated = { ...current, [key]: value };
      // Sync YAML content (preserve advanced config)
      const baseYaml = buildRouteYAML(updated);
      setYamlContent(mergeAdvancedConfig(baseYaml, advancedConfig));
      return updated;
    });
  };

  const handleYamlChange = (yaml: string) => {
    setYamlContent(yaml);
    setYamlUserEdited(true);

    // Parse basic fields from YAML
    const parsed = parseRouteFromYAML(yaml);
    if (parsed.domain && parsed.backend) {
      setFormState(parsed);
      // Extract advanced config
      setAdvancedConfig(extractAdvancedConfig(yaml, parsed));
      setError(null);
    } else if (yaml.trim()) {
      setError("Invalid YAML: missing required fields (domain, backend)");
    } else {
      setError(null);
    }
  };

  const handleModeChange = (newMode: EditorMode) => {
    if (newMode === "yaml" && !yamlUserEdited) {
      // Switching to YAML mode: sync from current form state
      const baseYaml = buildRouteYAML(formState);
      setYamlContent(mergeAdvancedConfig(baseYaml, advancedConfig));
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
      // Build route with advanced config
      const routeToSubmit: Route = {
        ...formState,
        advancedConfig: yamlUserEdited ? yamlContent : mergeAdvancedConfig(buildRouteYAML(formState), advancedConfig) || undefined,
      };

      // Clean up: if advanced config equals basic config, don't store it
      if (routeToSubmit.advancedConfig) {
        const basicYaml = buildRouteYAML(formState);
        if (routeToSubmit.advancedConfig.trim() === basicYaml.trim()) {
          delete routeToSubmit.advancedConfig;
        }
      }

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

              {advancedConfig && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  ℹ️ This route has advanced configuration. Switch to YAML mode to view/edit.
                </div>
              )}
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
