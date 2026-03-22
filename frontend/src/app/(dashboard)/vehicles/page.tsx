"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Plus, Search, Car } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CreateVehicleDialog } from "@/components/vehicles/CreateVehicleDialog";
import { vehiclesApi } from "@/lib/api";
import { statusColor, formatDate } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { Vehicle, VehicleStatus } from "@/types";

const STATUS_OPTIONS: { value: VehicleStatus | ""; label: string }[] = [
  { value: "", label: "Vsi statusi" },
  { value: "active", label: "Aktiven" },
  { value: "in_service", label: "V servisu" },
  { value: "shipped", label: "Odpremljeno" },
  { value: "decommissioned", label: "Izločen" },
];

export default function VehiclesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const { user } = useAuth();
  const isPartner = user?.role === "partner_viewer";

  const { data: vehicles, isLoading } = useQuery<Vehicle[]>({
    queryKey: ["vehicles", statusFilter, search],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      return vehiclesApi.list(Object.keys(params).length ? params : undefined);
    },
  });

  const filtered = vehicles ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Vozila</h2>
          <p className="text-sm text-gray-500">{filtered.length} vozil v floti</p>
        </div>
        {!isPartner && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo vozilo
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Išči po imenu, VIN, modelu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as VehicleStatus | "")}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {!isPartner && (
        <CreateVehicleDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
              <Car className="h-10 w-10" />
              <p>Ni vozil</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Ime / VIN</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Projekt</th>
                  <th className="px-4 py-3">Leto</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Ustvarjeno</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{v.name}</p>
                      <p className="font-mono text-xs text-gray-500">{v.vin}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{v.model}</td>
                    <td className="px-4 py-3 text-gray-700">{v.project_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{v.year}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(v.status)}`}
                      >
                        {v.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(v.created_at)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/vehicles/${v.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        Podrobnosti
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
