"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { CheckCircle2, Clock, Lock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fleetApi, r156Api, suApi } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { FleetVehicle, RxswinDetail, RxswinListItem, SuDetail, SuStatus } from "@/types/r156";
import { apiError, Field, Select, Textarea } from "./shared";

const SU_STYLES: Record<SuStatus, string> = {
  draft: "bg-amber-50 text-amber-800 border-amber-200",
  released: "bg-green-50 text-green-800 border-green-200",
  superseded: "bg-gray-100 text-gray-500 border-gray-200",
};

export function SuStatusBadge({ status }: { status: SuStatus }) {
  const t = useTranslations("su");
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", SU_STYLES[status])}>
      {status === "released" && <Lock className="h-3 w-3" />}
      {t(`status_${status}`)}
    </span>
  );
}

export function VvBadge({ status }: { status: "pending" | "pass" | "fail" }) {
  const t = useTranslations("su");
  const Icon = status === "pass" ? CheckCircle2 : status === "fail" ? XCircle : Clock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        status === "pass" ? "text-green-700" : status === "fail" ? "text-red-600" : "text-gray-400"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {t(`vv_${status}`)}
    </span>
  );
}

export function Section({
  title,
  refText,
  actions,
  children,
}: {
  title: string;
  refText?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50/70 px-5 py-2.5">
        <h3 className="text-sm font-semibold text-gray-900">
          {title}
          {refText && <span className="ml-2 text-xs font-normal text-gray-400">UN R156 {refText}</span>}
        </h3>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

// Da / Ne / ni odločeno — null je veljavna vrednost (odločitev še ni sprejeta)
export function YesNo({
  value,
  onChange,
  disabled,
  allowUnset = true,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  disabled?: boolean;
  allowUnset?: boolean;
}) {
  const t = useTranslations("su");
  const opts: { v: boolean | null; label: string }[] = [
    ...(allowUnset ? [{ v: null, label: t("notSet") }] : []),
    { v: true, label: t("yes") },
    { v: false, label: t("no") },
  ];
  return (
    <div className="inline-flex rounded-md border bg-white p-0.5">
      {opts.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded px-3 py-1 text-xs font-medium transition-colors disabled:cursor-default",
            value === o.v ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100 disabled:hover:bg-transparent"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Dialogi ──────────────────────────────────────────────────────────────────

export function AddRxswinDialog({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: SuDetail }) {
  const t = useTranslations("su");
  const tr = useTranslations("r156");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [rxswinId, setRxswinId] = useState("");
  const [baselineId, setBaselineId] = useState("");

  const { data: rxswins = [] } = useQuery<RxswinListItem[]>({ queryKey: ["rxswins"], queryFn: r156Api.rxswins, enabled: open });
  const used = new Set(doc.affected_rxswins.map((a) => a.rxswin_id));
  const choices = rxswins.filter((r) => r.vehicle_type_id === doc.vehicle_type_id && !used.has(r.id) && r.status === "active");
  const { data: detail } = useQuery<RxswinDetail>({
    queryKey: ["rxswin", rxswinId],
    queryFn: () => r156Api.rxswin(rxswinId),
    enabled: open && !!rxswinId,
  });
  const baselines = (detail?.baselines ?? []).filter((b) => b.status !== "superseded");

  useEffect(() => {
    if (open) {
      setRxswinId("");
      setBaselineId("");
    }
  }, [open]);
  useEffect(() => {
    if (!rxswinId && choices.length) setRxswinId(choices[0].id);
  }, [rxswinId, choices]);
  useEffect(() => {
    // privzeto: odprt osnutek (nova programska oprema), sicer veljavni izdani
    if (detail && !baselines.some((b) => b.id === baselineId)) setBaselineId(baselines[0]?.id ?? "");
  }, [detail, baselines, baselineId]);

  const mutation = useMutation({
    mutationFn: () => suApi.addRxswin(doc.id, { rxswin_id: rxswinId, baseline_after_id: baselineId }),
    onSuccess: (d) => {
      qc.setQueryData(["software-update", doc.id], d);
      onClose();
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addRxswin")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("selectRxswin")}>
            <Select value={rxswinId} onChange={(e) => { setRxswinId(e.target.value); setBaselineId(""); }}>
              {choices.length === 0 && <option value="">—</option>}
              {choices.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.rxswin} {r.description ? `— ${r.description.slice(0, 50)}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("selectBaseline")}>
            <Select value={baselineId} onChange={(e) => setBaselineId(e.target.value)}>
              {baselines.length === 0 && <option value="">—</option>}
              {baselines.map((b) => (
                <option key={b.id} value={b.id}>
                  {tr("baseline", { number: b.baseline_number })} — {tr(`status_${b.status}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!rxswinId || !baselineId || mutation.isPending}>
            {mutation.isPending && <Spinner className="h-3.5 w-3.5" />}
            {tc("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddTargetsDialog({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: SuDetail }) {
  const t = useTranslations("su");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: vehicles = [], isLoading } = useQuery<FleetVehicle[]>({
    queryKey: ["fleet", doc.vehicle_type_id],
    queryFn: () => fleetApi.list(doc.vehicle_type_id),
    enabled: open,
  });
  const already = useMemo(() => new Set(doc.targets.map((x) => x.vehicle_id)), [doc.targets]);
  const free = vehicles.filter((v) => !already.has(v.id));

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const mutation = useMutation({
    mutationFn: () => suApi.addTargets(doc.id, Array.from(selected)),
    onSuccess: (d) => {
      qc.setQueryData(["software-update", doc.id], d);
      onClose();
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addTargets")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500">{t("addTargetsHint", { type: doc.vehicle_type_name })}</p>
        <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border">
          {isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Spinner />
            </div>
          ) : free.length === 0 ? (
            <p className="p-4 text-center text-sm text-gray-400">—</p>
          ) : (
            <>
              <label className="flex items-center gap-3 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                <input
                  type="checkbox"
                  checked={selected.size === free.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(free.map((v) => v.id)) : new Set())}
                />
                {tc("all")}
              </label>
              {free.map((v) => (
                <label key={v.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-0 hover:bg-gray-50">
                  <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} />
                  <span className="font-mono">{v.vin}</span>
                  <span className="text-gray-500">{v.name}</span>
                </label>
              ))}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={selected.size === 0 || mutation.isPending}>
            {mutation.isPending && <Spinner className="h-3.5 w-3.5" />}
            {tc("add")} ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VvSignDialog({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: SuDetail }) {
  const t = useTranslations("su");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [status, setStatus] = useState<"pass" | "fail">("pass");
  const [method, setMethod] = useState("");

  useEffect(() => {
    if (open) {
      setStatus(doc.vv_status === "fail" ? "fail" : "pass");
      setMethod(doc.vv_method ?? "");
    }
  }, [open, doc.vv_status, doc.vv_method]);

  const mutation = useMutation({
    mutationFn: () => suApi.signVv(doc.id, { vv_status: status, vv_method: method.trim() }),
    onSuccess: (d) => {
      qc.setQueryData(["software-update", doc.id], d);
      onClose();
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("vvSignTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">{t("vvSignHint")}</p>
        <div className="mt-3 space-y-3">
          <div className="inline-flex rounded-md border bg-white p-0.5">
            {(["pass", "fail"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded px-4 py-1 text-sm font-medium",
                  status === s ? (s === "pass" ? "bg-green-600 text-white" : "bg-red-600 text-white") : "text-gray-600 hover:bg-gray-100"
                )}
              >
                {t(`vv_${s}`)}
              </button>
            ))}
          </div>
          <Field label={`${t("vvMethod")} *`}>
            <Textarea rows={3} value={method} onChange={(e) => setMethod(e.target.value)} placeholder="HIL test report TR-116, vehicle test ES03-07" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!method.trim() || mutation.isPending}>
            {mutation.isPending && <Spinner className="h-3.5 w-3.5" />}
            {t("vvSign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NotificationDialog({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: SuDetail }) {
  const t = useTranslations("su");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [method, setMethod] = useState("");

  useEffect(() => {
    if (open) setMethod(doc.user_notification_method ?? "");
  }, [open, doc.user_notification_method]);

  const mutation = useMutation({
    mutationFn: () => suApi.recordNotification(doc.id, method.trim()),
    onSuccess: (d) => {
      qc.setQueryData(["software-update", doc.id], d);
      onClose();
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("recordNotification")}</DialogTitle>
        </DialogHeader>
        <Field label={t("notificationMethod")}>
          <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder={t("notificationPlaceholder")} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!method.trim() || mutation.isPending}>
            {mutation.isPending && <Spinner className="h-3.5 w-3.5" />}
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
