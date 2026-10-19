import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "neutral" | "accent" | "danger" | "success";
}) {
  const tones = {
    neutral: "bg-charcoal text-white",
    accent: "bg-accent text-accent-foreground",
    danger: "bg-danger text-white",
    success: "bg-success text-white",
  };

  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold text-charcoal">{value}</p>
        </div>
        <span className={cn("flex size-10 items-center justify-center rounded-md", tones[tone])}>
          <Icon className="size-5" />
        </span>
      </div>
      {hint ? <p className="mt-3 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
