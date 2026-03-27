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
type RouteFormState = Pick<Route, "domain" | "backend" | "https" | "redirectHttps">;
type LineBlock = {
  name: string;
  start: number;
  end: number;
};

function getResourceName(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "") || "route";
}

/**
 * Build complete YAML from basic route fields
 */
function buildRouteYAML(route: RouteFormState): string {
  const resourceName = getResourceName(route.domain);
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
function parseRouteFromYAML(yaml: string): RouteFormState {
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

function countIndent(line: string): number {
  return line.length - line.trimStart().length;
}

function findHttpRange(lines: string[]): { start: number; end: number } | null {
  const start = lines.findIndex((line) => line.trim() === "http:");
  if (start === -1) {
    return null;
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed && countIndent(lines[i]) === 0 && trimmed.endsWith(":")) {
      end = i;
      break;
    }
  }

  return { start, end };
}

function findSectionRange(
  lines: string[],
  httpRange: { start: number; end: number },
  sectionName: "routers" | "services" | "middlewares",
): { start: number; end: number } | null {
  for (let i = httpRange.start + 1; i < httpRange.end; i++) {
    const trimmed = lines[i].trim();
    if (countIndent(lines[i]) === 2 && trimmed === `${sectionName}:`) {
      let end = httpRange.end;
      for (let j = i + 1; j < httpRange.end; j++) {
        const nextTrimmed = lines[j].trim();
        if (nextTrimmed && countIndent(lines[j]) === 2 && nextTrimmed.endsWith(":")) {
          end = j;
          break;
        }
      }
      return { start: i, end };
    }
  }

  return null;
}

function getSectionBlocks(lines: string[], sectionRange: { start: number; end: number }): LineBlock[] {
  const blocks: LineBlock[] = [];

  for (let i = sectionRange.start + 1; i < sectionRange.end; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || countIndent(lines[i]) !== 4 || !trimmed.endsWith(":")) {
      continue;
    }

    let end = sectionRange.end;
    for (let j = i + 1; j < sectionRange.end; j++) {
      const nextTrimmed = lines[j].trim();
      if (nextTrimmed && countIndent(lines[j]) === 4 && nextTrimmed.endsWith(":")) {
        end = j;
        break;
      }
    }

    blocks.push({
      name: trimmed.slice(0, -1),
      start: i,
      end,
    });
    i = end - 1;
  }

  return blocks;
}

function blockLines(lines: string[], block: LineBlock): string[] {
  return lines.slice(block.start, block.end);
}

function blockHasHostRule(block: string[], domain: string): boolean {
  if (!domain) {
    return false;
  }

  const expectedRule = `Host(\`${domain}\`)`;
  return block.some((line) => line.includes(expectedRule));
}

function blockHasEntryPoint(block: string[], entryPoint: "web" | "websecure"): boolean {
  return block.some((line) => line.trim() === `- ${entryPoint}`);
}

function blockHasTls(block: string[]): boolean {
  return block.some((line) => line.trim().startsWith("tls:"));
}

function extractScalarProperty(block: string[], property: string): string | null {
  for (const line of block) {
    const trimmed = line.trim();
    if (countIndent(line) === 6 && trimmed.startsWith(`${property}:`)) {
      return trimmed.slice(property.length + 1).trim() || null;
    }
  }

  return null;
}

function extractListProperty(block: string[], property: string): string[] {
  const values: string[] = [];

  for (let i = 0; i < block.length; i++) {
    const trimmed = block[i].trim();
    if (countIndent(block[i]) !== 6 || trimmed !== `${property}:`) {
      continue;
    }

    for (let j = i + 1; j < block.length; j++) {
      const child = block[j];
      const childTrimmed = child.trim();
      const indent = countIndent(child);
      if (!childTrimmed) {
        continue;
      }
      if (indent <= 6) {
        break;
      }
      if (indent === 8 && childTrimmed.startsWith("- ")) {
        values.push(childTrimmed.slice(2).trim());
      }
    }
    break;
  }

  return values;
}

function replaceBlock(lines: string[], block: LineBlock, nextBlock: string[]): string[] {
  return [
    ...lines.slice(0, block.start),
    ...nextBlock,
    ...lines.slice(block.end),
  ];
}

function removeBlock(lines: string[], block: LineBlock): string[] {
  return [
    ...lines.slice(0, block.start),
    ...lines.slice(block.end),
  ];
}

function insertBlockIntoSection(
  lines: string[],
  sectionRange: { start: number; end: number },
  block: string[],
): string[] {
  return [
    ...lines.slice(0, sectionRange.end),
    ...block,
    ...lines.slice(sectionRange.end),
  ];
}

function upsertSectionBlock(
  lines: string[],
  httpRange: { start: number; end: number },
  sectionName: "routers" | "middlewares",
  blockName: string,
  block: string[],
): string[] {
  const sectionRange = findSectionRange(lines, httpRange, sectionName);
  if (!sectionRange) {
    return [
      ...lines.slice(0, httpRange.end),
      `  ${sectionName}:`,
      ...block,
      ...lines.slice(httpRange.end),
    ];
  }

  const existing = getSectionBlocks(lines, sectionRange).find((item) => item.name === blockName);
  if (existing) {
    return replaceBlock(lines, existing, block);
  }

  return insertBlockIntoSection(lines, sectionRange, block);
}

function removeSectionBlock(
  lines: string[],
  httpRange: { start: number; end: number },
  sectionName: "routers" | "middlewares",
  blockName: string,
): string[] {
  const sectionRange = findSectionRange(lines, httpRange, sectionName);
  if (!sectionRange) {
    return lines;
  }

  const existing = getSectionBlocks(lines, sectionRange).find((item) => item.name === blockName);
  if (!existing) {
    return lines;
  }

  const nextLines = removeBlock(lines, existing);
  const nextHttpRange = findHttpRange(nextLines);
  if (!nextHttpRange) {
    return nextLines;
  }

  const nextSectionRange = findSectionRange(nextLines, nextHttpRange, sectionName);
  if (!nextSectionRange) {
    return nextLines;
  }

  if (getSectionBlocks(nextLines, nextSectionRange).length > 0) {
    return nextLines;
  }

  return [
    ...nextLines.slice(0, nextSectionRange.start),
    ...nextLines.slice(nextSectionRange.start + 1),
  ];
}

function updateMainRouterBlock(block: string[], https: boolean): string[] {
  const nextBlock: string[] = [];
  let insertedManagedFields = false;

  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    const trimmed = line.trim();
    const indent = countIndent(line);

    if (indent === 6 && trimmed === "entryPoints:") {
      for (i += 1; i < block.length; i++) {
        const child = block[i];
        const childTrimmed = child.trim();
        if (!childTrimmed) {
          continue;
        }
        if (countIndent(child) <= 6) {
          i -= 1;
          break;
        }
      }
      continue;
    }

    if (indent === 6 && trimmed.startsWith("tls:")) {
      for (i += 1; i < block.length; i++) {
        const child = block[i];
        const childTrimmed = child.trim();
        if (!childTrimmed) {
          continue;
        }
        if (countIndent(child) <= 6) {
          i -= 1;
          break;
        }
      }
      continue;
    }

    nextBlock.push(line);
    if (!insertedManagedFields && indent === 6 && trimmed.startsWith("service:")) {
      nextBlock.push("      entryPoints:");
      nextBlock.push(https ? "        - websecure" : "        - web");
      if (https) {
        nextBlock.push("      tls: {}");
      }
      insertedManagedFields = true;
    }
  }

  if (!insertedManagedFields) {
    nextBlock.push("      entryPoints:");
    nextBlock.push(https ? "        - websecure" : "        - web");
    if (https) {
      nextBlock.push("      tls: {}");
    }
  }

  return nextBlock;
}

function buildRedirectRouterBlock(route: RouteFormState, routerName: string, serviceName: string, middlewareName: string): string[] {
  return [
    `    ${routerName}:`,
    `      rule: "Host(\`${route.domain || "example.com"}\`)"`,
    `      service: ${serviceName}`,
    "      entryPoints:",
    "        - web",
    "      middlewares:",
    `        - ${middlewareName}`,
  ];
}

function buildRedirectMiddlewareBlock(middlewareName: string): string[] {
  return [
    `    ${middlewareName}:`,
    "      redirectScheme:",
    "        scheme: https",
    "        permanent: true",
  ];
}

function mergeYamlForRouteChange(yaml: string, prevRoute: RouteFormState, nextRoute: RouteFormState): string {
  let nextYaml = yaml;

  if (prevRoute.domain !== nextRoute.domain) {
    nextYaml = updateYAMLField(nextYaml, "domain", nextRoute.domain);
  }
  if (prevRoute.backend !== nextRoute.backend) {
    nextYaml = updateYAMLField(nextYaml, "backend", nextRoute.backend);
  }
  if (prevRoute.https === nextRoute.https && prevRoute.redirectHttps === nextRoute.redirectHttps) {
    return nextYaml;
  }

  let lines = nextYaml.split("\n");
  const httpRange = findHttpRange(lines);
  if (!httpRange) {
    return buildRouteYAML(nextRoute);
  }

  const routersRange = findSectionRange(lines, httpRange, "routers");
  if (!routersRange) {
    return buildRouteYAML(nextRoute);
  }

  const routerBlocks = getSectionBlocks(lines, routersRange);
  const routerCandidates = routerBlocks.filter((block) =>
    blockHasHostRule(blockLines(lines, block), nextRoute.domain || prevRoute.domain),
  );

  let mainRouter = routerCandidates[0] ?? routerBlocks[0];
  if (prevRoute.redirectHttps) {
    mainRouter =
      routerCandidates.find((block) => {
        const currentBlock = blockLines(lines, block);
        return blockHasEntryPoint(currentBlock, "websecure") || blockHasTls(currentBlock);
      }) ?? mainRouter;
  }

  if (!mainRouter) {
    return buildRouteYAML(nextRoute);
  }

  const currentMainRouter = blockLines(lines, mainRouter);
  const serviceName = extractScalarProperty(currentMainRouter, "service") ?? `${getResourceName(prevRoute.domain)}-service`;
  lines = replaceBlock(lines, mainRouter, updateMainRouterBlock(currentMainRouter, nextRoute.https));

  let redirectRouterName = `${mainRouter.name}-redirect`;
  let redirectMiddlewareName = `${mainRouter.name}-redirect-https`;

  const nextHttpRange = findHttpRange(lines);
  const nextRoutersRange = nextHttpRange ? findSectionRange(lines, nextHttpRange, "routers") : null;
  if (nextRoutersRange) {
    const nextRouterBlocks = getSectionBlocks(lines, nextRoutersRange);
    const redirectRouter = nextRouterBlocks.find((block) => {
      if (block.name === mainRouter.name) {
        return false;
      }
      const currentBlock = blockLines(lines, block);
      return blockHasHostRule(currentBlock, nextRoute.domain || prevRoute.domain)
        && (blockHasEntryPoint(currentBlock, "web") || extractListProperty(currentBlock, "middlewares").length > 0);
    });

    if (redirectRouter) {
      redirectRouterName = redirectRouter.name;
      redirectMiddlewareName = extractListProperty(blockLines(lines, redirectRouter), "middlewares")[0] ?? redirectMiddlewareName;
    }
  }

  if (nextRoute.redirectHttps) {
    const httpAfterRouterUpdate = findHttpRange(lines);
    if (!httpAfterRouterUpdate) {
      return buildRouteYAML(nextRoute);
    }

    lines = upsertSectionBlock(
      lines,
      httpAfterRouterUpdate,
      "routers",
      redirectRouterName,
      buildRedirectRouterBlock(nextRoute, redirectRouterName, serviceName, redirectMiddlewareName),
    );

    const httpAfterRedirectRouter = findHttpRange(lines);
    if (!httpAfterRedirectRouter) {
      return buildRouteYAML(nextRoute);
    }

    lines = upsertSectionBlock(
      lines,
      httpAfterRedirectRouter,
      "middlewares",
      redirectMiddlewareName,
      buildRedirectMiddlewareBlock(redirectMiddlewareName),
    );
  } else {
    const httpAfterRouterUpdate = findHttpRange(lines);
    if (httpAfterRouterUpdate) {
      lines = removeSectionBlock(lines, httpAfterRouterUpdate, "routers", redirectRouterName);
    }

    const httpAfterRedirectRemoval = findHttpRange(lines);
    if (httpAfterRedirectRemoval) {
      lines = removeSectionBlock(lines, httpAfterRedirectRemoval, "middlewares", redirectMiddlewareName);
    }
  }

  return lines.join("\n");
}

function syncYamlWithFormChange(
  prevFormState: RouteFormState,
  nextFormState: RouteFormState,
  yaml: string,
  hasCustomYaml: boolean,
): { yamlContent: string; hasCustomYaml: boolean } {
  if (!hasCustomYaml) {
    return {
      yamlContent: buildRouteYAML(nextFormState),
      hasCustomYaml: false,
    };
  }

  return {
    yamlContent: mergeYamlForRouteChange(yaml, prevFormState, nextFormState),
    hasCustomYaml: true,
  };
}

export function RouteForm({
  open,
  onOpenChange,
  initialRoute,
  submitting,
  onSubmit,
}: RouteFormProps) {
  const [editorState, setEditorState] = useState<{
    yamlContent: string;
    formState: RouteFormState;
    hasCustomYaml: boolean;
  }>({
    yamlContent: "",
    formState: {
      domain: "",
      backend: "",
      https: true,
      redirectHttps: true,
    },
    hasCustomYaml: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("visual");

  const isEditing = Boolean(initialRoute);
  const { formState, hasCustomYaml, yamlContent } = editorState;

  useEffect(() => {
    if (!open) return;

    const route = initialRoute ?? emptyRoute;
    const nextYamlContent = route.advancedConfig && route.advancedConfig.trim()
      ? route.advancedConfig
      : buildRouteYAML(route);

    setEditorState({
      yamlContent: nextYamlContent,
      hasCustomYaml: Boolean(route.advancedConfig && route.advancedConfig.trim()),
      formState: {
        domain: route.domain,
        backend: route.backend,
        https: route.https,
        redirectHttps: route.redirectHttps,
      },
    });

    setError(null);
    setMode("visual");
  }, [initialRoute, open]);

  // Sync form state from YAML when YAML changes
  const syncFormFromYaml = (yaml: string) => {
    const parsed = parseRouteFromYAML(yaml);
    setEditorState((prev) => ({
      ...prev,
      formState: parsed,
    }));
  };

  const updateFormState = (updater: (prev: RouteFormState) => RouteFormState) => {
    setEditorState((prev) => {
      const nextFormState = updater(prev.formState);
      const nextYamlState = syncYamlWithFormChange(
        prev.formState,
        nextFormState,
        prev.yamlContent,
        prev.hasCustomYaml,
      );

      return {
        ...prev,
        formState: nextFormState,
        ...nextYamlState,
      };
    });
  };

  const updateField = <K extends keyof RouteFormState>(key: K, value: RouteFormState[K]) => {
    updateFormState((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleYamlChange = (yaml: string) => {
    const parsed = parseRouteFromYAML(yaml);
    setEditorState((prev) => ({
      ...prev,
      yamlContent: yaml,
      hasCustomYaml: true,
      formState: parsed,
    }));

    if (yaml.trim()) {
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
                      updateFormState((prev) => ({
                        ...prev,
                        https: checked,
                        redirectHttps: checked ? prev.redirectHttps : false,
                      }));
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
