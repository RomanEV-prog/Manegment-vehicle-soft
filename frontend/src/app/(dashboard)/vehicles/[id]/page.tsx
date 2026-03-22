"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  FileText,
  History,
  Cpu,
  Wrench,
  AlertTriangle,
  Plus,
  ShieldCheck,
  Clock,
  Trash2,
  Plug,
  Thermometer,
  Gauge,
  Battery,
  Fuel,
  Zap,
  Activity,
} from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { VehicleTwin } from "@/components/vehicles/VehicleTwin";
import { CreateSwUpdateDialog } from "@/components/sw/CreateSwUpdateDialog";
import { CreateDtcDialog } from "@/components/dtc/CreateDtcDialog";
import { CreateHomologationDialog } from "@/components/vehicles/CreateHomologationDialog";
import { EditHomologationDialog } from "@/components/vehicles/EditHomologationDialog";
import { CreateServiceRecordDialog } from "@/components/service/CreateServiceRecordDialog";
import { EditServiceRecordDialog } from "@/components/service/EditServiceRecordDialog";
import { CreateCoCDialog } from "@/components/vehicles/CreateCoCDialog";
import { CreateVectoDialog } from "@/components/vehicles/CreateVectoDialog";
import { PhotoUpload } from "@/components/vehicles/PhotoUpload";
import {
  vehiclesApi,
  swApi,
  serviceApi,
  dtcApi,
  homApi,
  cocApi,
  vectoApi,
  reportsApi,
  photosApi,
  obdApi,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/** Mini inline komponenta za prikaz/upload foto pri homologaciji */
function HomPhotoPanel({
  vehicleId,
  homId,
  regulation,
  onClose,
}: {
  vehicleId: string;
  homId: string;
  regulation: string;
  onClose: () => void;
}) {
  const { data: homPhotos } = useQuery<import("@/types").Photo[]>({
    queryKey: ["photos-hom", homId],
    queryFn: () => photosApi.listByLinked("homologation", homId),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-blue-700">
        Fotografije za homologacijo <strong>{regulation}</strong>
      </p>
      {(homPhotos ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {homPhotos!.map((p) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative h-16 w-20 overflow-hidden rounded-lg border bg-gray-100 hover:shadow"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.filename}
                className="h-full w-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <span className="absolute bottom-0 left-0 right-0 truncate bg-black/40 px-1 py-0.5 text-[9px] text-white">
                {p.photo_type}
              </span>
            </a>
          ))}
        </div>
      )}
      <PhotoUpload
        vehicleId={vehicleId}
        linkedToType="homologation"
        linkedToId={homId}
        onSuccess={onClose}
      />
    </div>
  );
}
import { statusColor, formatDate, formatDateTime, severityColor } from "@/lib/utils";
import type { Vehicle, SwUpdate, ServiceRecord, DtcRecord, Homologation, TwinSnapshot, Photo, CoCCertificate, VectoCalculation, OBDSession, OBDLiveDataResponse } from "@/types";
import toast from "react-hot-toast";

type Tab = "twin" | "sw" | "dtc" | "obd" | "service" | "hom" | "coc" | "vecto" | "snapshots" | "photos";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "twin", label: "Digital Twin", icon: Cpu },
  { id: "sw", label: "SW posodobitve", icon: Cpu },
  { id: "dtc", label: "DTC napake", icon: AlertTriangle },
  { id: "obd", label: "OBD", icon: Plug },
  { id: "service", label: "Servisi", icon: Wrench },
  { id: "hom", label: "Homologacije", icon: FileText },
  { id: "coc", label: "CoC", icon: FileText },
  { id: "vecto", label: "VECTO", icon: Cpu },
  { id: "photos", label: "Fotografije", icon: Camera },
  { id: "snapshots", label: "Zgodovina", icon: History },
];

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("twin");
  const [swDialogOpen, setSwDialogOpen] = useState(false);
  const [dtcDialogOpen, setDtcDialogOpen] = useState(false);
  const [homDialogOpen, setHomDialogOpen] = useState(false);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [cocDialogOpen, setCocDialogOpen] = useState(false);
  const [vectoDialogOpen, setVectoDialogOpen] = useState(false);
  const [expandedVecto, setExpandedVecto] = useState<string | null>(null);
  const [homPhotoUploadId, setHomPhotoUploadId] = useState<string | null>(null);
  const [homEditTarget, setHomEditTarget] = useState<Homologation | null>(null);
  const [serviceEditTarget, setServiceEditTarget] = useState<ServiceRecord | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isPartner = user?.role === "partner_viewer";

  const swStatusMutation = useMutation({
    mutationFn: ({ swId, newStatus }: { swId: string; newStatus: string }) =>
      swApi.update(swId, { status: newStatus }),
    onSuccess: () => {
      toast.success("Status SW posodobitve posodobljen");
      queryClient.invalidateQueries({ queryKey: ["sw-updates", id] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-stats", id] });
    },
    onError: () => toast.error("Napaka pri posodabljanju statusa"),
  });

  const vehicleStatusMutation = useMutation({
    mutationFn: (newStatus: string) => vehiclesApi.update(id, { status: newStatus }),
    onSuccess: () => {
      toast.success("Status vozila posodobljen");
      queryClient.invalidateQueries({ queryKey: ["vehicle", id] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-stats", id] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: () => toast.error("Napaka pri posodabljanju statusa"),
  });

  const photoDeleteMutation = useMutation({
    mutationFn: (photoId: string) => photosApi.delete(photoId),
    onSuccess: () => {
      toast.success("Fotografija izbrisana");
      queryClient.invalidateQueries({ queryKey: ["photos", id] });
    },
    onError: () => toast.error("Napaka pri brisanju fotografije"),
  });

  const serviceDeleteMutation = useMutation({
    mutationFn: (recordId: string) => serviceApi.delete(recordId),
    onSuccess: () => {
      toast.success("Servisni zapis izbrisan");
      queryClient.invalidateQueries({ queryKey: ["service", id] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-stats", id] });
    },
    onError: () => toast.error("Napaka pri brisanju servisnega zapisa"),
  });

  const dtcResolveMutation = useMutation({
    mutationFn: ({ dtcId, newStatus }: { dtcId: string; newStatus: string }) =>
      dtcApi.update(dtcId, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dtc", id] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-stats", id] });
    },
    onError: () => toast.error("Napaka pri posodabljanju DTC"),
  });

  const { data: vehicle, isLoading } = useQuery<Vehicle>({
    queryKey: ["vehicle", id],
    queryFn: () => vehiclesApi.get(id),
  });

  const { data: stats } = useQuery<{
    sw_updates: number; dtc_active: number; dtc_high: number;
    service_records: number; hom_approved: number; hom_pending: number;
  }>({
    queryKey: ["vehicle-stats", id],
    queryFn: () => vehiclesApi.stats(id),
    refetchInterval: 60_000,
  });

  const { data: swUpdates } = useQuery<SwUpdate[]>({
    queryKey: ["sw-updates", id],
    queryFn: () => swApi.list({ vehicle_id: id }),
    enabled: activeTab === "sw",
  });

  const { data: dtcs } = useQuery<DtcRecord[]>({
    queryKey: ["dtc", id],
    queryFn: () => dtcApi.list({ vehicle_id: id }),
    enabled: activeTab === "dtc",
  });

  const { data: services } = useQuery<ServiceRecord[]>({
    queryKey: ["service", id],
    queryFn: () => serviceApi.list({ vehicle_id: id }),
    enabled: activeTab === "service",
  });

  const { data: homs } = useQuery<Homologation[]>({
    queryKey: ["hom", id],
    queryFn: () => homApi.list({ vehicle_id: id }),
    enabled: activeTab === "hom",
  });

  const { data: cocs } = useQuery<CoCCertificate[]>({
    queryKey: ["coc", id],
    queryFn: () => cocApi.list({ vehicle_id: id }),
    enabled: activeTab === "coc",
  });

  const { data: vectos } = useQuery<VectoCalculation[]>({
    queryKey: ["vecto", id],
    queryFn: () => vectoApi.list({ vehicle_id: id }),
    enabled: activeTab === "vecto",
  });

  const { data: snapshots } = useQuery<TwinSnapshot[]>({
    queryKey: ["snapshots", id],
    queryFn: () => vehiclesApi.snapshots(id),
    enabled: activeTab === "snapshots",
  });

  const { data: photos } = useQuery<Photo[]>({
    queryKey: ["photos", id],
    queryFn: () => photosApi.list(id),
    enabled: activeTab === "photos",
  });

  const { data: obdSessions } = useQuery<OBDSession[]>({
    queryKey: ["obd-sessions", id],
    queryFn: () => obdApi.sessions(id),
    enabled: activeTab === "obd",
  });

  const { data: obdLive } = useQuery<OBDLiveDataResponse>({
    queryKey: ["obd-live", id],
    queryFn: () => obdApi.live(id),
    enabled: activeTab === "obd",
    refetchInterval: 30_000,
  });

  const downloadSums = async () => {
    try {
      const blob = await reportsApi.sumsPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SUMS_${vehicle?.vin ?? id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Napaka pri generiranju PDF poročila");
    }
  };

  const snapshotMutation = useMutation({
    mutationFn: () => vehiclesApi.snapshot(id),
    onSuccess: () => {
      toast.success("Snapshot ustvarjen");
      queryClient.invalidateQueries({ queryKey: ["snapshots", id] });
    },
    onError: () => toast.error("Napaka pri ustvarjanju snapshota"),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="text-center py-16 text-gray-400">
        Vozilo ni najdeno
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/vehicles"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Vozila
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">{vehicle.name}</h2>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
            <span className="font-mono">{vehicle.vin}</span>
            <span>·</span>
            <span>{vehicle.model} {vehicle.year}</span>
            <span>·</span>
            <select
              value={vehicle.status}
              onChange={(e) => vehicleStatusMutation.mutate(e.target.value)}
              disabled={vehicleStatusMutation.isPending}
              className={`rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer focus:ring-1 focus:ring-blue-400 ${statusColor(vehicle.status)}`}
              title="Klikni za spremembo statusa"
            >
              <option value="active">active</option>
              <option value="in_service">in_service</option>
              <option value="shipped">shipped</option>
              <option value="decommissioned">decommissioned</option>
            </select>
          </div>
          {vehicle.project_name && (
            <p className="mt-1 text-sm text-gray-400">Projekt: {vehicle.project_name}</p>
          )}
          {stats && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                <Cpu className="h-3 w-3" />
                {stats.sw_updates} SW {stats.sw_updates === 1 ? "posodobitev" : "posodobitev"}
              </span>
              {stats.dtc_active > 0 ? (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                  stats.dtc_high > 0
                    ? "bg-red-50 text-red-700 ring-red-200"
                    : "bg-yellow-50 text-yellow-700 ring-yellow-200"
                }`}>
                  <AlertTriangle className="h-3 w-3" />
                  {stats.dtc_active} DTC{stats.dtc_high > 0 && ` (${stats.dtc_high} visoka)`}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
                  <AlertTriangle className="h-3 w-3" />
                  0 DTC
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                <Wrench className="h-3 w-3" />
                {stats.service_records} servis{stats.service_records === 1 ? "" : "ov"}
              </span>
              {stats.hom_approved > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  <ShieldCheck className="h-3 w-3" />
                  {stats.hom_approved} hom. odobrenih
                </span>
              )}
              {stats.hom_pending > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-200">
                  <Clock className="h-3 w-3" />
                  {stats.hom_pending} hom. v teku
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {!isPartner && (
            <Button variant="outline" size="sm" onClick={() => snapshotMutation.mutate()}>
              <History className="mr-2 h-4 w-4" />
              Snapshot
            </Button>
          )}
          {!isPartner && (
            <Button variant="outline" size="sm" onClick={() => setSwDialogOpen(true)}>
              <Cpu className="mr-2 h-4 w-4" />
              SW posodobitev
            </Button>
          )}
          <Button size="sm" onClick={downloadSums}>
            <FileText className="mr-2 h-4 w-4" />
            SUMS PDF
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tabId
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "twin" && <VehicleTwin vehicleId={id} />}

      {activeTab === "sw" && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-gray-600">SW posodobitve</CardTitle>
              {!isPartner && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSwDialogOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Nova SW posodobitev
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3">Datum</th>
                  <th className="px-4 py-3">ECU modul</th>
                  <th className="px-4 py-3">Verzija pred</th>
                  <th className="px-4 py-3">Verzija po</th>
                  <th className="px-4 py-3">RXSWIN</th>
                  <th className="px-4 py-3">Metoda</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(swUpdates ?? []).map((sw) => (
                  <tr key={sw.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{formatDate(sw.date)}</td>
                    <td className="px-4 py-3 font-mono font-medium">{sw.ecu_module}</td>
                    <td className="px-4 py-3 font-mono text-red-600">{sw.version_before}</td>
                    <td className="px-4 py-3 font-mono text-green-700">{sw.version_after}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{sw.rxswin}</td>
                    <td className="px-4 py-3">
                      <Badge variant="info">{sw.method}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(sw.status)}`}>
                        {sw.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {sw.status === "pending" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => swStatusMutation.mutate({ swId: sw.id, newStatus: "in_progress" })}
                            className="rounded px-2 py-0.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100"
                          >
                            Začni
                          </button>
                        </div>
                      )}
                      {sw.status === "in_progress" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => swStatusMutation.mutate({ swId: sw.id, newStatus: "success" })}
                            className="rounded px-2 py-0.5 text-xs bg-green-50 text-green-700 hover:bg-green-100"
                          >
                            Uspeh
                          </button>
                          <button
                            onClick={() => swStatusMutation.mutate({ swId: sw.id, newStatus: "failed" })}
                            className="rounded px-2 py-0.5 text-xs bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            Napaka
                          </button>
                        </div>
                      )}
                      {sw.status === "failed" && (
                        <button
                          onClick={() => swStatusMutation.mutate({ swId: sw.id, newStatus: "rolled_back" })}
                          className="rounded px-2 py-0.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200"
                        >
                          Povrnitev
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!swUpdates?.length && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      Ni SW posodobitev
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {activeTab === "dtc" && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-gray-600">DTC zapisi</CardTitle>
              {!isPartner && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDtcDialogOpen(true)}>
                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                  Dodaj DTC
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3">Koda</th>
                  <th className="px-4 py-3">Opis</th>
                  <th className="px-4 py-3">Resnost</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Zaznano</th>
                  <th className="px-4 py-3">Vir</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(dtcs ?? []).map((dtc) => (
                  <tr key={dtc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-semibold">{dtc.code}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={dtc.description}>{dtc.description}</td>
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
                          <button
                            onClick={() => dtcResolveMutation.mutate({ dtcId: dtc.id, newStatus: "in_review" })}
                            className="rounded px-2 py-0.5 text-xs bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                          >
                            Pregled
                          </button>
                        )}
                        {dtc.status !== "resolved" && (
                          <button
                            onClick={() => dtcResolveMutation.mutate({ dtcId: dtc.id, newStatus: "resolved" })}
                            className="rounded px-2 py-0.5 text-xs bg-green-50 text-green-700 hover:bg-green-100"
                          >
                            Reši
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!dtcs?.length && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      Ni DTC zapisov
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {activeTab === "obd" && (
        <div className="space-y-4">
          {/* Live Data */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-blue-600" />
                Live OBD podatki
                {obdLive?.last_scanned_at && (
                  <span className="ml-auto text-xs font-normal text-gray-400">
                    Zadnji sken: {formatDate(obdLive.last_scanned_at)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!obdLive?.has_data ? (
                <p className="py-4 text-center text-sm text-gray-400">
                  Ni OBD podatkov — zaženite sken na strani{" "}
                  <a href="/obd" className="text-blue-600 underline">OBD diagnostika</a>
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {obdLive.live_data.rpm !== undefined && (
                    <div className="flex flex-col items-center rounded-xl border bg-white p-3 shadow-sm min-w-[110px]">
                      <Gauge className="mb-1 h-4 w-4 text-gray-400" />
                      <p className="text-lg font-bold">{Number(obdLive.live_data.rpm).toFixed(0)} <span className="text-xs font-normal text-gray-500">RPM</span></p>
                      <p className="text-xs text-gray-400">Vrtljaji</p>
                    </div>
                  )}
                  {obdLive.live_data.speed_kmh !== undefined && (
                    <div className="flex flex-col items-center rounded-xl border bg-white p-3 shadow-sm min-w-[110px]">
                      <Gauge className="mb-1 h-4 w-4 text-gray-400" />
                      <p className="text-lg font-bold">{Number(obdLive.live_data.speed_kmh).toFixed(0)} <span className="text-xs font-normal text-gray-500">km/h</span></p>
                      <p className="text-xs text-gray-400">Hitrost</p>
                    </div>
                  )}
                  {obdLive.live_data.coolant_temp_c !== undefined && (
                    <div className={`flex flex-col items-center rounded-xl border p-3 shadow-sm min-w-[110px] ${Number(obdLive.live_data.coolant_temp_c) > 100 ? "bg-red-50 border-red-200" : "bg-white"}`}>
                      <Thermometer className="mb-1 h-4 w-4 text-gray-400" />
                      <p className={`text-lg font-bold ${Number(obdLive.live_data.coolant_temp_c) > 100 ? "text-red-600" : ""}`}>
                        {Number(obdLive.live_data.coolant_temp_c).toFixed(1)} <span className="text-xs font-normal text-gray-500">°C</span>
                      </p>
                      <p className="text-xs text-gray-400">Hladilnik</p>
                    </div>
                  )}
                  {obdLive.live_data.battery_voltage !== undefined && (
                    <div className={`flex flex-col items-center rounded-xl border p-3 shadow-sm min-w-[110px] ${Number(obdLive.live_data.battery_voltage) < 11.5 ? "bg-red-50 border-red-200" : "bg-white"}`}>
                      <Battery className="mb-1 h-4 w-4 text-gray-400" />
                      <p className={`text-lg font-bold ${Number(obdLive.live_data.battery_voltage) < 11.5 ? "text-red-600" : "text-green-600"}`}>
                        {Number(obdLive.live_data.battery_voltage).toFixed(1)} <span className="text-xs font-normal text-gray-500">V</span>
                      </p>
                      <p className="text-xs text-gray-400">Akumulator</p>
                    </div>
                  )}
                  {obdLive.live_data.fuel_level_pct !== undefined && (
                    <div className="flex flex-col items-center rounded-xl border bg-white p-3 shadow-sm min-w-[110px]">
                      <Fuel className="mb-1 h-4 w-4 text-gray-400" />
                      <p className={`text-lg font-bold ${Number(obdLive.live_data.fuel_level_pct) < 15 ? "text-red-600" : ""}`}>
                        {Number(obdLive.live_data.fuel_level_pct).toFixed(0)} <span className="text-xs font-normal text-gray-500">%</span>
                      </p>
                      <p className="text-xs text-gray-400">Gorivo</p>
                    </div>
                  )}
                  {obdLive.live_data.engine_load_pct !== undefined && (
                    <div className="flex flex-col items-center rounded-xl border bg-white p-3 shadow-sm min-w-[110px]">
                      <Zap className="mb-1 h-4 w-4 text-gray-400" />
                      <p className="text-lg font-bold">{Number(obdLive.live_data.engine_load_pct).toFixed(0)} <span className="text-xs font-normal text-gray-500">%</span></p>
                      <p className="text-xs text-gray-400">Obremenitev</p>
                    </div>
                  )}
                  {obdLive.live_data.mil_on !== undefined && (
                    <div className={`flex flex-col items-center rounded-xl border p-3 shadow-sm min-w-[110px] ${obdLive.live_data.mil_on ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                      <AlertTriangle className={`mb-1 h-4 w-4 ${obdLive.live_data.mil_on ? "text-red-500" : "text-green-500"}`} />
                      <p className={`text-lg font-bold ${obdLive.live_data.mil_on ? "text-red-600" : "text-green-600"}`}>
                        {obdLive.live_data.mil_on ? "ON" : "OFF"}
                      </p>
                      <p className="text-xs text-gray-400">MIL</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sessions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Plug className="h-4 w-4 text-gray-600" />
                OBD seje
                <span className="ml-auto text-xs font-normal text-gray-400">
                  {(obdSessions ?? []).length} sej
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                    <th className="px-4 py-2">Čas</th>
                    <th className="px-4 py-2">Adapter</th>
                    <th className="px-4 py-2">DTC</th>
                    <th className="px-4 py-2">Uvoženi</th>
                    <th className="px-4 py-2">Kode</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(obdSessions ?? []).map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-600">{formatDate(s.scanned_at)}</td>
                      <td className="px-4 py-2">
                        <Badge variant="muted">{s.adapter_type}</Badge>
                      </td>
                      <td className="px-4 py-2 font-semibold">{s.dtc_count}</td>
                      <td className="px-4 py-2 text-green-600">{s.dtcs_imported}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {s.dtcs_raw.slice(0, 4).map((d, i) => (
                            <span key={i} className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-xs text-red-700">
                              {d.code}
                            </span>
                          ))}
                          {s.dtcs_raw.length > 4 && (
                            <span className="text-xs text-gray-400">+{s.dtcs_raw.length - 4}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(obdSessions ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-400">Ni OBD sej</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "service" && (
        <div className="space-y-4">
          {!isPartner && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setServiceDialogOpen(true)}>
                <Wrench className="mr-1.5 h-4 w-4" />
                Nov servis
              </Button>
            </div>
          )}
          {(services ?? []).map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="info">{s.service_type}</Badge>
                      <span className="text-sm text-gray-500">{formatDate(s.date)}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium">Tehnik: {s.technician}</p>
                    <ul className="mt-1 list-inside list-disc text-sm text-gray-600">
                      {s.items.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                    {s.notes && (
                      <p className="mt-2 text-sm italic text-gray-500">{s.notes}</p>
                    )}
                  </div>
                  {!isPartner && (
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <button
                        onClick={() => setServiceEditTarget(s)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-900 hover:underline"
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        Uredi
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Izbriši ta servisni zapis?")) {
                            serviceDeleteMutation.mutate(s.id);
                          }
                        }}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 hover:underline"
                        title="Izbriši servisni zapis"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {!services?.length && (
            <p className="text-center text-gray-400 py-8">Ni servisnih zapisov</p>
          )}
        </div>
      )}

      {activeTab === "hom" && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-gray-600">Homologacije</CardTitle>
              {!isPartner && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setHomDialogOpen(true)}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  Dodaj homologacijo
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3">Uredba</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Oblast</th>
                  <th className="px-4 py-3">Država</th>
                  <th className="px-4 py-3">Veljavno do</th>
                  <th className="px-4 py-3">Naslednja akcija</th>
                  <th className="px-4 py-3">Opomba</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(homs ?? []).map((h) => (
                  <>
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold">{h.regulation}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(h.status)}`}>
                          {h.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{h.authority ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{h.country ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(h.valid_until)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(h.next_action_due)}</td>
                      <td className="px-4 py-3 max-w-[120px]">
                        {h.notes ? (
                          <span
                            className="block truncate text-xs text-gray-500 cursor-help"
                            title={h.notes}
                          >
                            {h.notes}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {!isPartner && (
                            <button
                              onClick={() => setHomEditTarget(h)}
                              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Uredi
                            </button>
                          )}
                          <button
                            onClick={() => setHomPhotoUploadId(homPhotoUploadId === h.id ? null : h.id)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <Camera className="h-3.5 w-3.5" />
                            {homPhotoUploadId === h.id ? "Zapri" : "Foto"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {homPhotoUploadId === h.id && (
                      <tr key={`${h.id}-upload`}>
                        <td colSpan={8} className="bg-blue-50 px-4 py-4">
                          <HomPhotoPanel
                            vehicleId={id}
                            homId={h.id}
                            regulation={h.regulation}
                            onClose={() => setHomPhotoUploadId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {!homs?.length && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      Ni homologacij
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── CoC Certifikati ─────────────────────────────────────────── */}
      {activeTab === "coc" && (
        <div className="space-y-4">
          {!isPartner && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setCocDialogOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Nov CoC certifikat
              </Button>
            </div>
          )}
          {(cocs ?? []).length === 0 ? (
            <div className="flex h-32 items-center justify-center text-gray-400">
              <p>Ni CoC certifikatov</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(cocs ?? []).map((c) => (
                <Card key={c.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-mono font-semibold text-gray-900">{c.coc_number}</p>
                        {c.issuing_body && (
                          <p className="text-sm text-gray-500">{c.issuing_body}</p>
                        )}
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <p>Izdano: {formatDate(c.issued_at)}</p>
                        {c.valid_until && <p>Velja do: {formatDate(c.valid_until)}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── VECTO Kalkulacije ────────────────────────────────────────── */}
      {activeTab === "vecto" && (
        <div className="space-y-4">
          {!isPartner && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setVectoDialogOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Nova kalkulacija
              </Button>
            </div>
          )}
          {(vectos ?? []).length === 0 ? (
            <div className="flex h-32 items-center justify-center text-gray-400">
              <p>Ni VECTO kalkulacij</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                      <th className="px-4 py-3">Datum</th>
                      <th className="px-4 py-3">CO₂ WLTP</th>
                      <th className="px-4 py-3">Energija WLTP</th>
                      <th className="px-4 py-3">Doseg</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(vectos ?? []).map((v) => (
                      <>
                        <tr
                          key={v.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpandedVecto(expandedVecto === v.id ? null : v.id)}
                        >
                          <td className="px-4 py-3 text-gray-600">{formatDate(v.calculated_at)}</td>
                          <td className="px-4 py-3 font-mono">
                            {v.co2_wltp != null ? `${v.co2_wltp} g/km` : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {v.energy_wltp != null ? `${v.energy_wltp} Wh/km` : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {v.range_km != null ? `${v.range_km} km` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(v.status)}`}>
                              {v.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const blob = await vectoApi.pdf(v.id);
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `VECTO_${v.calculated_at}.pdf`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                } catch {
                                  toast.error("Napaka pri generiranju VECTO PDF");
                                }
                              }}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              PDF
                            </button>
                          </td>
                        </tr>
                        {expandedVecto === v.id && v.input_params && Object.keys(v.input_params).length > 0 && (
                          <tr key={`${v.id}-params`} className="bg-blue-50">
                            <td colSpan={6} className="px-6 py-4">
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Vhodni parametri simulacije</p>
                              <div className="grid grid-cols-3 gap-x-8 gap-y-1 text-xs">
                                {[
                                  { k: "masa_prazno_kg", label: "Masa praznega", unit: "kg" },
                                  { k: "masa_test_kg", label: "Testna masa", unit: "kg" },
                                  { k: "masa_max_kg", label: "GVM max", unit: "kg" },
                                  { k: "cd", label: "Cₐ (drag)", unit: "" },
                                  { k: "a_front_m2", label: "Čelna površina", unit: "m²" },
                                  { k: "cda", label: "Cₐ × A", unit: "m²" },
                                  { k: "crr_spredaj", label: "Crr spredaj", unit: "N/kN" },
                                  { k: "crr_zadaj", label: "Crr zadaj", unit: "N/kN" },
                                  { k: "kapaciteta_kwh", label: "Kapaciteta baterije", unit: "kWh" },
                                  { k: "napetost_v", label: "Nom. napetost", unit: "V" },
                                  { k: "max_moc_polnjenja_kw", label: "Max polnjenje", unit: "kW" },
                                  { k: "max_moc_kw", label: "Max moč motorja", unit: "kW" },
                                  { k: "max_navor_nm", label: "Max navor", unit: "Nm" },
                                  { k: "wltp_cikel", label: "WLTP cikel", unit: "" },
                                  { k: "temperatura_ref_c", label: "Ref. temperatura", unit: "°C" },
                                  { k: "tovor_kg", label: "Tovor", unit: "kg" },
                                ]
                                  .filter(({ k }) => v.input_params![k] != null)
                                  .map(({ k, label, unit }) => (
                                    <div key={k} className="flex gap-1">
                                      <span className="text-gray-500">{label}:</span>
                                      <span className="font-medium text-gray-800">
                                        {String(v.input_params![k])}{unit ? ` ${unit}` : ""}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "snapshots" && (
        <div className="space-y-3">
          {(snapshots ?? []).map((snap) => (
            <Card key={snap.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{snap.trigger_type}</Badge>
                      {snap.trigger_label && (
                        <span className="text-sm text-gray-600">{snap.trigger_label}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {formatDateTime(snap.created_at)}
                    </p>
                  </div>
                  <div className="text-xs text-gray-400">
                    {Object.keys(snap.snapshot.ecu_config ?? {}).length} ECU modulov
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!snapshots?.length && (
            <p className="text-center text-gray-400 py-8">Ni posnetkov stanja</p>
          )}
        </div>
      )}

      {activeTab === "photos" && (
        <div>
          {!isPartner && <PhotoUpload vehicleId={id} />}
          {(photos ?? []).length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-gray-400">
              <Camera className="h-10 w-10" />
              <p>Ni fotografij</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {(photos ?? []).map((photo) => (
                <div
                  key={photo.id}
                  className="group relative overflow-hidden rounded-xl border bg-gray-50 hover:shadow-md transition-shadow"
                >
                  <a
                    href={photo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <div className="aspect-video bg-gray-200 flex items-center justify-center overflow-hidden">
                      {photo.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo.url}
                          alt={photo.filename}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                            e.currentTarget.nextElementSibling?.classList.remove("hidden");
                          }}
                        />
                      ) : null}
                      <Camera className={`h-8 w-8 text-gray-400 ${photo.url ? "hidden" : ""}`} />
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-medium text-gray-700">{photo.filename}</p>
                      {photo.photo_type && (
                        <p className="text-xs text-gray-400 capitalize">{photo.photo_type}</p>
                      )}
                    </div>
                  </a>
                  {/* Gumb za brisanje */}
                  <button
                    onClick={() => {
                      if (confirm(`Izbriši fotografijo "${photo.filename}"?`)) {
                        photoDeleteMutation.mutate(photo.id);
                      }
                    }}
                    className="absolute top-1.5 right-1.5 rounded-full bg-white/80 p-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all"
                    title="Izbriši fotografijo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CreateSwUpdateDialog
        open={swDialogOpen}
        vehicleId={id}
        onClose={() => setSwDialogOpen(false)}
      />
      <CreateDtcDialog
        open={dtcDialogOpen}
        vehicleId={id}
        onClose={() => setDtcDialogOpen(false)}
      />
      <CreateHomologationDialog
        open={homDialogOpen}
        vehicleId={id}
        onClose={() => setHomDialogOpen(false)}
      />
      <CreateServiceRecordDialog
        open={serviceDialogOpen}
        vehicleId={id}
        onClose={() => setServiceDialogOpen(false)}
      />
      <CreateCoCDialog
        open={cocDialogOpen}
        vehicleId={id}
        onClose={() => setCocDialogOpen(false)}
      />
      <CreateVectoDialog
        open={vectoDialogOpen}
        vehicleId={id}
        onClose={() => setVectoDialogOpen(false)}
      />
      <EditHomologationDialog
        open={homEditTarget !== null}
        hom={homEditTarget}
        vehicleId={id}
        onClose={() => setHomEditTarget(null)}
      />
      <EditServiceRecordDialog
        open={serviceEditTarget !== null}
        record={serviceEditTarget}
        vehicleId={id}
        onClose={() => setServiceEditTarget(null)}
      />
    </div>
  );
}
