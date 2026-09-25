"use client";

import { useQuery } from "@tanstack/react-query";
import { vehiclesApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime, severityColor, statusColor } from "@/lib/utils";
import { Cpu, Shield, AlertTriangle, Clock } from "lucide-react";
import type { VehicleTwin as VehicleTwinType } from "@/types";
import { useTranslations } from "@/lib/i18n";

export function VehicleTwin({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("twin");
  const { data: twin, isLoading } = useQuery<VehicleTwinType>({
    queryKey: ["twin", vehicleId],
    queryFn: () => vehiclesApi.twin(vehicleId),
  });

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!twin) {
    return <p className="text-sm text-gray-400">{t("notAvailable")}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Last updated */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {t("updatedAt")} {formatDateTime(twin.updated_at)}
        </span>
        {twin.last_sw_update_at && (
          <span className="flex items-center gap-1 text-blue-600">
            <Cpu className="h-3.5 w-3.5" />
            {t("lastSwUpdate")} {formatDateTime(twin.last_sw_update_at)}
          </span>
        )}
        {twin.last_service_at && (
          <span className="flex items-center gap-1">
            {t("lastService")} {formatDateTime(twin.last_service_at)}
          </span>
        )}
      </div>

      {/* ECU Config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Cpu className="h-4 w-4 text-blue-600" />
            {t("ecuConfigTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(twin.ecu_config).length === 0 ? (
            <p className="text-sm text-gray-400">{t("noEcuData")}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">{t("colModule")}</th>
                  <th className="pb-2 font-medium">{t("colVersion")}</th>
                  <th className="pb-2 font-medium">{t("colRxswin")}</th>
                  <th className="pb-2 font-medium">{t("colUpdated")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.entries(twin.ecu_config).map(([module, info]) => (
                  <tr key={module}>
                    <td className="py-1.5 font-mono font-medium text-gray-900">{module}</td>
                    <td className="py-1.5 font-mono text-green-700">{info.version}</td>
                    <td className="py-1.5 font-mono text-gray-600 text-xs">{info.rxswin}</td>
                    <td className="py-1.5 text-gray-400">{formatDateTime(info.last_updated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Homologation Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-purple-600" />
            {t("homStatusTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(twin.hom_status).length === 0 ? (
            <p className="text-sm text-gray-400">{t("noHomData")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(twin.hom_status).map(([reg, info]) => (
                <div
                  key={reg}
                  className="rounded-lg border p-2 text-xs"
                >
                  <p className="font-semibold text-gray-900">{reg}</p>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${statusColor(info.status)}`}>
                    {info.status}
                  </span>
                  {info.authority && (
                    <p className="mt-1 text-gray-500">{info.authority}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active DTCs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            {t("activeDtcTitle")} ({twin.active_dtcs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {twin.active_dtcs.length === 0 ? (
            <p className="text-sm text-green-600">{t("noActiveDtc")}</p>
          ) : (
            <div className="space-y-2">
              {twin.active_dtcs.map((dtc, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border p-2.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium border ${severityColor(dtc.severity)}`}>
                    {dtc.severity}
                  </span>
                  <div>
                    <p className="font-mono text-sm font-semibold text-gray-900">{dtc.code}</p>
                    <p className="text-xs text-gray-500">{dtc.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
