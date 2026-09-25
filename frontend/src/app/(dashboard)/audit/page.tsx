"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { auditApi, exportApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/utils";
import type { AuditLog, AuditAction, AuditEntityType } from "@/types";
import { ClipboardList, ChevronDown, ChevronRight, Filter, FileDown } from "lucide-react";
import { useTranslations } from "@/lib/i18n";

// ─── Action colors ────────────────────────────────────────────────────────────

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
  release: "bg-emerald-100 text-emerald-800",
  supersede: "bg-amber-100 text-amber-800",
  verify: "bg-cyan-100 text-cyan-800",
  sign: "bg-violet-100 text-violet-800",
  apply: "bg-teal-100 text-teal-800",
  notify: "bg-sky-100 text-sky-800",
};

const ACTIONS: AuditAction[] = [
  "create", "update", "delete", "resolve", "approve",
  "upload", "snapshot", "export", "login", "logout",
  "release", "supersede", "verify", "sign", "apply", "notify",
];

const ENTITY_TYPES: AuditEntityType[] = [
  "software_update", "software_update_target", "software_update_rxswin", "vehicle_configuration", "vehicle_ecu",
  "rxswin", "rxswin_baseline", "rxswin_baseline_item", "ecu", "vehicle_type",
  "vehicle", "sw_update", "dtc_record", "service_record",
  "homologation", "coc_certificate", "photo", "vehicle_twin", "user",
  "vecto_calculation", "alarm_config", "obd_session",
];

// ─── Detail panel ─────────────────────────────────────────────────────────────

function AuditDetail({ log }: { log: AuditLog }) {
  const t = useTranslations("audit");

  return (
    <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 border-t text-xs">
      <div>
        <p className="mb-1 font-semibold text-gray-500 uppercase tracking-wide">{t("beforeChange")}</p>
        {log.before ? (
          <pre className="rounded bg-white border p-2 text-gray-700 overflow-auto max-h-40 whitespace-pre-wrap">
            {JSON.stringify(log.before, null, 2)}
          </pre>
        ) : (
          <span className="text-gray-400 italic">—</span>
        )}
      </div>
      <div>
        <p className="mb-1 font-semibold text-gray-500 uppercase tracking-wide">{t("afterChange")}</p>
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
          <p className="mb-1 font-semibold text-gray-500 uppercase tracking-wide">{t("reason")}</p>
          <p className="text-gray-700">{log.reason}</p>
        </div>
      )}
      <div className="col-span-2 flex flex-wrap gap-4 text-gray-400">
        <span>{t("recordId")} <span className="font-mono text-gray-600">{log.id}</span></span>
        <span>{t("entityId")} <span className="font-mono text-gray-600">{log.entity_id}</span></span>
        {log.actor_ip && <span>{t("ip")} <span className="font-mono text-gray-600">{log.actor_ip}</span></span>}
        {log.actor_device && <span>{t("device")} <span className="font-mono text-gray-600">{log.actor_device}</span></span>}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const { payload } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterEntityType, setFilterEntityType] = useState<string>("");
  const [filterFromDate, setFilterFromDate] = useState<string>("");
  const [filterToDate, setFilterToDate] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const PAGE_SIZE = 50;
  const t = useTranslations("audit");

  const ENTITY_LABELS: Record<AuditEntityType | string, string> = {
    vehicle: t("entityVehicle"),
    sw_update: t("entitySwUpdate"),
    dtc_record: t("entityDtcRecord"),
    service_record: t("entityServiceRecord"),
    homologation: t("entityHomologation"),
    coc_certificate: t("entityCocCertificate"),
    photo: t("entityPhoto"),
    vehicle_twin: t("entityVehicleTwin"),
    user: t("entityUser"),
    vecto_calculation: t("entityVecto"),
    alarm_config: t("entityAlarmConfig"),
    obd_session: t("entityObdSession"),
    vehicle_type: t("entityVehicleType"),
    ecu: t("entityEcu"),
    rxswin: t("entityRxswin"),
    rxswin_baseline: t("entityRxswinBaseline"),
    rxswin_baseline_item: t("entityRxswinBaselineItem"),
    software_update: t("entitySoftwareUpdate"),
    software_update_rxswin: t("entitySoftwareUpdateRxswin"),
    software_update_target: t("entitySoftwareUpdateTarget"),
    vehicle_configuration: t("entityVehicleConfiguration"),
    vehicle_ecu: t("entityVehicleEcu"),
  };

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

  // isti filtri za števec in izvoz kot za seznam
  const filters: Record<string, string | undefined> = {
    action: filterAction || undefined,
    entity_type: filterEntityType || undefined,
    from_date: filterFromDate || undefined,
    to_date: filterToDate || undefined,
  };
  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["audit-count", filters],
    queryFn: () =>
      auditApi.count(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>),
    enabled: isAllowed,
  });

  if (!isAllowed) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        {t("accessDenied")}
      </div>
    );
  }

  const totalPages = Math.ceil((countData?.count ?? 0) / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("title")}</h2>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => exportApi.auditTrail(filters)}>
          <FileDown className="h-4 w-4" />
          {t("exportCsv")}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-gray-600">
            <Filter className="h-4 w-4" />
            {t("filtersTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <select
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setOffset(0); }}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
            >
              <option value="">{t("allActions")}</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <select
              value={filterEntityType}
              onChange={(e) => { setFilterEntityType(e.target.value); setOffset(0); }}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
            >
              <option value="">{t("allEntities")}</option>
              {ENTITY_TYPES.map((et) => (
                <option key={et} value={et}>{ENTITY_LABELS[et] ?? et}</option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">{t("fromDate")}</label>
              <input
                type="date"
                value={filterFromDate}
                onChange={(e) => { setFilterFromDate(e.target.value); setOffset(0); }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">{t("toDate")}</label>
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
                {t("clearFilters")}
              </button>
            )}

            {countData && (
              <span className="ml-auto self-center text-xs text-gray-400">
                {t("recordsTotal", { count: countData.count.toLocaleString() })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : !logs?.length ? (
            <div className="flex h-32 items-center justify-center text-gray-400">
              <ClipboardList className="mr-2 h-5 w-5" />
              {t("noRecords")}
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

                        {/* Action */}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {log.action}
                        </span>

                        {/* Entity */}
                        <span className="text-sm font-medium text-gray-700">
                          {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                        </span>

                        {/* Actor */}
                        <span className="text-sm text-gray-500">
                          {log.actor_type === "system"
                            ? t("systemActor")
                            : log.actor_id
                              ? `${t("userActor")} ${log.actor_name ?? `${log.actor_id.slice(0, 8)}…`}`
                              : "—"}
                        </span>

                        {/* Device badge */}
                        {log.actor_device && (
                          <Badge variant="muted" className="text-xs">
                            {log.actor_device}
                          </Badge>
                        )}

                        {/* Time */}
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

      {/* Pagination */}
      {(countData?.count ?? 0) > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {t("paginationLabel", { current: currentPage, total: totalPages })}
          </span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              {t("prevPage")}
            </button>
            <button
              disabled={offset + PAGE_SIZE >= (countData?.count ?? 0)}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              {t("nextPage")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
