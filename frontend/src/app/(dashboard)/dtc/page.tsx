"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CreateDtcDialog } from "@/components/dtc/CreateDtcDialog";
import { dtcApi, vehiclesApi } from "@/lib/api";
import { severityColor, statusColor, formatDate } from "@/lib/utils";
import type { DtcRecord, Vehicle } from "@/types";
import { AlertTriangle, Search, Plus, CheckCheck } from "lucide-react";
import toast from "react-hot-toast";

export default function DtcPage() {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: dtcs, isLoading } = useQuery<DtcRecord[]>({
    queryKey: ["dtc-all", severityFilter, statusFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (severityFilter) params.severity = severityFilter;
      if (statusFilter) params.status = statusFilter;
      return dtcApi.list(params);
    },
    refetchInterval: 30_000,
  });

  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: ["vehicles"],
    queryFn: () => vehiclesApi.list(),
  });

  const vehicleMap = Object.fromEntries((vehicles ?? []).map((v) => [v.id, v]));

  const filtered = (dtcs ?? []).filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.code.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      vehicleMap[d.vehicle_id]?.name.toLowerCase().includes(q)
    );
  });

  // Checkbox helpers
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const unresolvedFiltered = filtered.filter((d) => d.status !== "resolved");
  const allUnresolvedSelected =
    unresolvedFiltered.length > 0 &&
    unresolvedFiltered.every((d) => selectedIds.has(d.id));

  const toggleAll = () => {
    if (allUnresolvedSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unresolvedFiltered.map((d) => d.id)));
    }
  };

  const resolveMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => dtcApi.update(id, { status: "resolved" }),
    onSuccess: () => {
      toast.success("DTC označen kot rešen");
      queryClient.invalidateQueries({ queryKey: ["dtc-all"] });
    },
    onError: () => toast.error("Napaka pri posodabljanju DTC"),
  });

  const reviewMutation = useMutation({
    mutationFn: (id: string) => dtcApi.update(id, { status: "in_review" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dtc-all"] });
    },
  });

  const batchResolveMutation = useMutation({
    mutationFn: (ids: string[]) => dtcApi.batchResolve(ids),
    onSuccess: (data: { resolved: number }) => {
      toast.success(`${data.resolved} DTC zapisov označenih kot rešenih`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["dtc-all"] });
    },
    onError: () => toast.error("Napaka pri batch reševanju DTC"),
  });

  const handleBatchResolve = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    batchResolveMutation.mutate(ids);
  };

  const highCount = (dtcs ?? []).filter((d) => d.severity === "high" && d.status === "active").length;
  const medCount = (dtcs ?? []).filter((d) => d.severity === "medium" && d.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">DTC napake</h2>
          <div className="mt-1 flex items-center gap-3 text-sm">
            {highCount > 0 && (
              <span className="flex items-center gap-1 text-red-600 font-medium">
                <AlertTriangle className="h-4 w-4" />
                {highCount} kritičnih
              </span>
            )}
            {medCount > 0 && (
              <span className="text-orange-500">{medCount} srednje resnih</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBatchResolve}
              disabled={batchResolveMutation.isPending}
              className="text-green-700 border-green-300 hover:bg-green-50"
            >
              {batchResolveMutation.isPending ? (
                <Spinner className="mr-2 h-4 w-4" />
              ) : (
                <CheckCheck className="mr-2 h-4 w-4" />
              )}
              Reši izbrane ({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nov DTC
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Išči kodo, opis, vozilo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        >
          <option value="">Vsa resnost</option>
          <option value="high">Visoka</option>
          <option value="medium">Srednja</option>
          <option value="low">Nizka</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        >
          <option value="">Vsi statusi</option>
          <option value="active">Aktiven</option>
          <option value="in_review">V pregledu</option>
          <option value="resolved">Rešen</option>
        </select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allUnresolvedSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                      title="Izberi vse nerešene"
                    />
                  </th>
                  <th className="px-4 py-3">Vozilo</th>
                  <th className="px-4 py-3">Koda</th>
                  <th className="px-4 py-3">Opis</th>
                  <th className="px-4 py-3">Resnost</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Zaznano</th>
                  <th className="px-4 py-3">Vir</th>
                  <th className="px-4 py-3">Akcija</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((dtc) => (
                  <tr
                    key={dtc.id}
                    className={`hover:bg-gray-50 ${selectedIds.has(dtc.id) ? "bg-blue-50" : ""}`}
                  >
                    <td className="px-4 py-3">
                      {dtc.status !== "resolved" && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(dtc.id)}
                          onChange={() => toggleOne(dtc.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{vehicleMap[dtc.vehicle_id]?.name ?? "—"}</p>
                      <p className="font-mono text-xs text-gray-400">
                        {vehicleMap[dtc.vehicle_id]?.vin}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">
                      {dtc.code}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="truncate text-gray-700" title={dtc.description}>
                        {dtc.description}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium border ${severityColor(dtc.severity)}`}>
                        {dtc.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(dtc.status)}`}>
                        {dtc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(dtc.detected_at)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={dtc.source === "obd" ? "info" : "muted"}>{dtc.source}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {dtc.status === "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => reviewMutation.mutate(dtc.id)}
                          >
                            Pregled
                          </Button>
                        )}
                        {dtc.status !== "resolved" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-green-600 hover:text-green-700"
                            onClick={() => resolveMutation.mutate({ id: dtc.id })}
                          >
                            Reši
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-400">
                      Ni DTC zapisov
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <CreateDtcDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
