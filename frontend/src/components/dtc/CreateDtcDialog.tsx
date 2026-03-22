"use client";

import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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
import { dtcApi, vehiclesApi } from "@/lib/api";
import type { Vehicle } from "@/types";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";

interface Props {
  open: boolean;
  vehicleId?: string; // če je podan, vozilo je fiksno
  onClose: () => void;
}

export function CreateDtcDialog({ open, vehicleId, onClose }: Props) {
  const qc = useQueryClient();
  const today = new Date().toISOString();

  const [form, setForm] = useState({
    vehicle_id: vehicleId ?? "",
    code: "",
    description: "",
    severity: "medium" as "low" | "medium" | "high",
    source: "manual" as "manual" | "obd",
    detected_at: today.slice(0, 10),
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: ["vehicles"],
    queryFn: () => vehiclesApi.list(),
    enabled: !vehicleId,
  });

  const mutation = useMutation({
    mutationFn: () => dtcApi.create({ ...form, detected_at: form.detected_at + "T00:00:00" }),
    onSuccess: () => {
      toast.success("DTC zapis dodan");
      qc.invalidateQueries({ queryKey: ["dtc-all"] });
      if (vehicleId) {
        qc.invalidateQueries({ queryKey: ["dtc", vehicleId] });
        qc.invalidateQueries({ queryKey: ["twin", vehicleId] });
      }
      onClose();
      setForm({ vehicle_id: vehicleId ?? "", code: "", description: "", severity: "medium", source: "manual", detected_at: today.slice(0, 10) });
    },
    onError: (e: AxiosError<{ detail: string }>) => {
      toast.error(e.response?.data?.detail ?? "Napaka pri dodajanju DTC");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nov DTC zapis</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!vehicleId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Vozilo *</label>
              <select
                value={form.vehicle_id}
                onChange={(e) => set("vehicle_id", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                <option value="">— Izberite vozilo —</option>
                {(vehicles ?? []).map((v) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.vin})</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">DTC koda *</label>
              <Input
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="P0300"
                className="font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Datum zaznave</label>
              <Input
                type="date"
                value={form.detected_at}
                onChange={(e) => set("detected_at", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Opis *</label>
            <Input
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Naključni izpust cilindrov..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Resnost</label>
              <select
                value={form.severity}
                onChange={(e) => set("severity", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                <option value="low">Nizka</option>
                <option value="medium">Srednja</option>
                <option value="high">Visoka</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Vir</label>
              <select
                value={form.source}
                onChange={(e) => set("source", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                <option value="manual">Ročno</option>
                <option value="obd">OBD</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Prekliči</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.vehicle_id || !form.code || !form.description}
          >
            {mutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Dodaj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
