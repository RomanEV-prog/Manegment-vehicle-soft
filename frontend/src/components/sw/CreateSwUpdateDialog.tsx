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

interface Props {
  open: boolean;
  vehicleId?: string;
  onClose: () => void;
}

const RXSWIN_HINT = "Format: RXSWIN-OEM-REG-MODULE-VERSION (npr. RXSWIN-EVS-R156-MCU-20241001)";

export function CreateSwUpdateDialog({ open, vehicleId, onClose }: Props) {
  const qc = useQueryClient();
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

  const rxswinValid = /^RXSWIN-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[0-9]+/.test(form.rxswin);
  const effectiveVehicleId = vehicleId ?? selectedVehicle;

  const mutation = useMutation({
    mutationFn: () => swApi.create({ ...form, vehicle_id: effectiveVehicleId }),
    onSuccess: () => {
      toast.success("SW posodobitev shranjena");
      qc.invalidateQueries({ queryKey: ["sw-updates"] });
      qc.invalidateQueries({ queryKey: ["sw-updates", effectiveVehicleId] });
      qc.invalidateQueries({ queryKey: ["twin", effectiveVehicleId] });
      onClose();
      setForm({ date: today, ecu_module: "", version_before: "", version_after: "", rxswin: "", method: "Workshop", status: "success", notes: "" });
      if (!vehicleId) setSelectedVehicle("");
    },
    onError: (e: AxiosError<{ detail: string }>) => {
      const msg = e.response?.data?.detail;
      toast.error(Array.isArray(msg) ? msg[0]?.msg ?? "Napaka" : msg ?? "Napaka pri shranjevanju");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova SW posodobitev</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Vehicle selector — only when no vehicleId is pre-set */}
          {!vehicleId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Vozilo *</label>
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                <option value="">— Izberite vozilo —</option>
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
              <label className="mb-1 block text-xs font-medium text-gray-700">Datum *</label>
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">ECU modul *</label>
              <Input
                value={form.ecu_module}
                onChange={(e) => set("ecu_module", e.target.value)}
                placeholder="MCU / BCM / ADAS"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Verzija pred *</label>
              <Input
                value={form.version_before}
                onChange={(e) => set("version_before", e.target.value)}
                placeholder="2.1.0"
                className="font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Verzija po *</label>
              <Input
                value={form.version_after}
                onChange={(e) => set("version_after", e.target.value)}
                placeholder="2.2.1"
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">RXSWIN *</label>
            <Input
              value={form.rxswin}
              onChange={(e) => set("rxswin", e.target.value.toUpperCase())}
              placeholder="RXSWIN-EVS-R156-MCU-20241001"
              className={`font-mono ${form.rxswin && !rxswinValid ? "border-red-400" : ""}`}
            />
            <p className="mt-1 text-xs text-gray-400">{RXSWIN_HINT}</p>
            {form.rxswin && !rxswinValid && (
              <p className="mt-0.5 text-xs text-red-500">Neveljaven format RXSWIN</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Metoda</label>
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
              <label className="mb-1 block text-xs font-medium text-gray-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                <option value="success">Uspešno</option>
                <option value="pending">Čakanje</option>
                <option value="in_progress">V teku</option>
                <option value="failed">Napaka</option>
                <option value="rolled_back">Razveljavitev</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Opombe</label>
            <Input
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Opcijsko..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Prekliči</Button>
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
            Shrani
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
