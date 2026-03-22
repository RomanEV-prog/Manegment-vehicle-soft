"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CreateSwUpdateDialog } from "@/components/sw/CreateSwUpdateDialog";
import { swApi, vehiclesApi } from "@/lib/api";
import { statusColor, formatDate } from "@/lib/utils";
import type { SwUpdate, Vehicle } from "@/types";
import { Search, Cpu, Plus } from "lucide-react";
import toast from "react-hot-toast";

export default function SwUpdatesPage() {
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const swStatusMutation = useMutation({
    mutationFn: ({ swId, newStatus }: { swId: string; newStatus: string }) =>
      swApi.update(swId, { status: newStatus }),
    onSuccess: () => {
      toast.success("Status posodobljen");
      queryClient.invalidateQueries({ queryKey: ["sw-updates"] });
    },
    onError: () => toast.error("Napaka pri posodabljanju statusa"),
  });

  const { data: updates, isLoading } = useQuery<SwUpdate[]>({
    queryKey: ["sw-updates", methodFilter, statusFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (methodFilter) params.method = methodFilter;
      if (statusFilter) params.status = statusFilter;
      return swApi.list(Object.keys(params).length ? params : undefined);
    },
  });

  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: ["vehicles"],
    queryFn: () => vehiclesApi.list(),
  });

  const vehicleMap = Object.fromEntries((vehicles ?? []).map((v) => [v.id, v]));

  const filtered = (updates ?? []).filter((u) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      u.rxswin.toLowerCase().includes(q) ||
      u.ecu_module.toLowerCase().includes(q) ||
      vehicleMap[u.vehicle_id]?.name.toLowerCase().includes(q) ||
      vehicleMap[u.vehicle_id]?.vin.toLowerCase().includes(q);
    return matchSearch;
  });

  // Build SW version matrix: module → vehicle → latest version
  const matrix: Record<string, Record<string, string>> = {};
  const allVehicleIds = [...new Set(filtered.map((u) => u.vehicle_id))];

  for (const update of filtered) {
    if (!matrix[update.ecu_module]) matrix[update.ecu_module] = {};
    // Latest version wins (sorted by date ascending, so last wins)
    matrix[update.ecu_module][update.vehicle_id] = update.version_after;
  }

  const modules = Object.keys(matrix);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">SW posodobitve</h2>
          <p className="text-sm text-gray-500">{filtered.length} zapisov</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova SW posodobitev
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Išči RXSWIN, ECU, vozilo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        >
          <option value="">Vse metode</option>
          <option value="OTA">OTA</option>
          <option value="Workshop">Workshop</option>
          <option value="J2534">J2534</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        >
          <option value="">Vsi statusi</option>
          <option value="pending">Pending</option>
          <option value="in_progress">V teku</option>
          <option value="success">Uspešno</option>
          <option value="failed">Napaka</option>
          <option value="rolled_back">Povrnjeno</option>
        </select>
      </div>

      {/* SW Version Matrix */}
      {modules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4 text-blue-600" />
              Verzijska matrika — ECU moduli po vozilih
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3 font-medium">ECU Modul</th>
                  {allVehicleIds.map((vid) => (
                    <th key={vid} className="px-4 py-3 font-medium">
                      {vehicleMap[vid]?.name ?? vid.slice(0, 8)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {modules.map((mod) => (
                  <tr key={mod} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">{mod}</td>
                    {allVehicleIds.map((vid) => (
                      <td key={vid} className="px-4 py-3">
                        {matrix[mod][vid] ? (
                          <span className="font-mono text-green-700">{matrix[mod][vid]}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Full list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vsi zapisi</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3">Vozilo</th>
                  <th className="px-4 py-3">Datum</th>
                  <th className="px-4 py-3">ECU modul</th>
                  <th className="px-4 py-3">Verzija pred → po</th>
                  <th className="px-4 py-3">RXSWIN</th>
                  <th className="px-4 py-3">Metoda</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{vehicleMap[u.vehicle_id]?.name ?? "—"}</p>
                      <p className="font-mono text-xs text-gray-400">
                        {vehicleMap[u.vehicle_id]?.vin}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(u.date)}</td>
                    <td className="px-4 py-3 font-mono font-medium">{u.ecu_module}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-red-600">{u.version_before}</span>
                      <span className="mx-1 text-gray-400">→</span>
                      <span className="font-mono text-green-700">{u.version_after}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{u.rxswin}</td>
                    <td className="px-4 py-3">
                      <Badge variant="info">{u.method}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(u.status)}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.status === "pending" && (
                        <button
                          onClick={() => swStatusMutation.mutate({ swId: u.id, newStatus: "in_progress" })}
                          className="rounded px-2 py-0.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          Začni
                        </button>
                      )}
                      {u.status === "in_progress" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => swStatusMutation.mutate({ swId: u.id, newStatus: "success" })}
                            className="rounded px-2 py-0.5 text-xs bg-green-50 text-green-700 hover:bg-green-100"
                          >
                            Uspeh
                          </button>
                          <button
                            onClick={() => swStatusMutation.mutate({ swId: u.id, newStatus: "failed" })}
                            className="rounded px-2 py-0.5 text-xs bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            Napaka
                          </button>
                        </div>
                      )}
                      {u.status === "failed" && (
                        <button
                          onClick={() => swStatusMutation.mutate({ swId: u.id, newStatus: "rolled_back" })}
                          className="rounded px-2 py-0.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200"
                        >
                          Povrnitev
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      Ni SW posodobitev
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <CreateSwUpdateDialog
        open={createOpen}
        vehicleId={undefined}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
