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
import { cocApi } from "@/lib/api";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";
import { useTranslations } from "@/lib/i18n";

interface Props {
  open: boolean;
  vehicleId: string;
  onClose: () => void;
}

export function CreateCoCDialog({ open, vehicleId, onClose }: Props) {
  const qc = useQueryClient();
  const t = useTranslations("coc");
  const tCommon = useTranslations("common");
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    coc_number: "",
    issued_at: today,
    valid_until: "",
    issuing_body: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      cocApi.create({
        ...form,
        vehicle_id: vehicleId,
        valid_until: form.valid_until || null,
        issuing_body: form.issuing_body || null,
      }),
    onSuccess: () => {
      toast.success(t("createSuccess"));
      qc.invalidateQueries({ queryKey: ["coc", vehicleId] });
      onClose();
      setForm({ coc_number: "", issued_at: today, valid_until: "", issuing_body: "" });
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
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldCocNumber")}</label>
            <Input
              value={form.coc_number}
              onChange={(e) => set("coc_number", e.target.value)}
              placeholder={t("cocNumberPlaceholder")}
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldIssuedAt")}</label>
              <Input type="date" value={form.issued_at} onChange={(e) => set("issued_at", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldValidUntil")}</label>
              <Input type="date" value={form.valid_until} onChange={(e) => set("valid_until", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{t("fieldIssuingBody")}</label>
            <Input
              value={form.issuing_body}
              onChange={(e) => set("issuing_body", e.target.value)}
              placeholder={t("issuingBodyPlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.coc_number}
          >
            {mutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
