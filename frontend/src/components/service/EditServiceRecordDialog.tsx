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
import { serviceApi } from "@/lib/api";
import toast from "react-hot-toast";
import type { ServiceRecord } from "@/types";
import type { AxiosError } from "axios";
import { useTranslations } from "@/lib/i18n";

const SERVICE_TYPES = [
  "maintenance",
  "brakes",
  "tyres",
  "electrical",
  "battery",
  "software",
  "inspection",
  "other",
];

interface Props {
  open: boolean;
  record: ServiceRecord | null;
  vehicleId: string;
  onClose: () => void;
}

export function EditServiceRecordDialog({ open, record, vehicleId, onClose }: Props) {
  const qc = useQueryClient();
  const t = useTranslations("service");
  const tCommon = useTranslations("common");

  const [form, setForm] = useState({
    date: "",
    service_type: "maintenance",
    technician: "",
    items_text: "",   // comma-separated items
    notes: "",
  });

  useEffect(() => {
    if (record) {
      setForm({
        date: record.date,
        service_type: record.service_type,
        technician: record.technician,
        items_text: record.items.join(", "),
        notes: record.notes ?? "",
      });
    }
  }, [record]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      serviceApi.update(record!.id, {
        date: form.date || null,
        service_type: form.service_type || null,
        technician: form.technician || null,
        items: form.items_text
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        notes: form.notes || null,
      }),
    onSuccess: () => {
      toast.success(t("updateSuccess"));
      qc.invalidateQueries({ queryKey: ["service", vehicleId] });
      qc.invalidateQueries({ queryKey: ["vehicle-stats", vehicleId] });
      onClose();
    },
    onError: (e: AxiosError<{ detail: string }>) => {
      toast.error(e.response?.data?.detail ?? t("updateError"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldDate")}</label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldType")}</label>
              <select
                value={form.service_type}
                onChange={(e) => set("service_type", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                {SERVICE_TYPES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldTechnician")}</label>
            <Input
              value={form.technician}
              onChange={(e) => set("technician", e.target.value)}
              placeholder={t("technicianEditPlaceholder")}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              {t("editFieldItems")}{" "}
              <span className="font-normal text-gray-400">{t("editItemsSeparator")}</span>
            </label>
            <Input
              value={form.items_text}
              onChange={(e) => set("items_text", e.target.value)}
              placeholder={t("editItemsPlaceholder")}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldNotes")}</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              placeholder={t("notesPlaceholder")}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.technician}
          >
            {mutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
