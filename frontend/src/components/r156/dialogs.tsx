"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { CheckCircle2, FileSearch, ShieldAlert, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { r156Api } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { formatBytes, sha256File, type FileHash } from "@/lib/sha256";
import { cn } from "@/lib/utils";
import type { Baseline, BaselineItem, Ecu, RxswinDetail, VehicleType, VerifyResult } from "@/types/r156";
import { apiError, Field, Select, ShaInput, Textarea } from "./shared";

const RXSWIN_RE = /^[A-Z0-9][A-Z0-9._-]{2,63}$/;

// ─── Nov RXSWIN ───────────────────────────────────────────────────────────────

export function CreateRxswinDialog({
  open,
  onClose,
  vehicleTypes,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  vehicleTypes: VehicleType[];
  onCreated: (r: RxswinDetail) => void;
}) {
  const t = useTranslations("r156");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [form, setForm] = useState({ vehicle_type_id: "", rxswin: "", description: "", regulations: "" });

  useEffect(() => {
    if (open) {
      setForm({ vehicle_type_id: vehicleTypes[0]?.id ?? "", rxswin: "", description: "", regulations: "" });
    }
  }, [open, vehicleTypes]);

  const codeValid = RXSWIN_RE.test(form.rxswin);
  const mutation = useMutation({
    mutationFn: () =>
      r156Api.createRxswin({
        vehicle_type_id: form.vehicle_type_id,
        rxswin: form.rxswin,
        description: form.description || null,
        regulations_affected: form.regulations.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: (r) => {
      toast.success(t("created"));
      qc.invalidateQueries({ queryKey: ["rxswins"] });
      onCreated(r);
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newRxswin")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("vehicleType")}>
            <Select value={form.vehicle_type_id} onChange={(e) => setForm({ ...form, vehicle_type_id: e.target.value })}>
              {vehicleTypes.map((vt) => (
                <option key={vt.id} value={vt.id}>
                  {vt.name}
                  {vt.model_code ? ` (${vt.model_code})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("rxswin")} hint={t("rxswinFormatHint")}>
            <Input
              value={form.rxswin}
              onChange={(e) => setForm({ ...form, rxswin: e.target.value.toUpperCase().replace(/\s/g, "") })}
              placeholder="R48SWIN002"
              className={cn("font-mono", form.rxswin && !codeValid && "border-red-300")}
            />
          </Field>
          <Field label={t("description")}>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Exterior Lighting"
            />
          </Field>
          <Field label={t("regulations")} hint={t("regulationsHint")}>
            <Input value={form.regulations} onChange={(e) => setForm({ ...form, regulations: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!codeValid || !form.vehicle_type_id || mutation.isPending}
          >
            {mutation.isPending && <Spinner className="h-3.5 w-3.5" />}
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Postavka baseline-a (programska oprema enega ECU) ────────────────────────

type ItemForm = {
  ecu_id: string;
  sw_version: string;
  sw_file_name: string;
  sw_file_sha256: string;
  sw_config_version: string;
  sw_config_file_name: string;
  sw_config_sha256: string;
  compatible_hardware: string;
  egnyte_folder_url: string;
  change_log: string;
  description: string;
};

const EMPTY_ITEM: ItemForm = {
  ecu_id: "",
  sw_version: "",
  sw_file_name: "",
  sw_file_sha256: "",
  sw_config_version: "",
  sw_config_file_name: "",
  sw_config_sha256: "",
  compatible_hardware: "",
  egnyte_folder_url: "",
  change_log: "",
  description: "",
};

export function ItemDialog({
  open,
  onClose,
  rxswin,
  baseline,
  item,
}: {
  open: boolean;
  onClose: () => void;
  rxswin: RxswinDetail;
  baseline: Baseline;
  item: BaselineItem | null; // null = nova postavka
}) {
  const t = useTranslations("r156");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [form, setForm] = useState<ItemForm>(EMPTY_ITEM);

  const { data: ecus = [] } = useQuery<Ecu[]>({
    queryKey: ["ecus", rxswin.vehicle_type_id],
    queryFn: () => r156Api.ecus(rxswin.vehicle_type_id),
    enabled: open,
  });
  const usedEcus = useMemo(() => new Set(baseline.items.map((i) => i.ecu_id)), [baseline.items]);
  const freeEcus = ecus.filter((e) => !usedEcus.has(e.id));

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        ecu_id: item.ecu_id,
        sw_version: item.sw_version ?? "",
        sw_file_name: item.sw_file_name ?? "",
        sw_file_sha256: item.sw_file_sha256 ?? "",
        sw_config_version: item.sw_config_version ?? "",
        sw_config_file_name: item.sw_config_file_name ?? "",
        sw_config_sha256: item.sw_config_sha256 ?? "",
        compatible_hardware: item.compatible_hardware ?? "",
        egnyte_folder_url: item.egnyte_folder_url ?? "",
        change_log: item.change_log ?? "",
        description: item.description ?? "",
      });
    } else {
      setForm(EMPTY_ITEM);
    }
  }, [open, item]);

  useEffect(() => {
    if (open && !item && !form.ecu_id && freeEcus.length) {
      setForm((f) => ({ ...f, ecu_id: freeEcus[0].id }));
    }
  }, [open, item, form.ecu_id, freeEcus]);

  const set = (k: keyof ItemForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Prazna polja pošljemo kot null, SHA-256 z malimi črkami
  const payload = () => {
    const { ecu_id, ...rest } = form;
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(rest)) {
      const trimmed = v.trim();
      out[k] = trimmed ? (k.endsWith("sha256") ? trimmed.toLowerCase() : trimmed) : null;
    }
    return { ecu_id, ...out };
  };

  const mutation = useMutation({
    mutationFn: () => {
      const { ecu_id, ...data } = payload();
      return item
        ? r156Api.updateItem(baseline.id, item.id, data)
        : r156Api.addItem(baseline.id, { ecu_id, ...data });
    },
    onSuccess: (detail) => {
      qc.setQueryData(["rxswin", rxswin.id], detail);
      qc.invalidateQueries({ queryKey: ["rxswins"] });
      toast.success(t("itemSaved"));
      onClose();
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  const ecuName = item?.ecu_name ?? ecus.find((e) => e.id === form.ecu_id)?.ecu_name;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? t("editItem") : t("addItem")} · {rxswin.rxswin} · {t("baseline", { number: baseline.baseline_number })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("ecu")}>
              {item ? (
                <Input value={ecuName ?? ""} disabled />
              ) : (
                <Select value={form.ecu_id} onChange={(e) => set("ecu_id")(e.target.value)}>
                  {freeEcus.length === 0 && <option value="">—</option>}
                  {freeEcus.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.ecu_name} · {e.eversum_part_number}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("compatibleHw")}>
              <Input value={form.compatible_hardware} onChange={(e) => set("compatible_hardware")(e.target.value)} placeholder="927889/TTC-500" />
            </Field>
          </div>

          <fieldset className="rounded-lg border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Software</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${t("swVersion")} *`}>
                <Input value={form.sw_version} onChange={(e) => set("sw_version")(e.target.value)} placeholder="1.2.115" />
              </Field>
              <Field label={t("swFile")}>
                <Input value={form.sw_file_name} onChange={(e) => set("sw_file_name")(e.target.value)} placeholder="ES03v02_vcu1_1_2_115.hex" />
              </Field>
              <Field label={t("swSha")} hint={t("shaHint")} className="col-span-2">
                <ShaInput
                  value={form.sw_file_sha256}
                  onChange={set("sw_file_sha256")}
                  onFile={(name) => !form.sw_file_name && set("sw_file_name")(name)}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Configuration</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("configVersion")}>
                <Input value={form.sw_config_version} onChange={(e) => set("sw_config_version")(e.target.value)} placeholder="N/A" />
              </Field>
              <Field label={t("configFile")}>
                <Input value={form.sw_config_file_name} onChange={(e) => set("sw_config_file_name")(e.target.value)} />
              </Field>
              <Field label={t("configSha")} className="col-span-2">
                <ShaInput
                  value={form.sw_config_sha256}
                  onChange={set("sw_config_sha256")}
                  onFile={(name) => !form.sw_config_file_name && set("sw_config_file_name")(name)}
                />
              </Field>
            </div>
          </fieldset>

          <Field label={t("egnyte")}>
            <Input value={form.egnyte_folder_url} onChange={(e) => set("egnyte_folder_url")(e.target.value)} placeholder="https://evision.egnyte.com/..." />
          </Field>
          <Field label={t("changeLog")}>
            <Textarea rows={5} value={form.change_log} onChange={(e) => set("change_log")(e.target.value)} className="font-mono text-xs" />
          </Field>
          <Field label={t("itemDescription")}>
            <Textarea rows={2} value={form.description} onChange={(e) => set("description")(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.sw_version.trim() || !form.ecu_id || mutation.isPending}
          >
            {mutation.isPending && <Spinner className="h-3.5 w-3.5" />}
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Preverjanje datoteke pred nalaganjem v ECU ───────────────────────────────

export function VerifyDialog({
  open,
  onClose,
  baseline,
  item,
}: {
  open: boolean;
  onClose: () => void;
  baseline: Baseline;
  item: BaselineItem;
}) {
  const t = useTranslations("r156");
  const tc = useTranslations("common");
  const [target, setTarget] = useState<"sw" | "config">("sw");
  const [hash, setHash] = useState<FileHash | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTarget("sw");
      setHash(null);
      setResult(null);
    }
  }, [open]);

  const run = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const h = await sha256File(file);
      setHash(h);
      const r = await r156Api.verifyItem(baseline.id, item.id, {
        target,
        computed_sha256: h.sha256,
        file_name: h.fileName,
        file_size: h.fileSize,
      });
      setResult(r);
    } catch (e) {
      toast.error(apiError(e, (e as Error).message || tc("error")));
    } finally {
      setBusy(false);
    }
  };

  const hasConfig = !!(item.sw_config_sha256 || item.sw_config_version || item.sw_config_file_name);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("verifyTitle", { ecu: item.ecu_name, number: baseline.baseline_number })}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">{t("verifyHint")}</p>

        {hasConfig && (
          <Field label={t("verifyTarget")} className="mt-3">
            <Select value={target} onChange={(e) => { setTarget(e.target.value as "sw" | "config"); setResult(null); setHash(null); }}>
              <option value="sw">{t("verifyTargetSw")} — {item.sw_file_name ?? item.sw_version}</option>
              <option value="config">{t("verifyTargetConfig")} — {item.sw_config_file_name ?? item.sw_config_version}</option>
            </Select>
          </Field>
        )}

        <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 p-6 text-sm text-gray-500 hover:border-blue-300 hover:bg-blue-50/40">
          {busy ? <Spinner /> : <FileSearch className="h-6 w-6 text-gray-400" />}
          <span>{busy ? t("computing") : t("dropFile")}</span>
          <input type="file" className="hidden" onChange={(e) => { run(e.target.files?.[0]); e.target.value = ""; }} />
        </label>

        {hash && result && (
          <div className="mt-3 space-y-2">
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold",
                result.match ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
              )}
            >
              {result.match ? <CheckCircle2 className="h-5 w-5" /> : result.expected_sha256 ? <XCircle className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
              {result.match ? t("verifyMatch") : result.expected_sha256 ? t("verifyMismatch") : t("verifyNoExpected")}
            </div>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-gray-500">{t("fileName")}</dt>
              <dd className="font-mono">{hash.fileName} · {formatBytes(hash.fileSize)}</dd>
              <dt className="text-gray-500">{t("expected")}</dt>
              <dd className="break-all font-mono">{result.expected_sha256 ?? "—"}</dd>
              <dt className="text-gray-500">{t("computed")}</dt>
              <dd className="break-all font-mono">{result.computed_sha256}</dd>
            </dl>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ECU ──────────────────────────────────────────────────────────────────────

export function EcuDialog({
  open,
  onClose,
  vehicleTypeId,
  ecu,
}: {
  open: boolean;
  onClose: () => void;
  vehicleTypeId: string;
  ecu: Ecu | null;
}) {
  const t = useTranslations("r156");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const empty = { ecu_name: "", system_name: "", supplier: "", eversum_part_number: "", un_ece_reg_number: "", description: "" };
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!open) return;
    setForm(
      ecu
        ? {
            ecu_name: ecu.ecu_name,
            system_name: ecu.system_name ?? "",
            supplier: ecu.supplier ?? "",
            eversum_part_number: ecu.eversum_part_number,
            un_ece_reg_number: ecu.un_ece_reg_number ?? "",
            description: ecu.description ?? "",
          }
        : empty
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ecu]);

  const mutation = useMutation({
    mutationFn: () => {
      const data = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v.trim() || null])
      ) as Partial<Ecu>;
      return ecu ? r156Api.updateEcu(ecu.id, data) : r156Api.createEcu({ ...data, vehicle_type_id: vehicleTypeId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ecus"] });
      toast.success(t("saved"));
      onClose();
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ecu ? t("editEcu") : t("newEcu")}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t("ecuName")} *`}>
            <Input value={form.ecu_name} onChange={set("ecu_name")} placeholder="Body Control Unit" />
          </Field>
          <Field label={`${t("partNumber")} *`}>
            <Input value={form.eversum_part_number} onChange={set("eversum_part_number")} placeholder="EV-00002-37716" className="font-mono" />
          </Field>
          <Field label={t("system")}>
            <Input value={form.system_name} onChange={set("system_name")} placeholder="Exterior Lighting" />
          </Field>
          <Field label={t("supplier")}>
            <Input value={form.supplier} onChange={set("supplier")} placeholder="Continental" />
          </Field>
          <Field label={t("unEceReg")} className="col-span-2">
            <Input value={form.un_ece_reg_number} onChange={set("un_ece_reg_number")} placeholder="UN-ECE Reg 48" />
          </Field>
          <Field label={t("itemDescription")} className="col-span-2">
            <Textarea value={form.description} onChange={set("description")} rows={2} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.ecu_name.trim() || !form.eversum_part_number.trim() || mutation.isPending}
          >
            {mutation.isPending && <Spinner className="h-3.5 w-3.5" />}
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tip vozila ───────────────────────────────────────────────────────────────

export function VehicleTypeDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (vt: VehicleType) => void;
}) {
  const t = useTranslations("r156");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", model_code: "", description: "" });

  useEffect(() => {
    if (open) setForm({ name: "", model_code: "", description: "" });
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      r156Api.createVehicleType({
        name: form.name.trim(),
        model_code: form.model_code.trim() || null,
        description: form.description.trim() || null,
      }),
    onSuccess: (vt) => {
      qc.invalidateQueries({ queryKey: ["vehicle-types"] });
      toast.success(t("saved"));
      onCreated(vt);
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newVehicleType")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={`${t("vehicleTypeName")} *`}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e-Shuttle MK II-400" />
          </Field>
          <Field label={t("modelCode")}>
            <Input value={form.model_code} onChange={(e) => setForm({ ...form, model_code: e.target.value })} placeholder="ES03" />
          </Field>
          <Field label={t("description")}>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name.trim() || mutation.isPending}>
            {mutation.isPending && <Spinner className="h-3.5 w-3.5" />}
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
