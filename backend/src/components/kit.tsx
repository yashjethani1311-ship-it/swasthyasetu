import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return <As className={cn("card-base p-5", className)}>{children}</As>;
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
          <h2 className="text-lg font-semibold">{title}</h2>
          {sub ? <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p> : null}
        </div>
      </div>
      {right}
    </div>
  );
}

type Tone = "neutral" | "primary" | "teal" | "success" | "warning" | "danger" | "outline";

const toneMap: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  teal: "bg-teal/12 text-teal",
  success: "bg-success/12 text-success",
  warning: "bg-warning/18 text-warning-foreground",
  danger: "bg-destructive/10 text-destructive",
  outline: "border border-border text-muted-foreground",
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
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase",
        toneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

type BtnVariant = "primary" | "teal" | "outline" | "ghost" | "danger" | "success";

const btnMap: Record<BtnVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  teal: "bg-teal text-teal-foreground hover:bg-teal/90",
  outline: "border border-border bg-card text-foreground hover:bg-secondary",
  ghost: "text-foreground hover:bg-secondary",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  success: "bg-success text-success-foreground hover:bg-success/90",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "md" && "px-4 py-2 text-sm",
        size === "lg" && "px-5 py-3 text-sm",
        btnMap[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="label-xs">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
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
        <p className="mt-1.5 text-2xl font-semibold">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {icon ? (
        <span className={cn("grid size-9 place-items-center rounded-lg", toneMap[tone])}>{icon}</span>
      ) : null}
    </Card>
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
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 text-[10px] font-bold",
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
      <div
        className={cn(
          "w-full rounded-xl border border-border bg-card px-4 py-3 text-center shadow-card",
        )}
      >
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
    <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export function RxStatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "FULLY DISPENSED"
      ? "success"
      : status === "PARTIALLY DISPENSED"
        ? "warning"
        : status === "CANCELLED" || status === "EXPIRED"
          ? "danger"
          : status === "ACTIVE"
            ? "teal"
            : "primary";
  return <Badge tone={tone}>{status}</Badge>;
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
