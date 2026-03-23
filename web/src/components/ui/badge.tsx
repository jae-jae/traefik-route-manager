import * as React from "react";

import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "outline" | "success" | "warning";
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-sky-500/15 text-sky-700",
  outline: "border border-border bg-white/80 text-foreground",
  success: "bg-emerald-500/15 text-emerald-700",
  warning: "bg-amber-500/20 text-amber-700",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
