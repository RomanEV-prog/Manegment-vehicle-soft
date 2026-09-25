"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fleetApi, r156Api } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import type { FleetVehicle, VehicleType } from "@/types/r156";
import { apiError, Field, usePermissions } from "@/components/r156/shared";

function NewVehicleDialog({ open, onClose, vehicleType }: { open: boolean; onClose: () => void; vehicleType: VehicleType }) {
  const t = useTranslations("fleet");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [form, setForm] = useState({ vin: "", name: "", year: new Date().getFullYear() });

  useEffect(() => {
    if (open) setForm({ vin: "", name: "", year: new Date().getFullYear() });
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      fleetApi.create({
        vin: form.vin.trim(),
        name: form.name.trim() || form.vin.trim().slice(-6),
        year: Number(form.year),
        model: vehicleType.name,
        vehicle_type_id: vehicleType.id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet"] });
      toast.success(t("created"));
      onClose();
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("newVehicle")} · {vehicleType.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={`${t("vin")} *`} hint={t("vinHint")}>
            <Input
              value={form.vin}
              onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase().replace(/\s/g, "") })}
              className="font-mono"
              maxLength={17}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("name")}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Shuttle 07" />
            </Field>
            <Field label={t("year")}>
              <Input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={form.vin.trim().length < 3 || mutation.isPending}>
            {mutation.isPending && <Spinner className="h-3.5 w-3.5" />}
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FleetPage() {
  const router = useRouter();
  const t = useTranslations("fleet");
  const tr = useTranslations("r156");
  const { canEdit } = usePermissions();
  const [typeId, setTypeId] = useState("");
  const [open, setOpen] = useState(false);

  const { data: types = [], isLoading: typesLoading } = useQuery<VehicleType[]>({
    queryKey: ["vehicle-types"],
    queryFn: r156Api.vehicleTypes,
  });
  useEffect(() => {
    if (!typeId && types.length) setTypeId(types[0].id);
  }, [typeId, types]);
  const vehicleType = types.find((vt) => vt.id === typeId);

  const { data: vehicles = [], isLoading } = useQuery<FleetVehicle[]>({
    queryKey: ["fleet", typeId],
    queryFn: () => fleetApi.list(typeId),
    enabled: !!typeId,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t("title")}</h2>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        {canEdit && vehicleType && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("newVehicle")}
          </Button>
        )}
      </div>

      {typesLoading ? (
        <Spinner />
      ) : types.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{tr("noVehicleTypes")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {types.map((vt) => (
            <button
              key={vt.id}
              onClick={() => setTypeId(vt.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                vt.id === typeId ? "border-blue-300 bg-blue-50 font-medium text-blue-800" : "bg-white text-gray-600 hover:bg-gray-50"
              )}
            >
              {vt.name}
            </button>
          ))}
        </div>
      )}

      {typeId && (
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : vehicles.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-gray-400">
              <Truck className="h-7 w-7" />
              {t("noVehicles")}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t("vin")}</th>
                  <th className="px-4 py-3">{t("name")}</th>
                  <th className="px-4 py-3">{t("year")}</th>
                  <th className="px-4 py-3">{t("status")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {vehicles.map((v) => (
                  <tr key={v.id} onClick={() => router.push(`/fleet/${v.id}`)} className="cursor-pointer hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium">{v.vin}</td>
                    <td className="px-4 py-3">{v.name}</td>
                    <td className="px-4 py-3 text-gray-600">{v.year}</td>
                    <td className="px-4 py-3 text-gray-600">{v.status}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400">{formatDate(v.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {vehicleType && <NewVehicleDialog open={open} onClose={() => setOpen(false)} vehicleType={vehicleType} />}
    </div>
  );
}
