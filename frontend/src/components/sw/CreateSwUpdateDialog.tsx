"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { swApi, vehiclesApi } from "@/lib/api";
import type { Vehicle } from "@/types";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";
import { useTranslations } from "@/lib/i18n";

interface Props {
  open: boolean;
  vehicleId?: string;
  onClose: () => void;
}

export function CreateSwUpdateDialog({ open, vehicleId, onClose }: Props) {
  const qc = useQueryClient();
  const t = useTranslations("swUpdates");
  const tCommon = useTranslations("common");
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    date: today,
    ecu_module: "",
    version_before: "",
    version_after: "",
    rxswin: "",
    method: "Workshop" as "OTA" | "Workshop" | "J2534",
    status: "success" as string,
    notes: "",
  });
  const [selectedVehicle, setSelectedVehicle] = useState(vehicleId ?? "");

  // Fetch vehicles if no vehicleId supplied
  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: ["vehicles"],
    queryFn: () => vehiclesApi.list(),
    enabled: !vehicleId,
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const rxswinValid = /^[A-Z0-9][A-Z0-9._-]{2,63}$/.test(form.rxswin);
  const effectiveVehicleId = vehicleId ?? selectedVehicle;

  const mutation = useMutation({
    mutationFn: () => swApi.create({ ...form, vehicle_id: effectiveVehicleId }),
    onSuccess: () => {
      toast.success(t("createSuccess"));
      qc.invalidateQueries({ queryKey: ["sw-updates"] });
      qc.invalidateQueries({ queryKey: ["sw-updates", effectiveVehicleId] });
      qc.invalidateQueries({ queryKey: ["twin", effectiveVehicleId] });
      onClose();
      setForm({ date: today, ecu_module: "", version_before: "", version_after: "", rxswin: "", method: "Workshop", status: "success", notes: "" });
      if (!vehicleId) setSelectedVehicle("");
    },
    onError: (e: AxiosError<{ detail: string }>) => {
      const msg = e.response?.data?.detail;
      toast.error(Array.isArray(msg) ? msg[0]?.msg ?? tCommon("error") : msg ?? tCommon("error"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Vehicle selector — only when no vehicleId is pre-set */}
          {!vehicleId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldVehicle")}</label>
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                <option value="">{t("selectVehicle")}</option>
                {(vehicles ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.vin})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldDate")}</label>
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldModule")}</label>
              <Input
                value={form.ecu_module}
                onChange={(e) => set("ecu_module", e.target.value)}
                placeholder="MCU / BCM / ADAS"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldVersionBefore")}</label>
              <Input
                value={form.version_before}
                onChange={(e) => set("version_before", e.target.value)}
                placeholder="2.1.0"
                className="font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldVersionAfter")}</label>
              <Input
                value={form.version_after}
                onChange={(e) => set("version_after", e.target.value)}
                placeholder="2.2.1"
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldRxswin")}</label>
            <Input
              value={form.rxswin}
              onChange={(e) => set("rxswin", e.target.value.toUpperCase())}
              placeholder="RXSWIN-EVS-R156-MCU-20241001"
              className={`font-mono ${form.rxswin && !rxswinValid ? "border-red-400" : ""}`}
            />
            <p className="mt-1 text-xs text-gray-400">{t("rxswinHint")}</p>
            {form.rxswin && !rxswinValid && (
              <p className="mt-0.5 text-xs text-red-500">{t("rxswinInvalid")}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldMethod")}</label>
              <select
                value={form.method}
                onChange={(e) => set("method", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                <option value="Workshop">Workshop</option>
                <option value="OTA">OTA</option>
                <option value="J2534">J2534</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldStatus")}</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                <option value="success">{t("statusSuccessOption")}</option>
                <option value="pending">{t("statusPendingOption")}</option>
                <option value="in_progress">{t("statusInProgressOption")}</option>
                <option value="failed">{t("statusFailedOption")}</option>
                <option value="rolled_back">{t("statusRolledBackOption")}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldNotes")}</label>
            <Input
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder={tCommon("optional")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              !effectiveVehicleId ||
              !form.ecu_module ||
              !form.version_before ||
              !form.version_after ||
              !rxswinValid
            }
          >
            {mutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
