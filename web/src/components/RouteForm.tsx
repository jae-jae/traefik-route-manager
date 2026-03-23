import { type FormEvent, useEffect, useState } from "react";

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

export function RouteForm({
  open,
  onOpenChange,
  initialRoute,
  submitting,
  onSubmit,
}: RouteFormProps) {
  const [formState, setFormState] = useState<Route>(emptyRoute);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setFormState(initialRoute ?? emptyRoute);
    setError(null);
  }, [initialRoute, open]);

  const isEditing = Boolean(initialRoute);

  const updateField = <K extends keyof Route>(key: K, value: Route[K]) => {
    setFormState((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await onSubmit(formState);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Request failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Route" : "New Route"}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
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
