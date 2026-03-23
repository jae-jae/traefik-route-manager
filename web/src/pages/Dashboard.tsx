import { startTransition, type ReactNode, useEffect, useMemo, useState } from "react";
import { Globe2, LogOut, Plus, RefreshCcw, Shield, TrafficCone } from "lucide-react";

import {
  ApiError,
  createRoute,
  deleteRoute,
  listRoutes,
  type Route,
  updateRoute,
} from "@/api/client";
import { RouteForm } from "@/components/RouteForm";
import { RouteList } from "@/components/RouteList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

export function Dashboard({ token, onLogout }: DashboardProps) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [deletingRoute, setDeletingRoute] = useState<Route | null>(null);

  const httpsCount = useMemo(() => routes.filter((route) => route.https).length, [routes]);
  const redirectCount = useMemo(
    () => routes.filter((route) => route.redirectHttps).length,
    [routes],
  );

  const loadRoutes = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await listRoutes(token);
      startTransition(() => {
        setRoutes(response.routes);
      });
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        onLogout();
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Failed to load routes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRoutes();
  }, []);

  const handleCreateClick = () => {
    setEditingRoute(null);
    setFormOpen(true);
  };

  const handleEditClick = (route: Route) => {
    setEditingRoute(route);
    setFormOpen(true);
  };

  const handleSubmit = async (route: Route) => {
    setSubmitting(true);

    try {
      if (editingRoute) {
        await updateRoute(token, editingRoute.domain, route);
      } else {
        await createRoute(token, route);
      }

      setFormOpen(false);
      setEditingRoute(null);
      await loadRoutes();
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 401) {
        onLogout();
      }
      throw submitError;
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRoute) {
      return;
    }

    setDeleting(true);
    try {
      await deleteRoute(token, deletingRoute.domain);
      setDeletingRoute(null);
      await loadRoutes();
    } catch (deleteError) {
      if (deleteError instanceof ApiError && deleteError.status === 401) {
        onLogout();
        return;
      }
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete route");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="panel-noise min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 md:gap-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Traefik Routes</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage reverse proxy routes for your domains
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadRoutes()} disabled={loading}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={handleCreateClick}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Route</span>
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3 md:gap-4">
          <MetricCard
            icon={<Globe2 className="h-5 w-5 text-sky-600" />}
            label="Domains"
            value={routes.length}
          />
          <MetricCard
            icon={<Shield className="h-5 w-5 text-emerald-600" />}
            label="HTTPS"
            value={httpsCount}
          />
          <MetricCard
            icon={<TrafficCone className="h-5 w-5 text-amber-600" />}
            label="Redirects"
            value={redirectCount}
          />
        </section>

        <Card className="animate-fade-up">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Route List</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="rounded-2xl border border-dashed border-border bg-slate-50/70 px-6 py-10 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : routes.length > 0 ? (
              <RouteList routes={routes} onEdit={handleEditClick} onDelete={setDeletingRoute} />
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-slate-50/70 px-6 py-10 text-center">
                <p className="text-muted-foreground">No routes configured</p>
                <Button className="mt-4" size="sm" onClick={handleCreateClick}>
                  <Plus className="h-4 w-4" />
                  Add First Route
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RouteForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditingRoute(null);
          }
        }}
        initialRoute={editingRoute}
        submitting={submitting}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={Boolean(deletingRoute)} onOpenChange={(open) => !open && setDeletingRoute(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Route</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deletingRoute?.domain}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setDeletingRoute(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: number;
}

function MetricCard({ icon, label, value }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
        <div className="rounded-xl bg-slate-100 p-2.5">{icon}</div>
      </CardContent>
    </Card>
  );
}
