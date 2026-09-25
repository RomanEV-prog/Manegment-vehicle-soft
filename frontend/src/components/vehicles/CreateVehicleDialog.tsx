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
import { useTranslations } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

const STATUS_OPTIONS = ["active", "in_service", "shipped", "decommissioned"];

export function CreateVehicleDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const t = useTranslations("vehicles");
  const tCommon = useTranslations("common");
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
      toast.success(t("createSuccess"));
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      onClose();
      setForm({ name: "", model: "", year: new Date().getFullYear(), vin: "", seats: 1, project_name: "", status: "active" });
    },
    onError: (e: AxiosError<{ detail: string }>) => {
      toast.error(e.response?.data?.detail ?? t("createError"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldName")}</label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Harlander #3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldModel")}</label>
              <Input value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="eShuttle S1" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldVin")}</label>
            <Input
              value={form.vin}
              onChange={(e) => set("vin", e.target.value.toUpperCase())}
              placeholder="WBA1234567890ABCD"
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldYear")}</label>
              <Input
                type="number"
                value={form.year}
                onChange={(e) => set("year", parseInt(e.target.value))}
                min={2000}
                max={2100}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldSeats")}</label>
              <Input
                type="number"
                value={form.seats}
                onChange={(e) => set("seats", parseInt(e.target.value))}
                min={1}
                max={100}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldStatus")}</label>
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
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldProject")}</label>
            <Input
              value={form.project_name}
              onChange={(e) => set("project_name", e.target.value)}
              placeholder="eShuttle 2025"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name || !form.vin || !form.model}
          >
            {mutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {tCommon("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
