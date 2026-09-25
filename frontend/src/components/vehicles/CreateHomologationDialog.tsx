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
import { homApi } from "@/lib/api";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";
import { useTranslations } from "@/lib/i18n";

interface Props {
  open: boolean;
  vehicleId: string;
  onClose: () => void;
}

const COMMON_REGULATIONS = [
  "UNECE R155",
  "UNECE R156",
  "UNECE R100",
  "UNECE R136",
  "EC 2018/858",
  "ISO 21434",
];

export function CreateHomologationDialog({ open, vehicleId, onClose }: Props) {
  const qc = useQueryClient();
  const t = useTranslations("homologation");
  const tCommon = useTranslations("common");
  const [form, setForm] = useState({
    regulation: "",
    status: "pending",
    authority: "",
    country: "",
    valid_from: "",
    valid_until: "",
    next_action_due: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      homApi.create({
        ...form,
        vehicle_id: vehicleId,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        next_action_due: form.next_action_due || null,
        authority: form.authority || null,
        country: form.country || null,
      }),
    onSuccess: () => {
      toast.success(t("createSuccess"));
      qc.invalidateQueries({ queryKey: ["hom", vehicleId] });
      qc.invalidateQueries({ queryKey: ["hom-all"] });
      qc.invalidateQueries({ queryKey: ["twin", vehicleId] });
      onClose();
      setForm({ regulation: "", status: "pending", authority: "", country: "", valid_from: "", valid_until: "", next_action_due: "" });
    },
    onError: (e: AxiosError<{ detail: string }>) => {
      const msg = e.response?.data?.detail;
      toast.error(typeof msg === "string" ? msg : t("createError"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldRegulation")}</label>
            <div className="flex gap-2">
              <Input
                value={form.regulation}
                onChange={(e) => set("regulation", e.target.value)}
                placeholder="UNECE R156"
                className="flex-1"
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {COMMON_REGULATIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set("regulation", r)}
                  className={`rounded-full px-2 py-0.5 text-xs border transition-colors ${
                    form.regulation === r
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldStatus")}</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              >
                <option value="pending">{t("statusPending")}</option>
                <option value="in_progress">{t("statusInProgress")}</option>
                <option value="approved">{t("statusApproved")}</option>
                <option value="expired">{t("statusExpired")}</option>
                <option value="rejected">{t("statusRejected")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldCountry")}</label>
              <Input
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                placeholder="SI / DE / EU"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldAuthority")}</label>
            <Input
              value={form.authority}
              onChange={(e) => set("authority", e.target.value)}
              placeholder={t("authorityPlaceholder")}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldValidFrom")}</label>
              <Input type="date" value={form.valid_from} onChange={(e) => set("valid_from", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldValidUntil")}</label>
              <Input type="date" value={form.valid_until} onChange={(e) => set("valid_until", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldNextAction")}</label>
              <Input type="date" value={form.next_action_due} onChange={(e) => set("next_action_due", e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.regulation}
          >
            {mutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {tCommon("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
