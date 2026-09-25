"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, ChevronDown, ChevronRight, ClipboardCheck, Lock, Save, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fleetApi, r156Api } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { cn, formatDateTime } from "@/lib/utils";
import type { EcuInstance, RxswinDetail, RxswinListItem, VehicleConfig, VehicleR156 } from "@/types/r156";
import { apiError, Field, Select, usePermissions } from "@/components/r156/shared";
import { Section } from "@/components/r156/su";

function shortSha(v: string | null) {
  return v ? `${v.slice(0, 10)}…${v.slice(-6)}` : "—";
}

function ConfigView({ cfg }: { cfg: VehicleConfig }) {
  const t = useTranslations("vehicleCfg");
  const tr = useTranslations("r156");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
          <Lock className="h-3 w-3" />
          {t(`type_${cfg.config_type}`)}
        </span>
        <span className="font-mono font-semibold">{cfg.config_id}</span>
        {cfg.reason && (
          <span className="text-gray-600">
            {cfg.software_update_id ? (
              <Link href={`/software-updates/${cfg.software_update_id}`} className="text-blue-600 hover:underline">
                {cfg.reason}
              </Link>
            ) : (
              cfg.reason
            )}
          </span>
        )}
        <span className="text-xs text-gray-400">{t("recordedAt", { date: formatDateTime(cfg.created_at), name: cfg.created_by_name ?? "—" })}</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
        {cfg.system_schemes_baseline && (
          <span>
            {t("systemSchemes")}: <b className="text-gray-700">{cfg.system_schemes_baseline}</b>
          </span>
        )}
        {cfg.erp_work_order && (
          <span>
            {t("erpWo")}: <b className="text-gray-700">{cfg.erp_work_order}</b>
          </span>
        )}
        {cfg.vv_status && (
          <span>
            {t("vvStatus")}: <b className="text-gray-700">{cfg.vv_status}</b>
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-gray-400">
          <tr>
            <th className="pb-1.5">RXSWIN</th>
            <th className="pb-1.5">ECU</th>
            <th className="pb-1.5">{tr("swVersion")}</th>
            <th className="pb-1.5">{tr("swSha")}</th>
            <th className="pb-1.5">{tr("configVersion")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {cfg.snapshot.rxswins.flatMap((r) =>
            r.items.map((i, idx) => (
              <tr key={`${r.rxswin_id}-${i.ecu_id}`}>
                <td className="py-1.5 align-top">
                  {idx === 0 && (
                    <Link href={`/rxswins/${r.rxswin_id}`} className="font-mono font-semibold text-blue-700 hover:underline">
                      {r.rxswin} · B{r.baseline_number}
                    </Link>
                  )}
                </td>
                <td className="py-1.5">{i.ecu}</td>
                <td className="py-1.5 font-mono text-xs">{i.sw_version}</td>
                <td className="py-1.5 font-mono text-xs" title={i.sw_file_sha256 ?? ""}>
                  {shortSha(i.sw_file_sha256)}
                </td>
                <td className="py-1.5 font-mono text-xs">{i.sw_config_version ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function EolDialog({ open, onClose, vehicle }: { open: boolean; onClose: () => void; vehicle: VehicleR156 }) {
  const t = useTranslations("vehicleCfg");
  const tr = useTranslations("r156");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ config_id: "", system_schemes_baseline: "", erp_work_order: "", vv_status: "pass" as "pass" | "fail" | "pending" });

  const { data: rxswins = [] } = useQuery<RxswinListItem[]>({ queryKey: ["rxswins"], queryFn: r156Api.rxswins, enabled: open });
  const ofType = rxswins.filter((r) => r.vehicle_type_id === vehicle.vehicle_type_id && r.status === "active");
  const { data: details = [] } = useQuery<RxswinDetail[]>({
    queryKey: ["rxswin-details", ofType.map((r) => r.id).join(",")],
    queryFn: () => Promise.all(ofType.map((r) => r156Api.rxswin(r.id))),
    enabled: open && ofType.length > 0,
  });

  useEffect(() => {
    if (!open) return;
    setForm({ config_id: `EOL-${vehicle.vin}`, system_schemes_baseline: "", erp_work_order: "", vv_status: "pass" });
    setPicked({});
  }, [open, vehicle.vin]);
  useEffect(() => {
    // privzeto: veljavni izdani baseline vsakega RXSWIN-a
    if (!details.length) return;
    setPicked((p) => {
      const next = { ...p };
      for (const d of details) {
        if (next[d.id] === undefined) next[d.id] = d.baselines.find((b) => b.status === "released")?.id ?? "";
      }
      return next;
    });
  }, [details]);

  const mutation = useMutation({
    mutationFn: () =>
      fleetApi.createEol(vehicle.id, {
        rxswin_baselines: Object.entries(picked)
          .filter(([, b]) => b)
          .map(([rxswin_id, baseline_id]) => ({ rxswin_id, baseline_id })),
        config_id: form.config_id.trim() || null,
        system_schemes_baseline: form.system_schemes_baseline.trim() || null,
        erp_work_order: form.erp_work_order.trim() || null,
        vv_status: form.vv_status,
      }),
    onSuccess: (d) => {
      qc.setQueryData(["vehicle-r156", vehicle.id], d);
      toast.success(t("recorded"));
      onClose();
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  const selectedCount = Object.values(picked).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("eolTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">{t("eolHint")}</p>
        <div className="mt-3 space-y-2 rounded-lg border p-3">
          {details.length === 0 && <p className="text-sm text-gray-400">—</p>}
          {details.map((d) => (
            <div key={d.id} className="grid grid-cols-[140px_1fr] items-center gap-3">
              <span className="font-mono text-sm font-semibold">{d.rxswin}</span>
              <Select value={picked[d.id] ?? ""} onChange={(e) => setPicked({ ...picked, [d.id]: e.target.value })}>
                <option value="">{t("notInstalled")}</option>
                {d.baselines
                  .filter((b) => b.status !== "draft")
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {tr("baseline", { number: b.baseline_number })} — {tr(`status_${b.status}`)} ·{" "}
                      {b.items.map((i) => `${i.ecu_name} ${i.sw_version}`).join(", ")}
                    </option>
                  ))}
              </Select>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label={t("configId")}>
            <Input value={form.config_id} onChange={(e) => setForm({ ...form, config_id: e.target.value })} className="font-mono" />
          </Field>
          <Field label={t("systemSchemes")}>
            <Input value={form.system_schemes_baseline} onChange={(e) => setForm({ ...form, system_schemes_baseline: e.target.value })} />
          </Field>
          <Field label={t("erpWo")}>
            <Input value={form.erp_work_order} onChange={(e) => setForm({ ...form, erp_work_order: e.target.value })} />
          </Field>
          <Field label={t("vvStatus")}>
            <Select value={form.vv_status} onChange={(e) => setForm({ ...form, vv_status: e.target.value as "pass" | "fail" | "pending" })}>
              <option value="pass">pass</option>
              <option value="fail">fail</option>
              <option value="pending">pending</option>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={selectedCount === 0 || mutation.isPending}>
            {mutation.isPending && <Spinner className="h-3.5 w-3.5" />}
            {t("recordEol")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FleetVehiclePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("vehicleCfg");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { canEdit } = usePermissions();
  const [ecus, setEcus] = useState<EcuInstance[]>([]);
  const [eolOpen, setEolOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: v, isLoading } = useQuery<VehicleR156>({ queryKey: ["vehicle-r156", id], queryFn: () => fleetApi.r156(id) });
  useEffect(() => {
    if (v) setEcus(v.ecu_instances);
  }, [v]);

  const dirty = !!v && JSON.stringify(ecus) !== JSON.stringify(v.ecu_instances);
  const saveEcus = useMutation({
    mutationFn: () =>
      fleetApi.updateEcuInstances(
        id,
        ecus.map((e) => ({
          ecu_id: e.ecu_id,
          serial_number: e.serial_number?.trim() || null,
          hardware_version: e.hardware_version?.trim() || null,
          batch_number: e.batch_number?.trim() || null,
        }))
      ),
    onSuccess: (d) => {
      qc.setQueryData(["vehicle-r156", id], d);
      toast.success(t("saved"));
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  if (isLoading || !v) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const setEcu = (idx: number, k: "serial_number" | "hardware_version" | "batch_number", val: string) =>
    setEcus((list) => list.map((e, i) => (i === idx ? { ...e, [k]: val } : e)));

  return (
    <div className="space-y-4">
      <Link href="/fleet" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-mono text-2xl font-bold text-gray-900">{v.vin}</h2>
              <p className="text-sm text-gray-500">
                {v.name} · {v.vehicle_type_name ?? "—"} · {v.year}
              </p>
            </div>
          </div>
          {canEdit && !v.has_eol && v.vehicle_type_id && (
            <Button onClick={() => setEolOpen(true)}>
              <ClipboardCheck className="h-4 w-4" />
              {t("recordEol")}
            </Button>
          )}
        </div>
      </Card>

      <Section title={t("currentTitle")} refText={t("currentRef")}>
        {v.current ? <ConfigView cfg={v.current} /> : <p className="text-sm text-gray-400">{t("noConfig")}</p>}
        <p className="mt-4 font-mono text-[11px] text-gray-400">{t("erpApi")}</p>
      </Section>

      <Section
        title={t("ecusTitle")}
        refText={t("ecusRef")}
        actions={
          canEdit &&
          dirty && (
            <Button size="sm" onClick={() => saveEcus.mutate()} disabled={saveEcus.isPending}>
              {saveEcus.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {t("saveEcus")}
            </Button>
          )
        }
      >
        <p className="mb-3 text-xs text-gray-500">{t("ecusHint")}</p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-400">
            <tr>
              <th className="pb-2">ECU</th>
              <th className="pb-2">{t("serial")}</th>
              <th className="pb-2">{t("hw")}</th>
              <th className="pb-2">{t("batch")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ecus.map((e, idx) => (
              <tr key={e.ecu_id}>
                <td className="py-2 pr-3">
                  <div className="font-medium">{e.ecu_name}</div>
                  <div className="font-mono text-xs text-gray-400">{e.part_number}</div>
                </td>
                {(["serial_number", "hardware_version", "batch_number"] as const).map((k) => (
                  <td key={k} className="py-2 pr-2">
                    {canEdit ? (
                      <Input value={e[k] ?? ""} onChange={(ev) => setEcu(idx, k, ev.target.value)} className="h-8 font-mono text-xs" />
                    ) : (
                      <span className="font-mono text-xs">{e[k] ?? "—"}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={t("history")}>
        <p className="mb-3 text-xs text-gray-500">{t("historyHint")}</p>
        {v.history.length === 0 ? (
          <p className="text-sm text-gray-400">—</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {v.history.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50", expanded === c.id && "bg-gray-50")}
                >
                  {expanded === c.id ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                  <span className="w-28 text-xs font-medium text-gray-500">{t(`type_${c.config_type}`)}</span>
                  <span className="font-mono text-xs font-semibold">{c.config_id}</span>
                  <span className="flex-1 truncate text-gray-600">{c.reason}</span>
                  <span className="text-xs text-gray-400">{formatDateTime(c.created_at)}</span>
                </button>
                {expanded === c.id && (
                  <div className="border-t bg-white px-4 py-3">
                    <ConfigView cfg={c} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <EolDialog open={eolOpen} onClose={() => setEolOpen(false)} vehicle={v} />
    </div>
  );
}
