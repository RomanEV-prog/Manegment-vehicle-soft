"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ChevronRight, FileCheck2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { r156Api, suApi } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import type { SuListItem, VehicleType } from "@/types/r156";
import { apiError, Field, Select, Textarea, usePermissions } from "@/components/r156/shared";
import { SuStatusBadge, VvBadge } from "@/components/r156/su";

function NewSuDialog({ open, onClose, types }: { open: boolean; onClose: () => void; types: VehicleType[] }) {
  const t = useTranslations("su");
  const tc = useTranslations("common");
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ vehicle_type_id: "", title: "", description_purpose: "" });

  useEffect(() => {
    if (open) setForm({ vehicle_type_id: types[0]?.id ?? "", title: "", description_purpose: "" });
  }, [open, types]);

  const mutation = useMutation({
    mutationFn: () => suApi.create(form),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["software-updates"] });
      toast.success(t("created"));
      router.push(`/software-updates/${d.id}`);
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("vehicleType")}>
            <Select value={form.vehicle_type_id} onChange={(e) => setForm({ ...form, vehicle_type_id: e.target.value })}>
              {types.map((vt) => (
                <option key={vt.id} value={vt.id}>
                  {vt.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`${t("docTitle")} *`}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="VCU 1.2.116" />
          </Field>
          <Field label={`${t("purpose")} *`}>
            <Textarea
              rows={3}
              value={form.description_purpose}
              onChange={(e) => setForm({ ...form, description_purpose: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.vehicle_type_id || !form.title.trim() || !form.description_purpose.trim() || mutation.isPending}
          >
            {mutation.isPending && <Spinner className="h-3.5 w-3.5" />}
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SoftwareUpdatesPage() {
  const t = useTranslations("su");
  const router = useRouter();
  const { canEdit } = usePermissions();
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [open, setOpen] = useState(false);

  const { data: docs = [], isLoading } = useQuery<SuListItem[]>({
    queryKey: ["software-updates", showSuperseded],
    queryFn: () => suApi.list({ include_superseded: showSuperseded }),
  });
  const { data: types = [] } = useQuery<VehicleType[]>({ queryKey: ["vehicle-types"], queryFn: r156Api.vehicleTypes });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t("title")}</h2>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.target.checked)} />
            {t("showSuperseded")}
          </label>
          {canEdit && (
            <Button onClick={() => setOpen(true)} disabled={types.length === 0}>
              <Plus className="h-4 w-4" />
              {t("new")}
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-gray-400">
            <FileCheck2 className="h-8 w-8" />
            {t("none")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">{t("documentId")}</th>
                <th className="px-4 py-3">{t("docTitle")}</th>
                <th className="px-4 py-3">{t("rxswins")}</th>
                <th className="px-4 py-3">{t("vv")}</th>
                <th className="px-4 py-3">{t("targets")}</th>
                <th className="px-4 py-3" />
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {docs.map((d) => (
                <tr key={d.id} onClick={() => router.push(`/software-updates/${d.id}`)} className="cursor-pointer hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold">{d.document_id}</div>
                    <div className="text-xs text-gray-400">{t("rev", { n: d.revision })}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{d.title}</div>
                    <div className="text-xs text-gray-400">{d.vehicle_type_name}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{d.rxswins.join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    <VvBadge status={d.vv_status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {d.target_count > 0 ? t("applied", { applied: d.applied_count, total: d.target_count }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <SuStatusBadge status={d.status} />
                      {d.released_at && <span className="text-xs text-gray-400">{formatDate(d.released_at)}</span>}
                    </div>
                  </td>
                  <td className="pr-3 text-gray-300">
                    <ChevronRight className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <NewSuDialog open={open} onClose={() => setOpen(false)} types={types} />
    </div>
  );
}
