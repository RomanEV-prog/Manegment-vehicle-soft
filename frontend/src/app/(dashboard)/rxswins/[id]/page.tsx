"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { r156Api, readmeApi } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { cn, formatDateTime } from "@/lib/utils";
import type { Baseline, BaselineItem, RxswinDetail } from "@/types/r156";
import {
  apiError,
  BaselineStatusBadge,
  ConfirmDialog,
  Field,
  safeHref,
  Textarea,
  usePermissions,
} from "@/components/r156/shared";
import { ItemDialog, VerifyDialog } from "@/components/r156/dialogs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function Sha({ value, ok }: { value: string | null; ok: boolean }) {
  if (!value) return <span className="text-gray-300">—</span>;
  return (
    <span
      title={value}
      className={cn("font-mono text-xs", ok ? "text-gray-700" : "text-red-600")}
    >
      {value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value}
    </span>
  );
}

function ItemRow({
  item,
  baseline,
  editable,
  onEdit,
  onDelete,
  onVerify,
}: {
  item: BaselineItem;
  baseline: Baseline;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onVerify: () => void;
}) {
  const t = useTranslations("r156");
  const [open, setOpen] = useState(false);
  const hasDetails = !!(item.change_log || item.description || item.egnyte_folder_url);

  return (
    <>
      <tr className={cn("align-top", open && "bg-gray-50/60")}>
        <td className="px-3 py-3">
          <button
            onClick={() => setOpen(!open)}
            className={cn("flex items-start gap-1 text-left", !hasDetails && "cursor-default")}
          >
            {hasDetails ? (
              open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 text-gray-400" />
            ) : (
              <span className="w-3.5" />
            )}
            <span>
              <span className="font-medium text-gray-900">{item.ecu_name}</span>
              <span className="block font-mono text-xs text-gray-400">{item.eversum_part_number}</span>
              {item.supplier && <span className="block text-xs text-gray-400">{item.supplier}</span>}
            </span>
          </button>
        </td>
        <td className="px-3 py-3">
          <div className="font-mono text-xs font-medium">{item.sw_version}</div>
          {item.sw_file_name && <div className="text-xs text-gray-400">{item.sw_file_name}</div>}
          <Sha value={item.sw_file_sha256} ok={item.sha_valid} />
        </td>
        <td className="px-3 py-3">
          {item.sw_config_version || item.sw_config_sha256 ? (
            <>
              <div className="font-mono text-xs font-medium">{item.sw_config_version ?? "—"}</div>
              {item.sw_config_file_name && <div className="text-xs text-gray-400">{item.sw_config_file_name}</div>}
              <Sha value={item.sw_config_sha256} ok={item.sha_valid} />
            </>
          ) : (
            <span className="text-xs text-gray-300">N/A</span>
          )}
        </td>
        <td className="px-3 py-3 text-xs text-gray-600">{item.compatible_hardware ?? "—"}</td>
        <td className="px-3 py-3">
          {item.sha_valid ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-label={t("shaOk")} />
          ) : (
            <span title={t("shaMissing")}>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right">
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              title={t("readme")}
              onClick={() => readmeApi.download(baseline.id, item.id).catch(() => toast.error(t("readme")))}
            >
              <FileDown className="h-3.5 w-3.5" />
              {t("readme")}
            </Button>
            {baseline.status !== "draft" && (
              <Button variant="outline" size="sm" onClick={onVerify} title={t("verify")}>
                <FileSearch className="h-3.5 w-3.5" />
                {t("verify")}
              </Button>
            )}
            {editable && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title={t("editItem")}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </td>
      </tr>
      {open && hasDetails && (
        <tr className="bg-gray-50/60">
          <td />
          <td colSpan={5} className="space-y-2 px-3 pb-4 text-xs">
            {safeHref(item.egnyte_folder_url) && (
              <a
                href={safeHref(item.egnyte_folder_url)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("egnyte")}
              </a>
            )}
            {item.description && <p className="text-gray-600">{item.description}</p>}
            {item.change_log && (
              <div>
                <p className="mb-1 font-semibold uppercase tracking-wide text-gray-400">{t("changeLog")}</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border bg-white p-2 font-mono text-gray-700">
                  {item.change_log}
                </pre>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function RxswinDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("r156");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { canEdit, canRelease } = usePermissions();

  const { data: rx, isLoading } = useQuery<RxswinDetail>({
    queryKey: ["rxswin", id],
    queryFn: () => r156Api.rxswin(id),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: BaselineItem | null }>({ open: false, item: null });
  const [verifyItem, setVerifyItem] = useState<BaselineItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<BaselineItem | null>(null);
  const [confirm, setConfirm] = useState<"release" | "discard" | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newNotes, setNewNotes] = useState("");

  // Privzeto izberi odprt osnutek, sicer najnovejši baseline
  useEffect(() => {
    if (!rx) return;
    if (!selectedId || !rx.baselines.some((b) => b.id === selectedId)) {
      const draft = rx.baselines.find((b) => b.status === "draft");
      setSelectedId(draft?.id ?? rx.baselines[0]?.id ?? null);
    }
  }, [rx, selectedId]);

  const apply = (detail: RxswinDetail) => {
    qc.setQueryData(["rxswin", id], detail);
    qc.invalidateQueries({ queryKey: ["rxswins"] });
  };

  const createBaseline = useMutation({
    mutationFn: () => r156Api.createBaseline(id, newNotes),
    onSuccess: (d) => {
      apply(d);
      setSelectedId(d.baselines.find((b) => b.status === "draft")?.id ?? null);
      setNewOpen(false);
      setNewNotes("");
      toast.success(t("baselineCreated"));
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  const release = useMutation({
    mutationFn: (baselineId: string) => r156Api.releaseBaseline(baselineId),
    onSuccess: (d) => {
      apply(d);
      setConfirm(null);
      toast.success(t("released"));
    },
    onError: (e) => {
      setConfirm(null);
      toast.error(apiError(e, tc("error")));
    },
  });

  const discard = useMutation({
    mutationFn: (baselineId: string) => r156Api.discardBaseline(baselineId),
    onSuccess: (d) => {
      apply(d);
      setSelectedId(null);
      setConfirm(null);
      toast.success(t("discarded"));
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  const removeItem = useMutation({
    mutationFn: ({ baselineId, itemId }: { baselineId: string; itemId: string }) =>
      r156Api.deleteItem(baselineId, itemId),
    onSuccess: (d) => {
      apply(d);
      setDeleteItem(null);
      toast.success(t("itemDeleted"));
    },
    onError: (e) => toast.error(apiError(e, tc("error"))),
  });

  if (isLoading || !rx) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const baseline = rx.baselines.find((b) => b.id === selectedId) ?? null;
  const hasDraft = rx.baselines.some((b) => b.status === "draft");
  const currentReleased = rx.baselines.find((b) => b.status === "released");
  const editable = !!baseline && baseline.status === "draft" && canEdit;
  const releasable = !!baseline && baseline.items.length > 0 && baseline.items.every((i) => i.sha_valid);

  return (
    <div className="space-y-4">
      <Link href="/rxswins" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        {t("backToRegister")}
      </Link>

      {/* Glava RXSWIN */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-mono text-2xl font-bold text-gray-900">{rx.rxswin}</h2>
              <p className="text-sm text-gray-500">
                {rx.vehicle_type_name}
                {rx.regulations_affected.length > 0 && <> · {rx.regulations_affected.join(", ")}</>}
              </p>
              {rx.description && <p className="mt-2 max-w-2xl text-sm text-gray-700">{rx.description}</p>}
            </div>
          </div>
          {canEdit && rx.status === "active" && (
            <Button onClick={() => setNewOpen(true)} disabled={hasDraft} title={hasDraft ? t("draftInfo") : undefined}>
              <FilePlus2 className="h-4 w-4" />
              {t("newBaseline")}
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Časovnica baseline-ov */}
        <Card className="h-fit p-2">
          <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("baselines")}</p>
          {rx.baselines.length === 0 && <p className="px-2 py-3 text-sm text-gray-400">—</p>}
          <ul className="space-y-1">
            {rx.baselines.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => setSelectedId(b.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-1 rounded-lg px-3 py-2 text-left transition-colors",
                    b.id === selectedId ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-gray-50"
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{t("baseline", { number: b.baseline_number })}</span>
                    <BaselineStatusBadge status={b.status} />
                  </span>
                  <span className="text-xs text-gray-400">
                    {t("items", { count: b.items.length })} · {formatDateTime(b.released_at ?? b.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* Izbrani baseline */}
        {baseline ? (
          <Card className="overflow-hidden">
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3",
                baseline.status === "draft" && "bg-amber-50/60",
                baseline.status === "released" && "bg-green-50/60",
                baseline.status === "superseded" && "bg-gray-50"
              )}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">{t("baseline", { number: baseline.baseline_number })}</h3>
                  <BaselineStatusBadge status={baseline.status} />
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                  {baseline.status === "released" && <Lock className="h-3 w-3" />}
                  {baseline.status === "draft" && t("draftInfo")}
                  {baseline.status === "released" &&
                    t("readOnly", { date: formatDateTime(baseline.released_at), name: baseline.released_by_name ?? "—" })}
                  {baseline.status === "superseded" && t("supersededInfo")}
                  {baseline.created_by_name && <> · {t("createdBy", { name: baseline.created_by_name })}</>}
                </p>
              </div>
              {baseline.status === "draft" && canEdit && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirm("discard")}>
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("discard")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setItemDialog({ open: true, item: null })}>
                    <Plus className="h-3.5 w-3.5" />
                    {t("addItem")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setConfirm("release")}
                    disabled={!canRelease || !releasable}
                    title={!canRelease ? t("releaseRoleHint") : !releasable ? t("releaseBlocked") : undefined}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    {t("release")}
                  </Button>
                </div>
              )}
            </div>

            {baseline.notes && (
              <p className="border-b px-5 py-2 text-sm text-gray-600">{baseline.notes}</p>
            )}
            {baseline.status === "draft" && !releasable && baseline.items.length > 0 && (
              <p className="flex items-center gap-2 border-b bg-amber-50 px-5 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t("releaseBlocked")}
              </p>
            )}

            {baseline.items.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-gray-400">{t("noItems")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">{t("ecu")}</th>
                      <th className="px-3 py-2">{t("swVersion")} / {t("swSha")}</th>
                      <th className="px-3 py-2">{t("configVersion")} / SHA-256</th>
                      <th className="px-3 py-2">{t("compatibleHw")}</th>
                      <th className="px-3 py-2">SHA</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {baseline.items.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        baseline={baseline}
                        editable={editable}
                        onEdit={() => setItemDialog({ open: true, item })}
                        onDelete={() => setDeleteItem(item)}
                        onVerify={() => setVerifyItem(item)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : (
          <Card className="flex h-40 items-center justify-center text-sm text-gray-400">{t("noItems")}</Card>
        )}
      </div>

      {/* Dialogi */}
      {baseline && (
        <ItemDialog
          open={itemDialog.open}
          onClose={() => setItemDialog({ open: false, item: null })}
          rxswin={rx}
          baseline={baseline}
          item={itemDialog.item}
        />
      )}
      {baseline && verifyItem && (
        <VerifyDialog open onClose={() => setVerifyItem(null)} baseline={baseline} item={verifyItem} />
      )}
      {baseline && (
        <ConfirmDialog
          open={confirm === "release"}
          title={t("releaseConfirmTitle", { number: baseline.baseline_number })}
          text={
            currentReleased
              ? t("releaseConfirmText", { previous: currentReleased.baseline_number })
              : t("releaseConfirmTextFirst")
          }
          confirmLabel={t("release")}
          busy={release.isPending}
          onConfirm={() => release.mutate(baseline.id)}
          onClose={() => setConfirm(null)}
        />
      )}
      {baseline && (
        <ConfirmDialog
          open={confirm === "discard"}
          title={t("discard")}
          text={t("discardConfirm", { number: baseline.baseline_number })}
          confirmLabel={t("discard")}
          destructive
          busy={discard.isPending}
          onConfirm={() => discard.mutate(baseline.id)}
          onClose={() => setConfirm(null)}
        />
      )}
      {baseline && deleteItem && (
        <ConfirmDialog
          open
          title={tc("delete")}
          text={t("deleteItemConfirm", { ecu: deleteItem.ecu_name })}
          confirmLabel={tc("delete")}
          destructive
          busy={removeItem.isPending}
          onConfirm={() => removeItem.mutate({ baselineId: baseline.id, itemId: deleteItem.id })}
          onClose={() => setDeleteItem(null)}
        />
      )}
      <Dialog open={newOpen} onOpenChange={(o) => !o && setNewOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("newBaseline")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">{t("newBaselineHint")}</p>
          <Field label={t("baselineNotes")} className="mt-3">
            <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={3} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={() => createBaseline.mutate()} disabled={createBaseline.isPending}>
              {createBaseline.isPending && <Spinner className="h-3.5 w-3.5" />}
              {tc("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
