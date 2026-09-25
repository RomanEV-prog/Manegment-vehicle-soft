"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, FileUp, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { downloadCsv, parseCsv } from "@/lib/csv";
import { useTranslations } from "@/lib/i18n";
import { apiError } from "./shared";

interface ImportError {
  row: number;
  error: string;
  vin?: string;
  ecu?: string;
}

interface Result {
  errors: ImportError[];
  to_create?: string[];
  skipped_existing?: string[];
  created?: number;
  plan?: { ecu: string; action: "create" | "update"; sw_version: string }[];
  applied?: number;
}

type Kind = "vehicles" | "items";

const TEMPLATES: Record<Kind, { file: string; header: string[]; example: string[] }> = {
  vehicles: { file: "vehicles-import-template.csv", header: ["vin", "name", "year"], example: ["WEV0ES03000000701", "Shuttle 07", "2025"] },
  items: {
    file: "baseline-items-import-template.csv",
    header: ["ecu", "sw_version", "sw_file_name", "sw_file_sha256", "sw_config_version", "sw_config_file_name",
      "sw_config_sha256", "compatible_hardware", "egnyte_folder_url", "change_log", "description"],
    example: ["Vehicle Control Unit", "ES03v02_vcu1_1_2_115", "ES03v02_vcu1_1_2_115.hex",
      "1a3997c70c0f43f172086e41854262b83d4a7cadf45e08833bd1f066684df9e5", "", "", "", "927889/TTC-500",
      "https://evision.egnyte.com/...", "* APP VERSION 1.2.115", ""],
  },
};

// Prazna polja pošljemo kot null; letnik kot število
function toRows(kind: Kind, parsed: Record<string, string>[]) {
  return parsed.map((r) => {
    const out: Record<string, string | number | null> = {};
    for (const k of TEMPLATES[kind].header) out[k] = r[k] ? r[k] : null;
    if (kind === "vehicles") out.year = r.year ? Number(r.year) : null;
    return out;
  });
}

export function CsvImportDialog({
  open,
  onClose,
  kind,
  url,
  extra,
  title,
  invalidate,
}: {
  open: boolean;
  onClose: () => void;
  kind: Kind;
  url: string;
  extra?: Record<string, unknown>;
  title: string;
  invalidate: unknown[][];
}) {
  const t = useTranslations("csvImport");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRows(null);
      setPreview(null);
      setFileName("");
    }
  }, [open]);

  const send = async (dry_run: boolean) => {
    if (!rows) return;
    setBusy(true);
    try {
      const res = await api.post<Result>(url, { ...extra, rows, dry_run }).then((r) => r.data);
      if (dry_run) setPreview(res);
      else {
        invalidate.forEach((key) => qc.invalidateQueries({ queryKey: key }));
        toast.success(t("done", { n: res.created ?? res.applied ?? 0 }));
        onClose();
      }
    } catch (e) {
      toast.error(apiError(e, tc("error")));
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    const parsed = parseCsv(await file.text());
    if (!parsed.length) {
      toast.error(t("empty"));
      return;
    }
    const missing = kind === "vehicles" ? !("vin" in parsed[0]) : !("ecu" in parsed[0] && "sw_version" in parsed[0]);
    if (missing) {
      toast.error(t("badHeader", { cols: kind === "vehicles" ? "vin" : "ecu, sw_version" }));
      return;
    }
    setRows(toRows(kind, parsed));
  };

  // predogled takoj po izbiri datoteke
  useEffect(() => {
    if (rows) send(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const count = preview ? preview.to_create?.length ?? preview.plan?.length ?? 0 : 0;
  const tpl = TEMPLATES[kind];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">{t(kind === "vehicles" ? "hintVehicles" : "hintItems")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
            <FileUp className="h-4 w-4" />
            {fileName || t("choose")}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <Button variant="ghost" size="sm" onClick={() => downloadCsv(tpl.file, tpl.header, [tpl.example])}>
            <Download className="h-3.5 w-3.5" />
            {t("template")}
          </Button>
          {busy && <Spinner className="h-4 w-4" />}
        </div>

        {preview && (
          <div className="mt-4 space-y-3 text-sm">
            {preview.errors.length > 0 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="mb-2 flex items-center gap-2 font-semibold text-red-800">
                  <AlertTriangle className="h-4 w-4" />
                  {t("errors", { n: preview.errors.length })}
                </p>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-red-800">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      {t("row")} {e.row}
                      {e.vin || e.ecu ? ` (${e.vin ?? e.ecu})` : ""}: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-2 font-medium text-green-800">
                <CheckCircle2 className="h-4 w-4" />
                {t("ready", { n: count })}
              </p>
            )}
            {preview.skipped_existing && preview.skipped_existing.length > 0 && (
              <p className="text-xs text-gray-500">{t("skipped", { n: preview.skipped_existing.length })}: {preview.skipped_existing.join(", ")}</p>
            )}
            {preview.plan && preview.plan.length > 0 && (
              <ul className="rounded-lg border text-xs">
                {preview.plan.map((p) => (
                  <li key={p.ecu} className="flex justify-between border-b px-3 py-1.5 last:border-0">
                    <span className="font-medium">{p.ecu}</span>
                    <span className="font-mono">{p.sw_version}</span>
                    <span className="text-gray-500">{t(`action_${p.action}`)}</span>
                  </li>
                ))}
              </ul>
            )}
            {preview.to_create && preview.to_create.length > 0 && (
              <p className="break-all font-mono text-xs text-gray-600">{preview.to_create.join(", ")}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => send(false)} disabled={!preview || busy || preview.errors.length > 0 || count === 0}>
            {busy && <Spinner className="h-3.5 w-3.5" />}
            {t("import", { n: count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
