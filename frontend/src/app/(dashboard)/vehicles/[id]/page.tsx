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
import { useTranslations } from "@/lib/i18n";

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

  const tHom = useTranslations("vehicleDetail.homPhotoPanel");
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-blue-700">
        {tHom("title")} <strong>{regulation}</strong>
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

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("vehicleDetail");
  const tSw = useTranslations("vehicleDetail.swTab");
  const tDtc = useTranslations("vehicleDetail.dtcTab");
  const tObd = useTranslations("vehicleDetail.obdTab");
  const tService = useTranslations("vehicleDetail.serviceTab");
  const tHom = useTranslations("vehicleDetail.homTab");
  const tCoc = useTranslations("vehicleDetail.cocTab");
  const tVecto = useTranslations("vehicleDetail.vectoTab");
  const tVectoCalc = useTranslations("vecto");
  const tPhotos = useTranslations("vehicleDetail.photosTab");
  const tSnap = useTranslations("vehicleDetail.snapshotsTab");

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "twin", label: t("tabTwin"), icon: Cpu },
    { id: "sw", label: t("tabSw"), icon: Cpu },
    { id: "dtc", label: t("tabDtc"), icon: AlertTriangle },
    { id: "obd", label: t("tabObd"), icon: Plug },
    { id: "service", label: t("tabService"), icon: Wrench },
    { id: "hom", label: t("tabHom"), icon: FileText },
    { id: "coc", label: t("tabCoc"), icon: FileText },
    { id: "vecto", label: t("tabVecto"), icon: Cpu },
    { id: "photos", label: t("tabPhotos"), icon: Camera },
    { id: "snapshots", label: t("tabSnapshots"), icon: History },
  ];

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
      toast.success(t("swStatusUpdated"));
      queryClient.invalidateQueries({ queryKey: ["sw-updates", id] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-stats", id] });
    },
    onError: () => toast.error(t("swStatusUpdated")),
  });

  const vehicleStatusMutation = useMutation({
    mutationFn: (newStatus: string) => vehiclesApi.update(id, { status: newStatus }),
    onSuccess: () => {
      toast.success(t("statusUpdated"));
      queryClient.invalidateQueries({ queryKey: ["vehicle", id] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-stats", id] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: () => toast.error(t("statusUpdated")),
  });

  const photoDeleteMutation = useMutation({
    mutationFn: (photoId: string) => photosApi.delete(photoId),
    onSuccess: () => {
      toast.success(tPhotos("deleteSuccess"));
      queryClient.invalidateQueries({ queryKey: ["photos", id] });
    },
    onError: () => toast.error(tPhotos("deleteError")),
  });

  const serviceDeleteMutation = useMutation({
    mutationFn: (recordId: string) => serviceApi.delete(recordId),
    onSuccess: () => {
      toast.success(tService("deleteSuccess"));
      queryClient.invalidateQueries({ queryKey: ["service", id] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-stats", id] });
    },
    onError: () => toast.error(tService("deleteError")),
  });

  const dtcResolveMutation = useMutation({
    mutationFn: ({ dtcId, newStatus }: { dtcId: string; newStatus: string }) =>
      dtcApi.update(dtcId, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dtc", id] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-stats", id] });
    },
    onError: () => toast.error(t("swStatusUpdated")),
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
      toast.error(t("pdfError"));
    }
  };

  const snapshotMutation = useMutation({
    mutationFn: () => vehiclesApi.snapshot(id),
    onSuccess: () => {
      toast.success(t("snapshotCreated"));
      queryClient.invalidateQueries({ queryKey: ["snapshots", id] });
    },
    onError: () => toast.error(t("snapshotError")),
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
        {t("notFound")}
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
            <ArrowLeft className="h-4 w-4" /> {t("backToVehicles")}
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
              title={t("clickToChangeStatus")}
            >
              <option value="active">active</option>
              <option value="in_service">in_service</option>
              <option value="shipped">shipped</option>
              <option value="decommissioned">decommissioned</option>
            </select>
          </div>
          {vehicle.project_name && (
            <p className="mt-1 text-sm text-gray-400">{t("project")} {vehicle.project_name}</p>
          )}
          {stats && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                <Cpu className="h-3 w-3" />
                {t("swCount", { count: stats.sw_updates, singular: t("swSingular") })}
              </span>
              {stats.dtc_active > 0 ? (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                  stats.dtc_high > 0
                    ? "bg-red-50 text-red-700 ring-red-200"
                    : "bg-yellow-50 text-yellow-700 ring-yellow-200"
                }`}>
                  <AlertTriangle className="h-3 w-3" />
                  {t("dtcActive", { count: stats.dtc_active })}{stats.dtc_high > 0 && t("dtcHigh", { count: stats.dtc_high })}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
                  <AlertTriangle className="h-3 w-3" />
                  0 DTC
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                <Wrench className="h-3 w-3" />
                {t("serviceCount", { count: stats.service_records, suffix: "" })}
              </span>
              {stats.hom_approved > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  <ShieldCheck className="h-3 w-3" />
                  {t("homApproved", { count: stats.hom_approved })}
                </span>
              )}
              {stats.hom_pending > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-200">
                  <Clock className="h-3 w-3" />
                  {t("homPending", { count: stats.hom_pending })}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {!isPartner && (
            <Button variant="outline" size="sm" onClick={() => snapshotMutation.mutate()}>
              <History className="mr-2 h-4 w-4" />
              {t("snapshotBtn")}
            </Button>
          )}
          {!isPartner && (
            <Button variant="outline" size="sm" onClick={() => setSwDialogOpen(true)}>
              <Cpu className="mr-2 h-4 w-4" />
              {t("swUpdateBtn")}
            </Button>
          )}
          <Button size="sm" onClick={downloadSums}>
            <FileText className="mr-2 h-4 w-4" />
            {t("sumsPdfBtn")}
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
              <CardTitle className="text-sm text-gray-600">{tSw("title")}</CardTitle>
              {!isPartner && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSwDialogOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {tSw("newBtn")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3">{tSw("colDate")}</th>
                  <th className="px-4 py-3">{tSw("colModule")}</th>
                  <th className="px-4 py-3">{tSw("colVersionBefore")}</th>
                  <th className="px-4 py-3">{tSw("colVersionAfter")}</th>
                  <th className="px-4 py-3">{tSw("colRxswin")}</th>
                  <th className="px-4 py-3">{tSw("colMethod")}</th>
                  <th className="px-4 py-3">{tSw("colStatus")}</th>
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
                            {tSw("actionStart")}
                          </button>
                        </div>
                      )}
                      {sw.status === "in_progress" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => swStatusMutation.mutate({ swId: sw.id, newStatus: "success" })}
                            className="rounded px-2 py-0.5 text-xs bg-green-50 text-green-700 hover:bg-green-100"
                          >
                            {tSw("actionSuccess")}
                          </button>
                          <button
                            onClick={() => swStatusMutation.mutate({ swId: sw.id, newStatus: "failed" })}
                            className="rounded px-2 py-0.5 text-xs bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            {tSw("actionFail")}
                          </button>
                        </div>
                      )}
                      {sw.status === "failed" && (
                        <button
                          onClick={() => swStatusMutation.mutate({ swId: sw.id, newStatus: "rolled_back" })}
                          className="rounded px-2 py-0.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200"
                        >
                          {tSw("actionRollback")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!swUpdates?.length && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      {tSw("noData")}
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
              <CardTitle className="text-sm text-gray-600">{tDtc("title")}</CardTitle>
              {!isPartner && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDtcDialogOpen(true)}>
                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                  {tDtc("addBtn")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3">{tDtc("colCode")}</th>
                  <th className="px-4 py-3">{tDtc("colDescription")}</th>
                  <th className="px-4 py-3">{tDtc("colSeverity")}</th>
                  <th className="px-4 py-3">{tDtc("colStatus")}</th>
                  <th className="px-4 py-3">{tDtc("colDetected")}</th>
                  <th className="px-4 py-3">{tDtc("colSource")}</th>
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
                            {tDtc("actionReview")}
                          </button>
                        )}
                        {dtc.status !== "resolved" && (
                          <button
                            onClick={() => dtcResolveMutation.mutate({ dtcId: dtc.id, newStatus: "resolved" })}
                            className="rounded px-2 py-0.5 text-xs bg-green-50 text-green-700 hover:bg-green-100"
                          >
                            {tDtc("actionResolve")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!dtcs?.length && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      {tDtc("noData")}
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
                {tObd("liveTitle")}
                {obdLive?.last_scanned_at && (
                  <span className="ml-auto text-xs font-normal text-gray-400">
                    {tObd("lastScan")} {formatDate(obdLive.last_scanned_at)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!obdLive?.has_data ? (
                <p className="py-4 text-center text-sm text-gray-400">
                  {tObd("noData")}{" "}
                  <a href="/obd" className="text-blue-600 underline">{tObd("obdDiagPage")}</a>
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {obdLive.live_data.rpm !== undefined && (
                    <div className="flex flex-col items-center rounded-xl border bg-white p-3 shadow-sm min-w-[110px]">
                      <Gauge className="mb-1 h-4 w-4 text-gray-400" />
                      <p className="text-lg font-bold">{Number(obdLive.live_data.rpm).toFixed(0)} <span className="text-xs font-normal text-gray-500">RPM</span></p>
                      <p className="text-xs text-gray-400">{tObd("rpm")}</p>
                    </div>
                  )}
                  {obdLive.live_data.speed_kmh !== undefined && (
                    <div className="flex flex-col items-center rounded-xl border bg-white p-3 shadow-sm min-w-[110px]">
                      <Gauge className="mb-1 h-4 w-4 text-gray-400" />
                      <p className="text-lg font-bold">{Number(obdLive.live_data.speed_kmh).toFixed(0)} <span className="text-xs font-normal text-gray-500">km/h</span></p>
                      <p className="text-xs text-gray-400">{tObd("speed")}</p>
                    </div>
                  )}
                  {obdLive.live_data.coolant_temp_c !== undefined && (
                    <div className={`flex flex-col items-center rounded-xl border p-3 shadow-sm min-w-[110px] ${Number(obdLive.live_data.coolant_temp_c) > 100 ? "bg-red-50 border-red-200" : "bg-white"}`}>
                      <Thermometer className="mb-1 h-4 w-4 text-gray-400" />
                      <p className={`text-lg font-bold ${Number(obdLive.live_data.coolant_temp_c) > 100 ? "text-red-600" : ""}`}>
                        {Number(obdLive.live_data.coolant_temp_c).toFixed(1)} <span className="text-xs font-normal text-gray-500">°C</span>
                      </p>
                      <p className="text-xs text-gray-400">{tObd("coolant")}</p>
                    </div>
                  )}
                  {obdLive.live_data.battery_voltage !== undefined && (
                    <div className={`flex flex-col items-center rounded-xl border p-3 shadow-sm min-w-[110px] ${Number(obdLive.live_data.battery_voltage) < 11.5 ? "bg-red-50 border-red-200" : "bg-white"}`}>
                      <Battery className="mb-1 h-4 w-4 text-gray-400" />
                      <p className={`text-lg font-bold ${Number(obdLive.live_data.battery_voltage) < 11.5 ? "text-red-600" : "text-green-600"}`}>
                        {Number(obdLive.live_data.battery_voltage).toFixed(1)} <span className="text-xs font-normal text-gray-500">V</span>
                      </p>
                      <p className="text-xs text-gray-400">{tObd("battery")}</p>
                    </div>
                  )}
                  {obdLive.live_data.fuel_level_pct !== undefined && (
                    <div className="flex flex-col items-center rounded-xl border bg-white p-3 shadow-sm min-w-[110px]">
                      <Fuel className="mb-1 h-4 w-4 text-gray-400" />
                      <p className={`text-lg font-bold ${Number(obdLive.live_data.fuel_level_pct) < 15 ? "text-red-600" : ""}`}>
                        {Number(obdLive.live_data.fuel_level_pct).toFixed(0)} <span className="text-xs font-normal text-gray-500">%</span>
                      </p>
                      <p className="text-xs text-gray-400">{tObd("fuel")}</p>
                    </div>
                  )}
                  {obdLive.live_data.engine_load_pct !== undefined && (
                    <div className="flex flex-col items-center rounded-xl border bg-white p-3 shadow-sm min-w-[110px]">
                      <Zap className="mb-1 h-4 w-4 text-gray-400" />
                      <p className="text-lg font-bold">{Number(obdLive.live_data.engine_load_pct).toFixed(0)} <span className="text-xs font-normal text-gray-500">%</span></p>
                      <p className="text-xs text-gray-400">{tObd("load")}</p>
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
                {tObd("sessionsTitle")}
                <span className="ml-auto text-xs font-normal text-gray-400">
                  {(obdSessions ?? []).length} {tObd("sessions")}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                    <th className="px-4 py-2">{tObd("colTime")}</th>
                    <th className="px-4 py-2">{tObd("colAdapter")}</th>
                    <th className="px-4 py-2">{tObd("colDtc")}</th>
                    <th className="px-4 py-2">{tObd("colImported")}</th>
                    <th className="px-4 py-2">{tObd("colCodes")}</th>
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
                      <td colSpan={5} className="py-8 text-center text-gray-400">{tObd("noSessions")}</td>
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
                {tService("newBtn")}
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
                    <p className="mt-2 text-sm font-medium">{tService("technician")} {s.technician}</p>
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
                        {tService("editBtn")}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(tService("deleteConfirm"))) {
                            serviceDeleteMutation.mutate(s.id);
                          }
                        }}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 hover:underline"
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
            <p className="text-center text-gray-400 py-8">{tService("noData")}</p>
          )}
        </div>
      )}

      {activeTab === "hom" && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-gray-600">{tHom("title")}</CardTitle>
              {!isPartner && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setHomDialogOpen(true)}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  {tHom("addBtn")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3">{tHom("colRegulation")}</th>
                  <th className="px-4 py-3">{tHom("colStatus")}</th>
                  <th className="px-4 py-3">{tHom("colAuthority")}</th>
                  <th className="px-4 py-3">{tHom("colCountry")}</th>
                  <th className="px-4 py-3">{tHom("colValidUntil")}</th>
                  <th className="px-4 py-3">{tHom("colNextAction")}</th>
                  <th className="px-4 py-3">{tHom("colNotes")}</th>
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
                              {tHom("editBtn")}
                            </button>
                          )}
                          <button
                            onClick={() => setHomPhotoUploadId(homPhotoUploadId === h.id ? null : h.id)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <Camera className="h-3.5 w-3.5" />
                            {homPhotoUploadId === h.id ? tHom("photoClose") : tHom("photoOpen")}
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
                      {tHom("noData")}
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
                {tCoc("newBtn")}
              </Button>
            </div>
          )}
          {(cocs ?? []).length === 0 ? (
            <div className="flex h-32 items-center justify-center text-gray-400">
              <p>{tCoc("noData")}</p>
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
                        <p>{tCoc("issuedAt")} {formatDate(c.issued_at)}</p>
                        {c.valid_until && <p>{tCoc("validUntil")} {formatDate(c.valid_until)}</p>}
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
                {tVecto("newBtn")}
              </Button>
            </div>
          )}
          {(vectos ?? []).length === 0 ? (
            <div className="flex h-32 items-center justify-center text-gray-400">
              <p>{tVecto("noData")}</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                      <th className="px-4 py-3">{tVecto("colDate")}</th>
                      <th className="px-4 py-3">{tVecto("colCo2")}</th>
                      <th className="px-4 py-3">{tVecto("colEnergy")}</th>
                      <th className="px-4 py-3">{tVecto("colRange")}</th>
                      <th className="px-4 py-3">{tVecto("colStatus")}</th>
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
                                  toast.error(tVecto("pdfError"));
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
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{tVecto("inputParamsTitle")}</p>
                              <div className="grid grid-cols-3 gap-x-8 gap-y-1 text-xs">
                                {[
                                  { k: "masa_prazno_kg", label: tVectoCalc("masaEmpty"), unit: "kg" },
                                  { k: "masa_test_kg", label: tVectoCalc("masaTest"), unit: "kg" },
                                  { k: "masa_max_kg", label: tVectoCalc("masaMax"), unit: "kg" },
                                  { k: "cd", label: tVectoCalc("aeroCd"), unit: "" },
                                  { k: "a_front_m2", label: tVectoCalc("aeroFront"), unit: "m²" },
                                  { k: "cda", label: tVectoCalc("aeroCda"), unit: "m²" },
                                  { k: "crr_spredaj", label: tVectoCalc("crrFront"), unit: "N/kN" },
                                  { k: "crr_zadaj", label: tVectoCalc("crrRear"), unit: "N/kN" },
                                  { k: "kapaciteta_kwh", label: tVectoCalc("batCapacity"), unit: "kWh" },
                                  { k: "napetost_v", label: tVectoCalc("batVoltage"), unit: "V" },
                                  { k: "max_moc_polnjenja_kw", label: tVectoCalc("batMaxCharge"), unit: "kW" },
                                  { k: "max_moc_kw", label: tVectoCalc("motorMaxPower"), unit: "kW" },
                                  { k: "max_navor_nm", label: tVectoCalc("motorMaxTorque"), unit: "Nm" },
                                  { k: "wltp_cikel", label: tVectoCalc("simWltp"), unit: "" },
                                  { k: "temperatura_ref_c", label: tVectoCalc("simTemp"), unit: "°C" },
                                  { k: "tovor_kg", label: tVectoCalc("simLoad"), unit: "kg" },
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
                    {Object.keys(snap.snapshot.ecu_config ?? {}).length} {tSnap("ecuModules")}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!snapshots?.length && (
            <p className="text-center text-gray-400 py-8">{tSnap("noData")}</p>
          )}
        </div>
      )}

      {activeTab === "photos" && (
        <div>
          {!isPartner && <PhotoUpload vehicleId={id} />}
          {(photos ?? []).length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-gray-400">
              <Camera className="h-10 w-10" />
              <p>{tPhotos("noPhotos")}</p>
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
                      if (confirm(tPhotos("deleteConfirm", { name: photo.filename }))) {
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
