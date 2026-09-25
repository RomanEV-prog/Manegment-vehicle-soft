"use client";

import { useRef, useState } from "react";
import type { AxiosError } from "axios";
import { CheckCircle2, FileSearch, Lock, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n";
import { isSha256, sha256File } from "@/lib/sha256";
import { useAuth } from "@/hooks/useAuth";
import type { BaselineStatus } from "@/types/r156";

// Napaka iz FastAPI: detail je niz ali seznam validacijskih napak
export function apiError(e: unknown, fallback: string): string {
  const detail = (e as AxiosError<{ detail?: unknown }>)?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { msg?: string; loc?: unknown[] }) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "";
        return `${field ? `${field}: ` : ""}${(d.msg ?? "").replace(/^Value error, /, "")}`;
      })
      .join("; ");
  }
  return fallback;
}

export function usePermissions() {
  const { user, payload } = useAuth();
  const role = user?.role ?? payload?.role;
  return {
    canEdit: !!role && role !== "partner_viewer",
    canRelease: role === "admin" || role === "qc_manager",
  };
}

const STATUS_STYLES: Record<BaselineStatus, string> = {
  draft: "bg-amber-50 text-amber-800 border-amber-200",
  released: "bg-green-50 text-green-800 border-green-200",
  superseded: "bg-gray-100 text-gray-500 border-gray-200",
};

export function BaselineStatusBadge({ status, className }: { status: BaselineStatus; className?: string }) {
  const t = useTranslations("r156");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className
      )}
    >
      {status === "released" && <Lock className="h-3 w-3" />}
      {t(`status_${status}`)}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        props.className
      )}
    />
  );
}

// Polje za SHA-256 z izračunom iz datoteke (datoteka ostane v brskalniku)
export function ShaInput({
  value,
  onChange,
  onFile,
}: {
  value: string;
  onChange: (v: string) => void;
  onFile?: (fileName: string) => void;
}) {
  const t = useTranslations("r156");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();
  const valid = isSha256(trimmed);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const h = await sha256File(file);
      onChange(h.sha256);
      onFile?.(h.fileName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="64 hex"
            spellCheck={false}
            className={cn(
              "pr-8 font-mono text-xs",
              trimmed && !valid && "border-red-300 focus-visible:ring-red-300"
            )}
          />
          {trimmed &&
            (valid ? (
              <CheckCircle2 className="absolute right-2 top-2.5 h-4 w-4 text-green-600" aria-label={t("shaOk")} />
            ) : (
              <AlertCircle className="absolute right-2 top-2.5 h-4 w-4 text-red-500" aria-label={t("shaMissing")} />
            ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Spinner className="h-3.5 w-3.5" /> : <FileSearch className="h-3.5 w-3.5" />}
          {busy ? t("computing") : t("computeFromFile")}
        </Button>
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  destructive,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const tc = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">{text}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner className="h-3.5 w-3.5" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
