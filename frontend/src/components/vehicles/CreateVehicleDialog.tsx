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
import { vehiclesApi } from "@/lib/api";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";

interface Props {
  open: boolean;
  onClose: () => void;
}

const STATUS_OPTIONS = ["active", "in_service", "shipped", "decommissioned"];

export function CreateVehicleDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    model: "",
    year: new Date().getFullYear(),
    vin: "",
    seats: 1,
    project_name: "",
    status: "active",
  });

  const set = (k: string, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => vehiclesApi.create(form),
    onSuccess: () => {
      toast.success("Vozilo ustvarjeno");
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      onClose();
      setForm({ name: "", model: "", year: new Date().getFullYear(), vin: "", seats: 1, project_name: "", status: "active" });
    },
    onError: (e: AxiosError<{ detail: string }>) => {
      toast.error(e.response?.data?.detail ?? "Napaka pri ustvarjanju vozila");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo vozilo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Ime *</label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Harlander #3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Model *</label>
              <Input value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="eShuttle S1" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">VIN *</label>
            <Input
              value={form.vin}
              onChange={(e) => set("vin", e.target.value.toUpperCase())}
              placeholder="WBA1234567890ABCD"
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Leto</label>
              <Input
                type="number"
                value={form.year}
                onChange={(e) => set("year", parseInt(e.target.value))}
                min={2000}
                max={2100}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Sedeži</label>
              <Input
                type="number"
                value={form.seats}
                onChange={(e) => set("seats", parseInt(e.target.value))}
                min={1}
                max={100}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Projekt</label>
            <Input
              value={form.project_name}
              onChange={(e) => set("project_name", e.target.value)}
              placeholder="eShuttle 2025"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Prekliči</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name || !form.vin || !form.model}
          >
            {mutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Ustvari
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
