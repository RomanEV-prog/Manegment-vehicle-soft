"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { auditApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/utils";
import type { AuditLog, AuditAction, AuditEntityType } from "@/types";
import {
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Filter,
} from "lucide-react";

// ─── Pomožni mapings ──────────────────────────────────────────────────────────

const ACTION_COLORS: Record<AuditAction | string, string> = {
  create: "bg-green-100 text-green-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
  resolve: "bg-teal-100 text-teal-800",
  approve: "bg-emerald-100 text-emerald-800",
  upload: "bg-purple-100 text-purple-800",
  snapshot: "bg-gray-100 text-gray-700",
  export: "bg-orange-100 text-orange-800",
  login: "bg-indigo-100 text-indigo-800",
  logout: "bg-gray-100 text-gray-500",
};

const ENTITY_LABELS: Record<AuditEntityType | string, string> = {
  vehicle: "Vozilo",
  sw_update: "SW posodobitev",
  dtc_record: "DTC zapis",
  service_record: "Servisni zapis",
  homologation: "Homologacija",
  coc_certificate: "CoC certifikat",
  photo: "Fotografija",
  vehicle_twin: "Digital Twin",
  user: "Uporabnik",
  vecto_calculation: "VECTO izračun",
  alarm_config: "Alarm konfiguracija",
  obd_session: "OBD seja",
};

const ACTIONS: AuditAction[] = [
  "create", "update", "delete", "resolve", "approve",
  "upload", "snapshot", "export", "login", "logout",
];

const ENTITY_TYPES: AuditEntityType[] = [
  "vehicle", "sw_update", "dtc_record", "service_record",
  "homologation", "coc_certificate", "photo", "vehicle_twin", "user",
  "vecto_calculation", "alarm_config", "obd_session",
];

// ─── Detail panel (before/after JSON diff) ────────────────────────────────────

function AuditDetail({ log }: { log: AuditLog }) {
  return (
    <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 border-t text-xs">
      <div>
        <p className="mb-1 font-semibold text-gray-500 uppercase tracking-wide">Pred spremembo</p>
        {log.before ? (
          <pre className="rounded bg-white border p-2 text-gray-700 overflow-auto max-h-40 whitespace-pre-wrap">
            {JSON.stringify(log.before, null, 2)}
          </pre>
        ) : (
          <span className="text-gray-400 italic">—</span>
        )}
      </div>
      <div>
        <p className="mb-1 font-semibold text-gray-500 uppercase tracking-wide">Po spremembi</p>
        {log.after ? (
          <pre className="rounded bg-white border p-2 text-gray-700 overflow-auto max-h-40 whitespace-pre-wrap">
            {JSON.stringify(log.after, null, 2)}
          </pre>
        ) : (
          <span className="text-gray-400 italic">—</span>
        )}
      </div>
      {log.reason && (
        <div className="col-span-2">
          <p className="mb-1 font-semibold text-gray-500 uppercase tracking-wide">Razlog</p>
          <p className="text-gray-700">{log.reason}</p>
        </div>
      )}
      <div className="col-span-2 flex flex-wrap gap-4 text-gray-400">
        <span>ID zapisa: <span className="font-mono text-gray-600">{log.id}</span></span>
        <span>Entity ID: <span className="font-mono text-gray-600">{log.entity_id}</span></span>
        {log.actor_ip && <span>IP: <span className="font-mono text-gray-600">{log.actor_ip}</span></span>}
        {log.actor_device && <span>Naprava: <span className="font-mono text-gray-600">{log.actor_device}</span></span>}
      </div>
    </div>
  );
}

// ─── Glavna stran ──────────────────────────────────────────────────────────────

export default function AuditPage() {
  const { payload } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterEntityType, setFilterEntityType] = useState<string>("");
  const [filterFromDate, setFilterFromDate] = useState<string>("");
  const [filterToDate, setFilterToDate] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const PAGE_SIZE = 50;

  const isAllowed = payload?.role === "admin" || payload?.role === "qc_manager";

  const params: Record<string, string | number> = { limit: PAGE_SIZE, offset };
  if (filterAction) params.action = filterAction;
  if (filterEntityType) params.entity_type = filterEntityType;
  if (filterFromDate) params.from_date = filterFromDate;
  if (filterToDate) params.to_date = filterToDate;

  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["audit-logs", params],
    queryFn: () => auditApi.list(params),
    enabled: isAllowed,
  });

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["audit-count", filterAction, filterEntityType],
    queryFn: () => auditApi.count({
      ...(filterAction ? { action: filterAction } : {}),
      ...(filterEntityType ? { entity_type: filterEntityType } : {}),
    }),
    enabled: isAllowed,
  });

  if (!isAllowed) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        Dostop dovoljen samo administratorjem in QC managerjem.
      </div>
    );
  }

  const totalPages = Math.ceil((countData?.count ?? 0) / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Revizijska sled</h2>
        <p className="text-sm text-gray-500">
          Popoln pregled sprememb — UNECE R156 §7.4 skladnost
        </p>
      </div>

      {/* Filtri */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-gray-600">
            <Filter className="h-4 w-4" />
            Filtri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <select
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setOffset(0); }}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
            >
              <option value="">Vse akcije</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <select
              value={filterEntityType}
              onChange={(e) => { setFilterEntityType(e.target.value); setOffset(0); }}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
            >
              <option value="">Vse entitete</option>
              {ENTITY_TYPES.map((et) => (
                <option key={et} value={et}>{ENTITY_LABELS[et] ?? et}</option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Od:</label>
              <input
                type="date"
                value={filterFromDate}
                onChange={(e) => { setFilterFromDate(e.target.value); setOffset(0); }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Do:</label>
              <input
                type="date"
                value={filterToDate}
                onChange={(e) => { setFilterToDate(e.target.value); setOffset(0); }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              />
            </div>

            {(filterAction || filterEntityType || filterFromDate || filterToDate) && (
              <button
                onClick={() => {
                  setFilterAction("");
                  setFilterEntityType("");
                  setFilterFromDate("");
                  setFilterToDate("");
                  setOffset(0);
                }}
                className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              >
                Počisti filtre
              </button>
            )}

            {countData && (
              <span className="ml-auto self-center text-xs text-gray-400">
                {countData.count.toLocaleString("sl-SI")} zapisov skupaj
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : !logs?.length ? (
            <div className="flex h-32 items-center justify-center text-gray-400">
              <ClipboardList className="mr-2 h-5 w-5" />
              Ni audit log zapisov
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                return (
                  <div key={log.id}>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="w-full text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 px-4 py-3">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                          : <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        }

                        {/* Akcija */}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {log.action}
                        </span>

                        {/* Entiteta */}
                        <span className="text-sm font-medium text-gray-700">
                          {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                        </span>

                        {/* Actor */}
                        <span className="text-sm text-gray-500">
                          {log.actor_type === "system"
                            ? "🤖 sistem"
                            : log.actor_id
                              ? `👤 ${log.actor_id.slice(0, 8)}…`
                              : "—"}
                        </span>

                        {/* Device badge */}
                        {log.actor_device && (
                          <Badge variant="muted" className="text-xs">
                            {log.actor_device}
                          </Badge>
                        )}

                        {/* Čas */}
                        <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                    </button>

                    {isExpanded && <AuditDetail log={log} />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginacija */}
      {(countData?.count ?? 0) > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Stran {currentPage} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              ← Nazaj
            </button>
            <button
              disabled={offset + PAGE_SIZE >= (countData?.count ?? 0)}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              Naprej →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
