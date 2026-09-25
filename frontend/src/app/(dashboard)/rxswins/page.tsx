"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, ShieldCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { r156Api } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import type { RxswinListItem, VehicleType } from "@/types/r156";
import { BaselineStatusBadge, Select, usePermissions } from "@/components/r156/shared";
import { CreateRxswinDialog } from "@/components/r156/dialogs";

export default function RxswinsPage() {
  const t = useTranslations("r156");
  const router = useRouter();
  const { canEdit } = usePermissions();
  const [typeFilter, setTypeFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: rxswins = [], isLoading } = useQuery<RxswinListItem[]>({
    queryKey: ["rxswins"],
    queryFn: r156Api.rxswins,
  });
  const { data: vehicleTypes = [] } = useQuery<VehicleType[]>({
    queryKey: ["vehicle-types"],
    queryFn: r156Api.vehicleTypes,
  });

  const rows = useMemo(
    () => (typeFilter ? rxswins.filter((r) => r.vehicle_type_id === typeFilter) : rxswins),
    [rxswins, typeFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t("rxswinsTitle")}</h2>
          <p className="text-sm text-gray-500">{t("rxswinsSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {vehicleTypes.length > 1 && (
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-56">
              <option value="">{t("allVehicleTypes")}</option>
              {vehicleTypes.map((vt) => (
                <option key={vt.id} value={vt.id}>
                  {vt.name}
                </option>
              ))}
            </Select>
          )}
          {canEdit && (
            <Button onClick={() => setCreateOpen(true)} disabled={vehicleTypes.length === 0}>
              <Plus className="h-4 w-4" />
              {t("newRxswin")}
            </Button>
          )}
        </div>
      </div>

      {vehicleTypes.length === 0 && !isLoading && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("noVehicleTypes")}{" "}
          <Link href="/ecus" className="font-medium underline">
            {t("ecusTitle")}
          </Link>
        </p>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-gray-400">
            <ShieldCheck className="h-8 w-8" />
            {t("noRxswins")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">{t("rxswin")}</th>
                <th className="px-4 py-3">{t("description")}</th>
                <th className="px-4 py-3">{t("regulations")}</th>
                <th className="px-4 py-3">{t("currentBaseline")}</th>
                <th className="px-4 py-3">{t("draft")}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/rxswins/${r.id}`)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-gray-900">{r.rxswin}</div>
                    <div className="text-xs text-gray-400">{r.vehicle_type_name}</div>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-gray-600">
                    <span className="line-clamp-2">{r.description ?? "—"}</span>
                    {r.status === "retired" && (
                      <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 text-xs text-gray-500">
                        {t("status_retired")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.regulations_affected.join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    {r.current_baseline ? (
                      <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">#{r.current_baseline.baseline_number}</span>
                          <BaselineStatusBadge status="released" />
                        </span>
                        <span className="text-xs text-gray-400">
                          {t("items", { count: r.current_baseline.item_count })} · {formatDate(r.current_baseline.released_at)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">{t("noRelease")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.draft_baseline ? (
                      <span className="flex items-center gap-2">
                        <span className="font-medium">#{r.draft_baseline.baseline_number}</span>
                        <BaselineStatusBadge status="draft" />
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
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

      <CreateRxswinDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        vehicleTypes={vehicleTypes}
        onCreated={(r) => {
          setCreateOpen(false);
          router.push(`/rxswins/${r.id}`);
        }}
      />
    </div>
  );
}
