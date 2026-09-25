"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { reportsApi, vehiclesApi, homApi } from "@/lib/api";
import { statusColor, formatDate } from "@/lib/utils";
import type { Vehicle, Homologation } from "@/types";
import { FileText, Download, Shield, AlertTriangle, Table2 } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "@/lib/i18n";

export default function ReportsPage() {
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingHomPdf, setGeneratingHomPdf] = useState(false);
  const [generatingSwCsv, setGeneratingSwCsv] = useState(false);
  const [generatingDtcCsv, setGeneratingDtcCsv] = useState(false);
  const [generatingHomCsv, setGeneratingHomCsv] = useState(false);
  const [generatingServiceCsv, setGeneratingServiceCsv] = useState(false);
  const t = useTranslations("reports");

  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: ["vehicles"],
    queryFn: () => vehiclesApi.list(),
  });

  const { data: homs } = useQuery<Homologation[]>({
    queryKey: ["hom-all"],
    queryFn: () => homApi.list(),
  });

  const handleDownloadSums = async () => {
    if (!selectedVehicle) {
      toast.error(t("selectVehicleError"));
      return;
    }
    setGeneratingPdf(true);
    try {
      const blob = await reportsApi.sumsPdf(selectedVehicle);
      const vehicle = vehicles?.find((v) => v.id === selectedVehicle);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SUMS_${vehicle?.vin ?? selectedVehicle}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("sumsPdfSuccess"));
    } catch {
      toast.error(t("pdfError"));
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadHomPdf = async () => {
    if (!selectedVehicle) {
      toast.error(t("selectVehicleError"));
      return;
    }
    setGeneratingHomPdf(true);
    try {
      const blob = await reportsApi.homPdf(selectedVehicle);
      const vehicle = vehicles?.find((v) => v.id === selectedVehicle);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `HOM_${vehicle?.vin ?? selectedVehicle}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("homPdfSuccess"));
    } catch {
      toast.error(t("homPdfError"));
    } finally {
      setGeneratingHomPdf(false);
    }
  };

  const handleSwCsv = async () => {
    setGeneratingSwCsv(true);
    try {
      const blob = await reportsApi.swUpdatescsv(selectedVehicle || undefined);
      const vehicle = vehicles?.find((v) => v.id === selectedVehicle);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SW_updates_${vehicle?.vin ?? "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("csvError"));
    } finally {
      setGeneratingSwCsv(false);
    }
  };

  const handleDtcCsv = async () => {
    setGeneratingDtcCsv(true);
    try {
      const blob = await reportsApi.dtcRecordsCsv(selectedVehicle || undefined);
      const vehicle = vehicles?.find((v) => v.id === selectedVehicle);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DTC_records_${vehicle?.vin ?? "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("csvError"));
    } finally {
      setGeneratingDtcCsv(false);
    }
  };

  const handleHomCsv = async () => {
    setGeneratingHomCsv(true);
    try {
      const blob = await reportsApi.homologationsCsv(selectedVehicle || undefined);
      const vehicle = vehicles?.find((v) => v.id === selectedVehicle);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Homologations_${vehicle?.vin ?? "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("homCsvError"));
    } finally {
      setGeneratingHomCsv(false);
    }
  };

  const handleServiceCsv = async () => {
    setGeneratingServiceCsv(true);
    try {
      const blob = await reportsApi.serviceRecordsCsv(selectedVehicle || undefined);
      const vehicle = vehicles?.find((v) => v.id === selectedVehicle);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Service_records_${vehicle?.vin ?? "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("serviceCsvError"));
    } finally {
      setGeneratingServiceCsv(false);
    }
  };

  // Homologation overview grouped by regulation
  const homByRegulation: Record<string, { approved: number; pending: number; expired: number }> = {};
  for (const hom of homs ?? []) {
    if (!homByRegulation[hom.regulation]) {
      homByRegulation[hom.regulation] = { approved: 0, pending: 0, expired: 0 };
    }
    if (hom.status === "approved") homByRegulation[hom.regulation].approved++;
    else if (hom.status === "expired" || hom.status === "rejected") homByRegulation[hom.regulation].expired++;
    else homByRegulation[hom.regulation].pending++;
  }

  // Upcoming expirations (next 30 days)
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiring = (homs ?? []).filter((h) => {
    if (!h.next_action_due) return false;
    const d = new Date(h.next_action_due);
    return d >= now && d <= in30;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t("title")}</h2>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </div>

      {/* SUMS PDF Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-blue-600" />
            {t("sumsPdfTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-600">{t("sumsPdfDesc")}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t("vehicleLabel")}
              </label>
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              >
                <option value="">{t("selectVehicle")}</option>
                {(vehicles ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.vin})
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleDownloadSums}
              disabled={!selectedVehicle || generatingPdf}
              className="sm:w-auto"
            >
              {generatingPdf ? (
                <Spinner className="mr-2 h-4 w-4" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {t("downloadPdf")}
            </Button>
          </div>
          <div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
            <strong>{t("sumsPdfContent")}</strong> {t("sumsPdfContentDetail")}
          </div>
        </CardContent>
      </Card>

      {/* HOM PDF Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-purple-600" />
            {t("homPdfTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-600">{t("homPdfDesc")}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("vehicleLabel")}</label>
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              >
                <option value="">{t("selectVehicle")}</option>
                {(vehicles ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.vin})
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleDownloadHomPdf}
              disabled={!selectedVehicle || generatingHomPdf}
              variant="outline"
              className="sm:w-auto"
            >
              {generatingHomPdf ? (
                <Spinner className="mr-2 h-4 w-4" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {t("downloadHomPdf")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* CSV Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Table2 className="h-4 w-4 text-green-600" />
            {t("csvTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-600">{t("csvDesc")}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t("vehicleOptional")}
              </label>
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              >
                <option value="">{t("allVehicles")}</option>
                {(vehicles ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.vin})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSwCsv} disabled={generatingSwCsv}>
                {generatingSwCsv ? <Spinner className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                {t("swCsv")}
              </Button>
              <Button variant="outline" onClick={handleDtcCsv} disabled={generatingDtcCsv}>
                {generatingDtcCsv ? <Spinner className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                {t("dtcCsv")}
              </Button>
              <Button variant="outline" onClick={handleHomCsv} disabled={generatingHomCsv}>
                {generatingHomCsv ? <Spinner className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                {t("homCsv")}
              </Button>
              <Button variant="outline" onClick={handleServiceCsv} disabled={generatingServiceCsv}>
                {generatingServiceCsv ? <Spinner className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                {t("serviceCsv")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Homologation Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-purple-600" />
            {t("homOverviewTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(homByRegulation).length === 0 ? (
            <p className="text-sm text-gray-400">{t("noHomData")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium uppercase text-gray-500">
                  <th className="pb-3">{t("colRegulation")}</th>
                  <th className="pb-3 text-green-700">{t("colApproved")}</th>
                  <th className="pb-3 text-yellow-600">{t("colPending")}</th>
                  <th className="pb-3 text-red-600">{t("colExpired")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.entries(homByRegulation).map(([reg, counts]) => (
                  <tr key={reg} className="hover:bg-gray-50">
                    <td className="py-3 font-semibold text-gray-900">{reg}</td>
                    <td className="py-3 font-semibold text-green-700">{counts.approved}</td>
                    <td className="py-3 font-semibold text-yellow-600">{counts.pending}</td>
                    <td className="py-3 font-semibold text-red-600">{counts.expired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Upcoming expirations */}
      {expiring.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              {t("upcomingTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expiring.map((h) => {
                const vehicle = vehicles?.find((v) => v.id === h.vehicle_id);
                return (
                  <div key={h.id} className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 p-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        {vehicle?.name ?? h.vehicle_id.slice(0, 8)} — {h.regulation}
                      </p>
                      <p className="text-xs text-gray-500">{vehicle?.vin}</p>
                    </div>
                    <div className="text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(h.status)}`}>
                        {h.status}
                      </span>
                      <p className="mt-1 text-xs text-orange-600 font-medium">
                        {t("deadline")} {formatDate(h.next_action_due)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
