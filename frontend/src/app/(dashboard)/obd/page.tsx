"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { obdApi, vehiclesApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { OBDSession, OBDScanResponse, Vehicle, OBDRawDTC } from "@/types";
import {
  Plug,
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Thermometer,
  Gauge,
  Battery,
  Fuel,
  Zap,
  Car,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Live Data Tile ───────────────────────────────────────────────────────────

function LiveTile({
  icon: Icon,
  label,
  value,
  unit,
  colorClass = "text-gray-900",
}: {
  icon: React.ElementType;
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  colorClass?: string;
}) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-white p-4 shadow-sm min-w-[120px]">
      <Icon className="mb-1 h-5 w-5 text-gray-400" />
      <p className={`text-xl font-bold ${colorClass}`}>
        {typeof value === "number" ? value.toFixed(value % 1 === 0 ? 0 : 1) : value}
        {unit && <span className="ml-1 text-sm font-normal text-gray-500">{unit}</span>}
      </p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}

// ─── OBD Scan Dialog ─────────────────────────────────────────────────────────

function ManualScanDialog({
  open,
  onClose,
  vehicleId,
  vehicleName,
}: {
  open: boolean;
  onClose: () => void;
  vehicleId: string;
  vehicleName: string;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    adapter_type: "ELM327",
    adapter_id: "",
    protocol: "ISO 15765-4 CAN",
    notes: "",
    dtcs_raw: "",
    rpm: "",
    speed_kmh: "",
    coolant_temp_c: "",
    battery_voltage: "",
    fuel_level_pct: "",
    engine_load_pct: "",
  });

  const scanMutation = useMutation({
    mutationFn: (payload: unknown) => obdApi.scan(vehicleId, payload),
    onSuccess: (data: OBDScanResponse) => {
      toast.success(
        `Sken zaključen: ${data.dtcs_imported} DTC uvoženih, ${data.dtcs_skipped} preskočenih`
      );
      queryClient.invalidateQueries({ queryKey: ["obd-sessions", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["obd-live", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["dtc-all"] });
      onClose();
    },
    onError: () => toast.error("Napaka pri OBD skenu"),
  });

  const handleSubmit = () => {
    const dtcs = form.dtcs_raw
      .split("\n")
      .map((l) => l.trim().toUpperCase())
      .filter((l) => l.match(/^[PCBU][0-9A-F]{4}$/i))
      .map((code) => ({ code, freeze_frame: {} } as OBDRawDTC));

    const live_data: Record<string, number> = {};
    if (form.rpm) live_data.rpm = parseFloat(form.rpm);
    if (form.speed_kmh) live_data.speed_kmh = parseFloat(form.speed_kmh);
    if (form.coolant_temp_c) live_data.coolant_temp_c = parseFloat(form.coolant_temp_c);
    if (form.battery_voltage) live_data.battery_voltage = parseFloat(form.battery_voltage);
    if (form.fuel_level_pct) live_data.fuel_level_pct = parseFloat(form.fuel_level_pct);
    if (form.engine_load_pct) live_data.engine_load_pct = parseFloat(form.engine_load_pct);

    scanMutation.mutate({
      adapter_type: form.adapter_type,
      adapter_id: form.adapter_id || undefined,
      protocol: form.protocol || undefined,
      live_data,
      dtcs,
      notes: form.notes || undefined,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Ročni OBD sken — {vehicleName}
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Adapter</label>
              <select
                value={form.adapter_type}
                onChange={(e) => setForm((f) => ({ ...f, adapter_type: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="ELM327">ELM327</option>
                <option value="J2534">J2534 (Pass-Thru)</option>
                <option value="K-Line">K-Line</option>
                <option value="manual">Ročni vnos</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">ID adapterja</label>
              <input
                type="text"
                value={form.adapter_id}
                onChange={(e) => setForm((f) => ({ ...f, adapter_id: e.target.value }))}
                placeholder="npr. ELM327-BT-001"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">DTC kode (ena na vrstico)</label>
            <textarea
              rows={3}
              value={form.dtcs_raw}
              onChange={(e) => setForm((f) => ({ ...f, dtcs_raw: e.target.value }))}
              placeholder={"P0420\nU0100\nC0031"}
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
            />
            <p className="mt-0.5 text-xs text-gray-400">Format: P/C/B/U + 4 znaki hex (npr. P0420)</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-gray-700">Live PID podatki (opcijsko)</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "rpm", label: "RPM" },
                { key: "speed_kmh", label: "Hitrost km/h" },
                { key: "coolant_temp_c", label: "Temp. hladilnika °C" },
                { key: "battery_voltage", label: "Napetost V" },
                { key: "fuel_level_pct", label: "Gorivo %" },
                { key: "engine_load_pct", label: "Obremenitev %" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="mb-0.5 block text-xs text-gray-500">{label}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full rounded border px-2 py-1 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Opomba</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Opcijsko..."
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={scanMutation.isPending}>
            Prekliči
          </Button>
          <Button onClick={handleSubmit} disabled={scanMutation.isPending}>
            {scanMutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : <Plug className="mr-2 h-4 w-4" />}
            Zaženi sken
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Session Row ──────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: OBDSession }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-4 py-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </td>
        <td className="px-4 py-3 text-gray-700">{formatDate(session.scanned_at)}</td>
        <td className="px-4 py-3">
          <Badge variant="muted">{session.adapter_type}</Badge>
          {session.adapter_id && (
            <span className="ml-2 text-xs text-gray-400 font-mono">{session.adapter_id}</span>
          )}
        </td>
        <td className="px-4 py-3">
          {session.protocol ? (
            <span className="text-xs text-gray-500">{session.protocol}</span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className={`text-sm font-semibold ${session.dtc_count > 0 ? "text-red-600" : "text-green-600"}`}>
            {session.dtc_count}
          </span>
          {session.dtcs_imported > 0 && (
            <span className="ml-1 text-xs text-green-600">(+{session.dtcs_imported})</span>
          )}
          {session.dtcs_skipped > 0 && (
            <span className="ml-1 text-xs text-gray-400">({session.dtcs_skipped} preskočenih)</span>
          )}
        </td>
        <td className="px-4 py-3">
          {session.vin_from_obd ? (
            <span className="font-mono text-xs text-gray-600">{session.vin_from_obd}</span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <Badge variant={session.status === "completed" ? "success" : "error"}>
            {session.status}
          </Badge>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-2 gap-6">
              {/* DTC kode */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Odkrite DTC kode</p>
                {session.dtcs_raw.length === 0 ? (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> Brez napak
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {session.dtcs_raw.map((d, i) => (
                      <span
                        key={i}
                        className="rounded bg-red-50 px-2 py-0.5 font-mono text-xs font-medium text-red-700 border border-red-200"
                      >
                        {d.code}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Live data */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Live PID snapshot</p>
                {Object.keys(session.live_data).length === 0 ? (
                  <p className="text-sm text-gray-400">Ni PID podatkov</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(session.live_data)
                      .filter(([k]) => !["last_updated", "session_id", "adapter_type", "extra"].includes(k))
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-gray-500">{k.replace(/_/g, " ")}</span>
                          <span className="font-medium text-gray-800">{String(v)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* ECU info */}
              {Object.keys(session.ecu_info).length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500">ECU info (Mode 09)</p>
                  <div className="space-y-1">
                    {Object.entries(session.ecu_info).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-gray-500">{k}</span>
                        <span className="font-mono font-medium text-gray-800">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {session.notes && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Opomba</p>
                  <p className="text-sm text-gray-600">{session.notes}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OBDPage() {
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [scanOpen, setScanOpen] = useState(false);

  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: ["vehicles"],
    queryFn: () => vehiclesApi.list(),
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery<OBDSession[]>({
    queryKey: ["obd-sessions", selectedVehicleId],
    queryFn: () => obdApi.sessions(selectedVehicleId),
    enabled: !!selectedVehicleId,
  });

  const { data: liveData } = useQuery({
    queryKey: ["obd-live", selectedVehicleId],
    queryFn: () => obdApi.live(selectedVehicleId),
    enabled: !!selectedVehicleId,
    refetchInterval: 30_000,
  });

  const selectedVehicle = vehicles?.find((v) => v.id === selectedVehicleId);
  const live = liveData?.live_data ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">OBD-II diagnostika</h2>
          <p className="mt-1 text-sm text-gray-500">
            Pregled diagnostičnih sej in live PID podatkov vozila
          </p>
        </div>
        <Button
          onClick={() => setScanOpen(true)}
          disabled={!selectedVehicleId}
        >
          <Plug className="mr-2 h-4 w-4" />
          Nov sken
        </Button>
      </div>

      {/* Vehicle selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <Car className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
            >
              <option value="">Izberi vozilo...</option>
              {(vehicles ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.vin}
                </option>
              ))}
            </select>
            {selectedVehicle && (
              <div className="text-sm text-gray-500">
                {selectedVehicle.model} · {selectedVehicle.year}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedVehicleId && (
        <>
          {/* Live Data Panel */}
          {liveData && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-blue-600" />
                  Live podatki
                  {liveData.last_scanned_at && (
                    <span className="ml-auto text-xs font-normal text-gray-400">
                      Zadnji sken: {formatDate(liveData.last_scanned_at)}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!liveData.has_data ? (
                  <p className="py-4 text-center text-sm text-gray-400">
                    Ni podatkov — zaženite prvi OBD sken
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <LiveTile
                      icon={Gauge}
                      label="Vrtljaji"
                      value={live.rpm}
                      unit="RPM"
                      colorClass={
                        (live.rpm ?? 0) > 4000 ? "text-red-600" : "text-gray-900"
                      }
                    />
                    <LiveTile
                      icon={Gauge}
                      label="Hitrost"
                      value={live.speed_kmh}
                      unit="km/h"
                    />
                    <LiveTile
                      icon={Thermometer}
                      label="Hladilnik"
                      value={live.coolant_temp_c}
                      unit="°C"
                      colorClass={
                        (live.coolant_temp_c ?? 0) > 100 ? "text-red-600" :
                        (live.coolant_temp_c ?? 0) > 90 ? "text-orange-500" : "text-gray-900"
                      }
                    />
                    <LiveTile
                      icon={Thermometer}
                      label="Zrak intake"
                      value={live.intake_temp_c}
                      unit="°C"
                    />
                    <LiveTile
                      icon={Battery}
                      label="Napetost"
                      value={live.battery_voltage}
                      unit="V"
                      colorClass={
                        (live.battery_voltage ?? 12) < 11.5 ? "text-red-600" :
                        (live.battery_voltage ?? 12) < 12.0 ? "text-orange-500" : "text-green-600"
                      }
                    />
                    <LiveTile
                      icon={Fuel}
                      label="Gorivo"
                      value={live.fuel_level_pct}
                      unit="%"
                      colorClass={
                        (live.fuel_level_pct ?? 100) < 15 ? "text-red-600" : "text-gray-900"
                      }
                    />
                    <LiveTile
                      icon={Zap}
                      label="Obremenitev"
                      value={live.engine_load_pct}
                      unit="%"
                    />
                    {live.mil_on !== undefined && (
                      <div className={`flex flex-col items-center justify-center rounded-xl border p-4 shadow-sm min-w-[120px] ${live.mil_on ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                        <AlertTriangle className={`mb-1 h-5 w-5 ${live.mil_on ? "text-red-500" : "text-green-500"}`} />
                        <p className={`text-xl font-bold ${live.mil_on ? "text-red-600" : "text-green-600"}`}>
                          {live.mil_on ? "ON" : "OFF"}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">MIL (Check Engine)</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Sessions Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Plug className="h-4 w-4 text-gray-600" />
                OBD seje
                {sessions && (
                  <span className="ml-auto text-xs font-normal text-gray-400">
                    {sessions.length} sej skupaj
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {sessionsLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                      <th className="px-4 py-3 w-8"></th>
                      <th className="px-4 py-3">Čas skena</th>
                      <th className="px-4 py-3">Adapter</th>
                      <th className="px-4 py-3">Protokol</th>
                      <th className="px-4 py-3">DTC</th>
                      <th className="px-4 py-3">VIN (OBD)</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(sessions ?? []).map((s) => (
                      <SessionRow key={s.id} session={s} />
                    ))}
                    {(sessions ?? []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-400">
                          Ni OBD sej za to vozilo
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!selectedVehicleId && (
        <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
          <div className="text-center">
            <Plug className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Izberi vozilo za OBD diagnostiko</p>
          </div>
        </div>
      )}

      {scanOpen && selectedVehicleId && (
        <ManualScanDialog
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          vehicleId={selectedVehicleId}
          vehicleName={selectedVehicle?.name ?? ""}
        />
      )}
    </div>
  );
}
