"use client";

import { useQuery } from "@tanstack/react-query";
import { Car, AlertTriangle, CheckCircle, Clock, Cpu } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { reportsApi, dtcApi } from "@/lib/api";
import { formatDate, severityColor, statusColor } from "@/lib/utils";
import Link from "next/link";
import type { FleetStatus, DtcRecord } from "@/types";

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
            {subtitle && <p className="mt-1 text-xs text-gray-400">{subtitle}</p>}
          </div>
          <div className={`rounded-xl p-3 ${color}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: fleet, isLoading: fleetLoading } = useQuery<FleetStatus>({
    queryKey: ["fleet-status"],
    queryFn: () => reportsApi.fleetStatus(),
    refetchInterval: 60_000,
  });

  const { data: activeDtcs } = useQuery<DtcRecord[]>({
    queryKey: ["dtc-active"],
    queryFn: () => dtcApi.list({ status: "active", severity: "high" }),
  });

  if (fleetLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Skupaj vozil"
          value={fleet?.summary.total_vehicles ?? 0}
          icon={Car}
          color="bg-blue-50 text-blue-600"
          subtitle={`${fleet?.summary.active_vehicles ?? 0} aktivnih`}
        />
        <StatCard
          title="Kritični DTC alarmi"
          value={fleet?.summary.active_high_dtcs ?? 0}
          icon={AlertTriangle}
          color={
            (fleet?.summary.active_high_dtcs ?? 0) > 0
              ? "bg-red-50 text-red-600"
              : "bg-yellow-50 text-yellow-600"
          }
          subtitle={
            (fleet?.summary.active_high_dtcs ?? 0) > 0
              ? "visoke resnosti — ukrepaj takoj"
              : "Ni kritičnih napak"
          }
        />
        <StatCard
          title="Homologacije v teku"
          value={fleet?.summary.open_homologations ?? 0}
          icon={Clock}
          color="bg-purple-50 text-purple-600"
          subtitle="pending + in_progress"
        />
        <StatCard
          title="SW posodobitve (30d)"
          value={fleet?.summary.sw_updates_last_30_days ?? 0}
          icon={Cpu}
          color="bg-green-50 text-green-600"
        />
      </div>

      {/* Vehicle status breakdown */}
      {fleet?.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stanje vozil po statusu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {[
                { status: "active", count: fleet.summary.active_vehicles },
                { status: "in_service", count: fleet.summary.in_service_vehicles },
                { status: "shipped", count: fleet.summary.shipped_vehicles },
              ].map(({ status, count }) => (
                <div key={status} className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor(status)}`}>
                    {status}
                  </span>
                  <span className="text-sm font-semibold text-gray-700">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fleet vehicles from fleet-status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Vozila — pregled</CardTitle>
              <Link href="/vehicles" className="text-xs text-blue-600 hover:underline">
                Vsa vozila →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {(fleet?.vehicles ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">Ni vozil</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                    <th className="px-4 py-2">Vozilo</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-center">DTC</th>
                    <th className="px-4 py-2 text-center">ECU</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(fleet?.vehicles ?? []).slice(0, 8).map((v) => (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link href={`/vehicles/${v.id}`} className="hover:underline">
                          <p className="font-medium text-gray-900">{v.name}</p>
                          <p className="font-mono text-xs text-gray-400">{v.vin}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(v.status)}`}>
                          {v.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {v.active_dtc_count > 0 ? (
                          <span className={`text-xs font-semibold ${v.active_dtcs_high > 0 ? "text-red-600" : "text-yellow-600"}`}>
                            {v.active_dtc_count}
                          </span>
                        ) : (
                          <span className="text-xs text-green-600">✓</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center text-xs text-gray-500">
                        {v.ecu_modules}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* High severity DTCs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Kritični DTC alarmi</CardTitle>
              <Link href="/dtc" className="text-xs text-blue-600 hover:underline">
                Vsi DTC →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(activeDtcs ?? []).slice(0, 6).map((dtc) => (
                <div
                  key={dtc.id}
                  className="flex items-start justify-between rounded-lg border p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-gray-900">
                        {dtc.code}
                      </span>
                      <Badge variant="danger" className="text-xs">
                        {dtc.severity}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{dtc.description}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Zaznano: {formatDate(dtc.detected_at)}
                    </p>
                  </div>
                </div>
              ))}
              {!activeDtcs?.length && (
                <div className="flex flex-col items-center py-6 text-center">
                  <CheckCircle className="h-8 w-8 text-green-400 mb-2" />
                  <p className="text-sm text-gray-500">Ni kritičnih DTC napak</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
