"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { vectoApi } from "@/lib/api";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";
import { useTranslations } from "@/lib/i18n";

interface Props {
  open: boolean;
  vehicleId: string;
  onClose: () => void;
}

type Section = "masa" | "aero" | "crr" | "baterija" | "motor" | "simulacija";

export function CreateVectoDialog({ open, vehicleId, onClose }: Props) {
  const qc = useQueryClient();
  const t = useTranslations("vecto");
  const tCommon = useTranslations("common");
  const today = new Date().toISOString().split("T")[0];
  const [openSection, setOpenSection] = useState<Section | null>(null);

  const SECTION_LABELS: Record<Section, string> = {
    masa: t("sectionMasa"),
    aero: t("sectionAero"),
    crr: t("sectionCrr"),
    baterija: t("sectionBaterija"),
    motor: t("sectionMotor"),
    simulacija: t("sectionSimulacija"),
  };

  const [form, setForm] = useState({
    calculated_at: today,
    co2_wltp: "",
    energy_wltp: "",
    range_km: "",
    status: "draft",
  });

  const [params, setParams] = useState({
    // Masa
    masa_prazno_kg: "",
    masa_test_kg: "",
    masa_max_kg: "",
    // Aerodinamika
    cd: "",
    a_front_m2: "",
    cda: "",
    // Kotalniški upor
    crr_spredaj: "",
    crr_zadaj: "",
    // Baterija
    kapaciteta_kwh: "",
    napetost_v: "",
    max_moc_polnjenja_kw: "",
    // Motor
    max_moc_kw: "",
    max_navor_nm: "",
    // Simulacija
    wltp_cikel: "",
    temperatura_ref_c: "",
    tovor_kg: "",
  });

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setP = (k: string, v: string) => setParams((p) => ({ ...p, [k]: v }));

  function buildInputParams() {
    const p: Record<string, number | string> = {};
    const num = (v: string) => (v !== "" ? parseFloat(v) : undefined);
    const str = (v: string) => (v !== "" ? v : undefined);

    if (num(params.masa_prazno_kg) !== undefined) p.masa_prazno_kg = num(params.masa_prazno_kg)!;
    if (num(params.masa_test_kg) !== undefined) p.masa_test_kg = num(params.masa_test_kg)!;
    if (num(params.masa_max_kg) !== undefined) p.masa_max_kg = num(params.masa_max_kg)!;
    if (num(params.cd) !== undefined) p.cd = num(params.cd)!;
    if (num(params.a_front_m2) !== undefined) p.a_front_m2 = num(params.a_front_m2)!;
    if (num(params.cda) !== undefined) p.cda = num(params.cda)!;
    if (num(params.crr_spredaj) !== undefined) p.crr_spredaj = num(params.crr_spredaj)!;
    if (num(params.crr_zadaj) !== undefined) p.crr_zadaj = num(params.crr_zadaj)!;
    if (num(params.kapaciteta_kwh) !== undefined) p.kapaciteta_kwh = num(params.kapaciteta_kwh)!;
    if (num(params.napetost_v) !== undefined) p.napetost_v = num(params.napetost_v)!;
    if (num(params.max_moc_polnjenja_kw) !== undefined) p.max_moc_polnjenja_kw = num(params.max_moc_polnjenja_kw)!;
    if (num(params.max_moc_kw) !== undefined) p.max_moc_kw = num(params.max_moc_kw)!;
    if (num(params.max_navor_nm) !== undefined) p.max_navor_nm = num(params.max_navor_nm)!;
    if (str(params.wltp_cikel) !== undefined) p.wltp_cikel = str(params.wltp_cikel)!;
    if (num(params.temperatura_ref_c) !== undefined) p.temperatura_ref_c = num(params.temperatura_ref_c)!;
    if (num(params.tovor_kg) !== undefined) p.tovor_kg = num(params.tovor_kg)!;

    return Object.keys(p).length > 0 ? p : null;
  }

  const mutation = useMutation({
    mutationFn: () =>
      vectoApi.create({
        vehicle_id: vehicleId,
        calculated_at: form.calculated_at,
        co2_wltp: form.co2_wltp ? parseFloat(form.co2_wltp) : null,
        energy_wltp: form.energy_wltp ? parseFloat(form.energy_wltp) : null,
        range_km: form.range_km ? parseInt(form.range_km) : null,
        status: form.status,
        input_params: buildInputParams(),
      }),
    onSuccess: () => {
      toast.success(t("createSuccess"));
      qc.invalidateQueries({ queryKey: ["vecto", vehicleId] });
      onClose();
      setForm({ calculated_at: today, co2_wltp: "", energy_wltp: "", range_km: "", status: "draft" });
      setParams({
        masa_prazno_kg: "", masa_test_kg: "", masa_max_kg: "",
        cd: "", a_front_m2: "", cda: "",
        crr_spredaj: "", crr_zadaj: "",
        kapaciteta_kwh: "", napetost_v: "", max_moc_polnjenja_kw: "",
        max_moc_kw: "", max_navor_nm: "",
        wltp_cikel: "", temperatura_ref_c: "", tovor_kg: "",
      });
    },
    onError: (e: AxiosError<{ detail: string }>) => {
      toast.error(e.response?.data?.detail ?? t("createError"));
    },
  });

  function toggle(s: Section) {
    setOpenSection((cur) => (cur === s ? null : s));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
            {t("infoText")}
          </div>

          {/* Base fields */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldDate")}</label>
            <Input type="date" value={form.calculated_at} onChange={(e) => setF("calculated_at", e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldCo2")}</label>
              <Input type="number" step="0.01" value={form.co2_wltp} onChange={(e) => setF("co2_wltp", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldEnergy")}</label>
              <Input type="number" step="0.01" value={form.energy_wltp} onChange={(e) => setF("energy_wltp", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldRange")}</label>
              <Input type="number" value={form.range_km} onChange={(e) => setF("range_km", e.target.value)} placeholder="npr. 280" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldStatus")}</label>
            <select
              value={form.status}
              onChange={(e) => setF("status", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
            >
              <option value="draft">{t("statusDraft")}</option>
              <option value="submitted">{t("statusSubmitted")}</option>
              <option value="approved">{t("statusApproved")}</option>
            </select>
          </div>

          {/* Advanced input params — accordion */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
              {t("inputParamsTitle")}
            </div>

            {(["masa", "aero", "crr", "baterija", "motor", "simulacija"] as Section[]).map((sec) => (
              <div key={sec} className="border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => toggle(sec)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 text-left"
                >
                  <span>{SECTION_LABELS[sec]}</span>
                  <span className="text-gray-400">{openSection === sec ? "▲" : "▼"}</span>
                </button>

                {openSection === sec && (
                  <div className="px-3 pb-3 bg-white">
                    {sec === "masa" && (
                      <div className="grid grid-cols-3 gap-3 mt-2">
                        {[
                          { k: "masa_prazno_kg", label: t("masaEmpty") },
                          { k: "masa_test_kg", label: t("masaTest") },
                          { k: "masa_max_kg", label: t("masaMax") },
                        ].map(({ k, label }) => (
                          <div key={k}>
                            <label className="mb-1 block text-xs text-gray-600">{label}</label>
                            <Input type="number" step="1" value={(params as any)[k]} onChange={(e) => setP(k, e.target.value)} placeholder="0" />
                          </div>
                        ))}
                      </div>
                    )}

                    {sec === "aero" && (
                      <div className="grid grid-cols-3 gap-3 mt-2">
                        {[
                          { k: "cd", label: t("aeroCd"), step: "0.001" },
                          { k: "a_front_m2", label: t("aeroFront"), step: "0.01" },
                          { k: "cda", label: t("aeroCda"), step: "0.001" },
                        ].map(({ k, label, step }) => (
                          <div key={k}>
                            <label className="mb-1 block text-xs text-gray-600">{label}</label>
                            <Input type="number" step={step} value={(params as any)[k]} onChange={(e) => setP(k, e.target.value)} placeholder="0" />
                          </div>
                        ))}
                      </div>
                    )}

                    {sec === "crr" && (
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        {[
                          { k: "crr_spredaj", label: t("crrFront") },
                          { k: "crr_zadaj", label: t("crrRear") },
                        ].map(({ k, label }) => (
                          <div key={k}>
                            <label className="mb-1 block text-xs text-gray-600">{label}</label>
                            <Input type="number" step="0.1" value={(params as any)[k]} onChange={(e) => setP(k, e.target.value)} placeholder="0.0" />
                          </div>
                        ))}
                      </div>
                    )}

                    {sec === "baterija" && (
                      <div className="grid grid-cols-3 gap-3 mt-2">
                        {[
                          { k: "kapaciteta_kwh", label: t("batCapacity"), step: "0.1" },
                          { k: "napetost_v", label: t("batVoltage"), step: "1" },
                          { k: "max_moc_polnjenja_kw", label: t("batMaxCharge"), step: "0.1" },
                        ].map(({ k, label, step }) => (
                          <div key={k}>
                            <label className="mb-1 block text-xs text-gray-600">{label}</label>
                            <Input type="number" step={step} value={(params as any)[k]} onChange={(e) => setP(k, e.target.value)} placeholder="0" />
                          </div>
                        ))}
                      </div>
                    )}

                    {sec === "motor" && (
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        {[
                          { k: "max_moc_kw", label: t("motorMaxPower"), step: "0.1" },
                          { k: "max_navor_nm", label: t("motorMaxTorque"), step: "1" },
                        ].map(({ k, label, step }) => (
                          <div key={k}>
                            <label className="mb-1 block text-xs text-gray-600">{label}</label>
                            <Input type="number" step={step} value={(params as any)[k]} onChange={(e) => setP(k, e.target.value)} placeholder="0" />
                          </div>
                        ))}
                      </div>
                    )}

                    {sec === "simulacija" && (
                      <div className="grid grid-cols-3 gap-3 mt-2">
                        <div>
                          <label className="mb-1 block text-xs text-gray-600">{t("simWltp")}</label>
                          <select
                            value={params.wltp_cikel}
                            onChange={(e) => setP("wltp_cikel", e.target.value)}
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
                          >
                            <option value="">{t("simWltpSelect")}</option>
                            <option value="Razred 1">{t("simWltpClass1")}</option>
                            <option value="Razred 2">{t("simWltpClass2")}</option>
                            <option value="Razred 3b">{t("simWltpClass3b")}</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-600">{t("simTemp")}</label>
                          <Input type="number" step="0.5" value={params.temperatura_ref_c} onChange={(e) => setP("temperatura_ref_c", e.target.value)} placeholder="23" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-600">{t("simLoad")}</label>
                          <Input type="number" step="1" value={params.tovor_kg} onChange={(e) => setP("tovor_kg", e.target.value)} placeholder="0" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
