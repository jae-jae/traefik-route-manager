import { Pencil, Trash2 } from "lucide-react";

import type { Route } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RouteListProps {
  routes: Route[];
  onEdit: (route: Route) => void;
  onDelete: (route: Route) => void;
}

export function RouteList({ routes, onEdit, onDelete }: RouteListProps) {
  return (
    <>
      {/* Mobile card view */}
      <div className="flex flex-col gap-3 md:hidden">
        {routes.map((route) => (
          <div
            key={route.domain}
            className="rounded-2xl border border-border bg-white/90 p-4"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{route.domain}</p>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {route.backend}
                </p>
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Badge variant={route.https ? "success" : "outline"} className="text-xs">
                {route.https ? "HTTPS" : "HTTP"}
              </Badge>
              <Badge variant={route.redirectHttps ? "default" : "warning"} className="text-xs">
                {route.redirectHttps ? "301 redirect" : "Direct"}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onEdit(route)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={() => onDelete(route)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden overflow-hidden rounded-[28px] border border-border bg-white/90 md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Backend</TableHead>
                <TableHead>Security</TableHead>
                <TableHead>Redirect</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes.map((route) => (
                <TableRow key={route.domain}>
                  <TableCell className="font-semibold text-slate-900">{route.domain}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {route.backend}
                  </TableCell>
                  <TableCell>
                    <Badge variant={route.https ? "success" : "outline"}>
                      {route.https ? "HTTPS" : "HTTP"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={route.redirectHttps ? "default" : "warning"}>
                      {route.redirectHttps ? "301 redirect" : "Direct"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => onEdit(route)}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => onDelete(route)}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
