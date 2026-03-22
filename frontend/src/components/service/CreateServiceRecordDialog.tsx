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
import { serviceApi } from "@/lib/api";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";
import { X, Plus } from "lucide-react";

interface Props {
  open: boolean;
  vehicleId: string;
  onClose: () => void;
}

const SERVICE_TYPES = [
  "maintenance",
  "brakes",
  "tyres",
  "electrical",
  "software",
  "inspection",
  "repair",
  "other",
];

export function CreateServiceRecordDialog({ open, vehicleId, onClose }: Props) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    date: today,
    service_type: "maintenance",
    technician: "",
    notes: "",
  });
  const [items, setItems] = useState<string[]>([""]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const addItem = () => setItems((prev) => [...prev, ""]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, v: string) =>
    setItems((prev) => prev.map((item, idx) => (idx === i ? v : item)));

  const mutation = useMutation({
    mutationFn: () =>
      serviceApi.create({
        ...form,
        vehicle_id: vehicleId,
        items: items.filter((i) => i.trim() !== ""),
      }),
    onSuccess: () => {
      toast.success("Servisni zapis shranjen");
      qc.invalidateQueries({ queryKey: ["service", vehicleId] });
      qc.invalidateQueries({ queryKey: ["twin", vehicleId] });
      onClose();
      setForm({ date: today, service_type: "maintenance", technician: "", notes: "" });
      setItems([""]);
    },
    onError: (e: AxiosError<{ detail: string }>) => {
      toast.error(e.response?.data?.detail ?? "Napaka pri shranjevanju");
    },
  });

  const validItems = items.filter((i) => i.trim() !== "");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nov servisni zapis</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Datum *</label>
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Tip servisa *</label>
              <select
                value={form.service_type}
                onChange={(e) => set("service_type", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                {SERVICE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Tehnik *</label>
            <Input
              value={form.technician}
              onChange={(e) => set("technician", e.target.value)}
              placeholder="Ime in priimek tehnika"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">Opravljeno delo *</label>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={addItem}>
                <Plus className="mr-1 h-3 w-3" />
                Dodaj
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={item}
                    onChange={(e) => updateItem(i, e.target.value)}
                    placeholder={`npr. Menjava olja ${i + 1}`}
                  />
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0 text-gray-400 hover:text-red-500"
                      onClick={() => removeItem(i)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
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
            disabled={mutation.isPending || !form.technician || validItems.length === 0}
          >
            {mutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Shrani
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
