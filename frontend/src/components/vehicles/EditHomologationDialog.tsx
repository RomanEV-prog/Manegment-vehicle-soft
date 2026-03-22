"use client";

import { useEffect, useState } from "react";
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
import { homApi } from "@/lib/api";
import toast from "react-hot-toast";
import type { Homologation } from "@/types";
import type { AxiosError } from "axios";

interface Props {
  open: boolean;
  hom: Homologation | null;
  vehicleId: string;
  onClose: () => void;
}

export function EditHomologationDialog({ open, hom, vehicleId, onClose }: Props) {
  const qc = useQueryClient();

  const [form, setForm] = useState({
    status: "pending",
    authority: "",
    country: "",
    valid_from: "",
    valid_until: "",
    next_action_due: "",
    notes: "",
  });

  // Prepolni form ko se hom spremeni
  useEffect(() => {
    if (hom) {
      setForm({
        status: hom.status ?? "pending",
        authority: hom.authority ?? "",
        country: hom.country ?? "",
        valid_from: hom.valid_from ?? "",
        valid_until: hom.valid_until ?? "",
        next_action_due: hom.next_action_due ?? "",
        notes: "",
      });
    }
  }, [hom]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      homApi.update(hom!.id, {
        status: form.status,
        authority: form.authority || null,
        country: form.country || null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        next_action_due: form.next_action_due || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      toast.success("Homologacija posodobljena");
      qc.invalidateQueries({ queryKey: ["hom", vehicleId] });
      qc.invalidateQueries({ queryKey: ["vehicle-stats", vehicleId] });
      qc.invalidateQueries({ queryKey: ["twin", vehicleId] });
      onClose();
    },
    onError: (e: AxiosError<{ detail: string }>) => {
      toast.error(e.response?.data?.detail ?? "Napaka pri posodabljanju");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Uredi homologacijo
            {hom && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                {hom.regulation}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                <option value="pending">V čakanju</option>
                <option value="in_progress">V postopku</option>
                <option value="approved">Odobreno</option>
                <option value="expired">Poteklo</option>
                <option value="rejected">Zavrnjeno</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Država</label>
              <Input
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                placeholder="SI / DE / EU"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Pristojni organ</label>
            <Input
              value={form.authority}
              onChange={(e) => set("authority", e.target.value)}
              placeholder="npr. TÜV, JRC, AVV, GR_HOM"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Veljavno od</label>
              <Input
                type="date"
                value={form.valid_from}
                onChange={(e) => set("valid_from", e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Veljavno do</label>
              <Input
                type="date"
                value={form.valid_until}
                onChange={(e) => set("valid_until", e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Naslednja akcija</label>
              <Input
                type="date"
                value={form.next_action_due}
                onChange={(e) => set("next_action_due", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Opombe</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              placeholder="Opombe za revizijsko sled..."
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Prekliči
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Shrani
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
