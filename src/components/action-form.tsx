"use client";

import { Loader2, Save } from "lucide-react";
import { useActionState } from "react";
import { cn } from "@/lib/utils";

type ActionState = {
  ok: boolean;
  message: string;
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

export function ActionForm({
  action,
  children,
  submitLabel,
  className,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={cn("space-y-4", className)}>
      {children}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {pending ? "Salvando..." : submitLabel}
        </button>
        {state.message ? (
          <p
            className={cn(
              "text-sm font-medium",
              state.ok ? "text-success" : "text-danger",
            )}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-semibold text-charcoal">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-charcoal outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-orange-200";

export const textareaClass =
  "min-h-24 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-charcoal outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-orange-200";
