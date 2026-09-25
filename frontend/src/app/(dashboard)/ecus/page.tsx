"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircuitBoard, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { r156Api } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Ecu, VehicleType } from "@/types/r156";
import { usePermissions } from "@/components/r156/shared";
import { EcuDialog, VehicleTypeDialog } from "@/components/r156/dialogs";

export default function EcusPage() {
  const t = useTranslations("r156");
  const { canEdit, canRelease } = usePermissions();
  const [typeId, setTypeId] = useState("");
  const [ecuDialog, setEcuDialog] = useState<{ open: boolean; ecu: Ecu | null }>({ open: false, ecu: null });
  const [typeOpen, setTypeOpen] = useState(false);

  const { data: vehicleTypes = [], isLoading: typesLoading } = useQuery<VehicleType[]>({
    queryKey: ["vehicle-types"],
    queryFn: r156Api.vehicleTypes,
  });

  useEffect(() => {
    if (!typeId && vehicleTypes.length) setTypeId(vehicleTypes[0].id);
  }, [typeId, vehicleTypes]);

  const { data: ecus = [], isLoading } = useQuery<Ecu[]>({
    queryKey: ["ecus", typeId],
    queryFn: () => r156Api.ecus(typeId),
    enabled: !!typeId,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t("ecusTitle")}</h2>
          <p className="text-sm text-gray-500">{t("ecusSubtitle")}</p>
        </div>
        <div className="flex gap-2">
          {canRelease && (
            <Button variant="outline" onClick={() => setTypeOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("newVehicleType")}
            </Button>
          )}
          {canEdit && typeId && (
            <Button onClick={() => setEcuDialog({ open: true, ecu: null })}>
              <Plus className="h-4 w-4" />
              {t("newEcu")}
            </Button>
          )}
        </div>
      </div>

      {/* Tipi vozil kot zavihki */}
      {typesLoading ? (
        <Spinner />
      ) : vehicleTypes.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{t("noVehicleTypes")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {vehicleTypes.map((vt) => (
            <button
              key={vt.id}
              onClick={() => setTypeId(vt.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                vt.id === typeId ? "border-blue-300 bg-blue-50 font-medium text-blue-800" : "bg-white text-gray-600 hover:bg-gray-50"
              )}
            >
              {vt.name}
              {vt.model_code && <span className="ml-1 font-mono text-xs text-gray-400">{vt.model_code}</span>}
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
          ) : ecus.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-gray-400">
              <CircuitBoard className="h-7 w-7" />
              {t("noEcus")}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t("ecuName")}</th>
                  <th className="px-4 py-3">{t("partNumber")}</th>
                  <th className="px-4 py-3">{t("system")}</th>
                  <th className="px-4 py-3">{t("supplier")}</th>
                  <th className="px-4 py-3">{t("unEceReg")}</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {ecus.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{e.ecu_name}</div>
                      {e.description && <div className="line-clamp-1 text-xs text-gray-400">{e.description}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{e.eversum_part_number}</td>
                    <td className="px-4 py-3 text-gray-600">{e.system_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{e.supplier ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{e.un_ece_reg_number ?? "—"}</td>
                    <td className="pr-3 text-right">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEcuDialog({ open: true, ecu: e })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <EcuDialog
        open={ecuDialog.open}
        onClose={() => setEcuDialog({ open: false, ecu: null })}
        vehicleTypeId={typeId}
        ecu={ecuDialog.ecu}
      />
      <VehicleTypeDialog
        open={typeOpen}
        onClose={() => setTypeOpen(false)}
        onCreated={(vt) => {
          setTypeOpen(false);
          setTypeId(vt.id);
        }}
      />
    </div>
  );
}
