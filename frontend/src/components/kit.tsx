import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Search,
  X
} from "lucide-react";

export function Card({
  children,
  className,
  as: As = "div",
  tinted = false,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  tinted?: boolean;
}) {
  return (
    <As className={cn(tinted ? "card-tinted p-5" : "card-base p-5", className)}>
      {children}
    </As>
  );
}

export function SectionTitle({
  title,
  sub,
  right,
  icon,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
            {icon}
          </span>
        ) : null}
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {sub ? <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p> : null}
        </div>
      </div>
      {right}
    </div>
  );
}

export type Tone =
  | "neutral"
  | "primary"
  | "teal"
  | "success"
  | "warning"
  | "danger"
  | "outline"
  | "emergency"
  | "urgent"
  | "routine"
  | "info";

const toneMap: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  primary: "bg-primary/10 text-primary border-primary/20",
  teal: "bg-teal/15 text-teal border-teal/25",
  success: "bg-success/15 text-success border-success/25",
  warning: "bg-warning/20 text-warning-foreground border-warning/30",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  emergency: "bg-emergency/15 text-emergency border-emergency/30 font-bold",
  urgent: "bg-urgent/20 text-urgent-foreground border-urgent/35",
  routine: "bg-muted text-muted-foreground border-border",
  info: "bg-info/15 text-info border-info/25",
  outline: "border border-border bg-background text-muted-foreground",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase font-tabular",
        toneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge tone="neutral">—</Badge>;

  const s = status.toUpperCase().trim();
  let tone: Tone = "neutral";

  if (["COMPLETED", "CONFIRMED", "VERIFIED", "APPROVED", "FULLY DISPENSED", "ACTIVE", "READY"].includes(s)) {
    tone = "success";
  } else if (["IN_PROGRESS", "AWAITING_VERIFICATION", "PARTIALLY DISPENSED", "COLLECTION_PENDING"].includes(s)) {
    tone = "warning";
  } else if (["CANCELLED", "REJECTED", "EXPIRED", "SUSPENDED", "FAILED"].includes(s)) {
    tone = "danger";
  } else if (["PENDING", "OPEN", "NOT_LINKED", "DEMO", "QUEUED"].includes(s)) {
    tone = "primary";
  } else if (["EMERGENCY", "CRITICAL"].includes(s)) {
    tone = "emergency";
  }

  return <Badge tone={tone}>{status.replace(/_/g, " ")}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  if (!priority) return null;
  const p = priority.toUpperCase().trim();

  let tone: Tone = "neutral";
  if (p === "EMERGENCY" || p === "IMMEDIATE") tone = "emergency";
  else if (p === "URGENT" || p === "HIGH") tone = "urgent";
  else if (p === "PRIORITY" || p === "MEDIUM") tone = "warning";
  else tone = "routine";

  return <Badge tone={tone}>{p}</Badge>;
}

export type BtnVariant = "primary" | "teal" | "outline" | "ghost" | "danger" | "success" | "subtle";

const btnMap: Record<BtnVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
  teal: "bg-teal text-teal-foreground hover:bg-teal/90 shadow-sm",
  outline: "border border-border bg-card text-foreground hover:bg-secondary shadow-xs",
  ghost: "text-foreground hover:bg-secondary",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
  success: "bg-success text-success-foreground hover:bg-success/90 shadow-sm",
  subtle: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 select-none",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "md" && "px-4 py-2 text-sm",
        size === "lg" && "px-5 py-2.5 text-base",
        btnMap[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin shrink-0" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <p className="label-xs">{label}</p>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "primary",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <Card className="flex items-start justify-between gap-3">
      <div>
        <p className="label-xs">{label}</p>
        <p className="mt-1.5 text-2xl font-bold font-tabular tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {icon ? (
        <span className={cn("grid size-10 place-items-center rounded-xl", toneMap[tone])}>
          {icon}
        </span>
      ) : null}
    </Card>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  onClear,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  onClear?: () => void;
}) {
  return (
    <div className={cn("relative flex items-center", className)}>
      <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
          className="absolute right-2.5 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export type TableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  width?: string;
  render?: (row: T) => ReactNode;
};

export function ClinicalTable<T>({
  columns,
  data,
  keyField,
  loading = false,
  emptyMessage = "No records found in this view.",
  onRowClick,
  compact = false,
}: {
  columns: TableColumn<T>[];
  data: T[];
  keyField: keyof T;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  compact?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-subtle">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn(
                    "label-xs font-semibold px-4 py-3 text-muted-foreground",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 w-3/4 rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const key = String(row[keyField]);
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "transition-colors",
                      onRowClick ? "cursor-pointer hover:bg-secondary/60" : "hover:bg-secondary/30",
                    )}
                  >
                    {columns.map((col) => {
                      const val = (row as Record<string, unknown>)[col.key];
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-4 text-sm text-foreground",
                            compact ? "py-2.5" : "py-3.5",
                            col.align === "right" && "text-right font-tabular",
                            col.align === "center" && "text-center",
                          )}
                        >
                          {col.render ? col.render(row) : (val as ReactNode) ?? "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SegmentedTabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: string; label: string; count?: number; icon?: ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1 rounded-xl border border-border bg-surface-subtle p-1",
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all select-none",
              active
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {typeof tab.count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-bold font-tabular",
                  active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function AlertBanner({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warning" | "emergency" | "success";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const icon =
    tone === "emergency" ? (
      <AlertCircle className="size-5 shrink-0 text-emergency" />
    ) : tone === "warning" ? (
      <AlertTriangle className="size-5 shrink-0 text-warning-foreground" />
    ) : tone === "success" ? (
      <CheckCircle2 className="size-5 shrink-0 text-success" />
    ) : (
      <Info className="size-5 shrink-0 text-info" />
    );

  const style =
    tone === "emergency"
      ? "border-emergency/30 bg-emergency/10 text-foreground"
      : tone === "warning"
        ? "border-warning/30 bg-warning/15 text-foreground"
        : tone === "success"
          ? "border-success/30 bg-success/10 text-foreground"
          : "border-info/30 bg-info/10 text-foreground";

  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-xl border p-4", style, className)}>
      <div className="flex items-start gap-3">
        {icon}
        <div>
          {title ? <p className="text-sm font-semibold">{title}</p> : null}
          <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{children}</div>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

export function SkeletonCard() {
  return (
    <Card className="space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-3/4" />
    </Card>
  );
}

export function TruthfulEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  schemaContractNotice?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface-subtle/50 p-8 text-center">
      {icon ? (
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>



      {action ? <div className="mt-5 flex justify-center gap-3">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div
        className={cn(
          "w-full rounded-2xl border border-border bg-card p-6 shadow-pop animate-in fade-in zoom-in-95",
          maxWidth,
        )}
      >
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Timeline({
  steps,
  current,
  labels,
}: {
  steps: string[];
  current: number;
  labels?: string[];
}) {
  return (
    <ol className="relative space-y-0">
      {steps.map((s, i) => {
        const done = i <= current;
        return (
          <li key={s} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 text-[10px] font-bold font-tabular",
                  done
                    ? "border-teal bg-teal text-teal-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              {i < steps.length - 1 ? (
                <span className={cn("my-1 w-0.5 flex-1", i < current ? "bg-teal" : "bg-border")} />
              ) : null}
            </div>
            <div className="pb-5">
              <p className={cn("text-sm font-semibold", !done && "text-muted-foreground")}>{s}</p>
              {labels?.[i] ? (
                <p className="text-xs text-muted-foreground">{labels[i]}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ChainNode({
  label,
  value,
  tone = "primary",
  last,
}: {
  label: string;
  value: string;
  tone?: Tone;
  last?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-full rounded-xl border border-border bg-card px-4 py-3 text-center shadow-card">
        <p className="label-xs">{label}</p>
        <p className="mt-1 text-sm font-semibold">{value}</p>
      </div>
      {!last ? <span className="my-1 h-5 w-0.5 bg-border" /> : null}
      <span className={cn("hidden", toneMap[tone])} />
    </div>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-surface-subtle px-3 py-2 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export function RxStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-subtle p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
