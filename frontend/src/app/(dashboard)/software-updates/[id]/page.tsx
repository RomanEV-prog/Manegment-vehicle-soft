"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileDown,
  FilePlus2,
  Lock,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { suApi } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import type { SuDetail, SuEditable, SuTarget } from "@/types/r156";
import { apiError, BaselineStatusBadge, ConfirmDialog, Field, Textarea, usePermissions } from "@/components/r156/shared";
import {
  AddRxswinDialog,
  AddTargetsDialog,
  NotificationDialog,
  Section,
  SuStatusBadge,
  VvBadge,
  VvSignDialog,
  YesNo,
} from "@/components/r156/su";

const EDITABLE_KEYS: (keyof SuEditable)[] = [
  "title", "description_purpose", "dependencies_identified", "system_schemes_baseline",
  "type_approval_update_necessary", "type_approval_justification", "unece_affected_requirements",
  "type_approval_granted", "type_approval_number", "type_approval_date", "user_notification_required",
  "execution_conditions", "safe_state_conditions", "new_hardware_required", "safety_security_confirmation",
  "erp_work_order", "erp_work_order_url", "egnyte_folder_url",
];

function pick(d: SuDetail): SuEditable {
  const out = {} as Record<string, unknown>;
  for (const k of EDITABLE_KEYS) out[k] = d[k];
  return out as unknown as SuEditable;
}

function ReadText({ value }: { value: string | null | undefined }) {
  return value ? <p className="whitespace-pre-wrap text-sm text-gray-800">{value}</p> : <p className="text-sm text-gray-300">—</p>;
}

function TargetRow({ doc, target, editable, canRecord }: { doc: SuDetail; target: SuTarget; editable: boolean; canRecord: boolean }) {
  const t = useTranslations("su");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [notes, setNotes] = useState(target.compatibility_notes ?? "");
  useEffect(() => setNotes(target.compatibility_notes ?? ""), [target.compatibility_notes]);

  const apply = (d: SuDetail) => qc.setQueryData(["software-update", doc.id], d);
  const onErr = (e: unknown) => toast.error(apiError(e, tc("error")));
  const compat = useMutation({
    mutationFn: (confirmed: boolean) =>
      suApi.setCompatibility(doc.id, target.id, { compatibility_confirmed: confirmed, compatibility_notes: notes.trim() || null }),
    onSuccess: apply,
    onError: onErr,
  });
  const remove = useMutation({ mutationFn: () => suApi.removeTarget(doc.id, target.id), onSuccess: apply, onError: onErr });
  const result = useMutation({
    mutationFn: (r: "success" | "failed" | "rolled_back") => suApi.recordResult(doc.id, target.id, r),
    onSuccess: apply,
    onError: onErr,
  });

  return (
    <tr className="align-top">
      <td className="px-3 py-2.5">
        <div className="font-mono text-sm font-medium">{target.vin}</div>
        <div className="text-xs text-gray-400">{target.vehicle_name}</div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {target.compatibility_confirmed ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("confirmedBy", { name: target.confirmed_by_name ?? "—", date: formatDateTime(target.confirmed_at) })}
            </span>
          ) : (
            <span className="text-xs text-amber-600">{t("pending")}</span>
          )}
          {editable && (
            <Button size="sm" variant="outline" className="h-7" disabled={compat.isPending} onClick={() => compat.mutate(!target.compatibility_confirmed)}>
              {target.compatibility_confirmed ? t("unconfirm") : t("confirm")}
            </Button>
          )}
        </div>
        {editable ? (
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (target.compatibility_notes ?? "") && compat.mutate(target.compatibility_confirmed)}
            placeholder={t("compatNotes")}
            className="mt-1.5 h-7 text-xs"
          />
        ) : (
          target.compatibility_notes && <p className="mt-1 text-xs text-gray-500">{target.compatibility_notes}</p>
        )}
      </td>
      <td className="px-3 py-2.5">
        {target.result ? (
          <div>
            <span
              className={cn(
                "text-xs font-semibold",
                target.result === "success" ? "text-green-700" : target.result === "failed" ? "text-red-600" : "text-amber-700"
              )}
            >
              {t(`result_${target.result}`)}
            </span>
            <div className="text-xs text-gray-400">
              {target.applied_by_name}, {formatDateTime(target.applied_at)}
            </div>
          </div>
        ) : doc.status === "released" && canRecord ? (
          <div className="flex flex-wrap gap-1">
            {(["success", "failed", "rolled_back"] as const).map((r) => (
              <Button key={r} size="sm" variant="outline" className="h-7 text-xs" disabled={result.isPending} onClick={() => result.mutate(r)}>
                {t(`result_${r}`)}
              </Button>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gray-300">{doc.status === "draft" ? "—" : t("pending")}</span>
        )}
      </td>
      <td className="px-2 py-2.5 text-right">
        {editable && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-500" onClick={() => remove.mutate()}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </td>
    </tr>
  );
}

export default function SoftwareUpdateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations("su");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { canEdit, canRelease } = usePermissions();

  const { data: doc, isLoading } = useQuery<SuDetail>({
    queryKey: ["software-update", id],
    queryFn: () => suApi.get(id),
  });

  const [form, setForm] = useState<SuEditable | null>(null);
  const [dialog, setDialog] = useState<null | "rxswin" | "targets" | "vv" | "notify" | "release" | "revise" | "discard">(null);

  // obrazec se ponastavi ob menjavi dokumenta ali po shranjevanju (updated_at)
  useEffect(() => {
    if (doc) setForm(pick(doc));
  }, [doc?.id, doc?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const changes = useMemo(() => {
    if (!doc || !form) return {};
    const out: Partial<SuEditable> = {};
    for (const k of EDITABLE_KEYS) {
      if (JSON.stringify(form[k]) !== JSON.stringify(doc[k])) (out as Record<string, unknown>)[k] = form[k];
    }
    return out;
  }, [doc, form]);
  const dirty = Object.keys(changes).length > 0;

  const apply = (d: SuDetail) => {
    qc.setQueryData(["software-update", d.id], d);
    qc.invalidateQueries({ queryKey: ["software-updates"] });
  };
  const onErr = (e: unknown) => toast.error(apiError(e, tc("error")));

  const save = useMutation({
    mutationFn: () => suApi.update(id, changes),
    onSuccess: (d) => {
      apply(d);
      toast.success(t("saved"));
    },
    onError: onErr,
  });
  const release = useMutation({
    mutationFn: () => suApi.release(id),
    onSuccess: (d) => {
      apply(d);
      setDialog(null);
      toast.success(t("released"));
    },
    onError: (e) => {
      setDialog(null);
      onErr(e);
    },
  });
  const revise = useMutation({
    mutationFn: () => suApi.revise(id),
    onSuccess: (d) => {
      apply(d);
      setDialog(null);
      toast.success(t("revised"));
      router.push(`/software-updates/${d.id}`);
    },
    onError: onErr,
  });
  const discard = useMutation({
    mutationFn: () => suApi.discard(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["software-updates"] });
      router.push("/software-updates");
    },
    onError: onErr,
  });
  const removeRx = useMutation({ mutationFn: (linkId: string) => suApi.removeRxswin(id, linkId), onSuccess: apply, onError: onErr });

  if (isLoading || !doc || !form) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const editable = doc.status === "draft" && canEdit;
  const set = <K extends keyof SuEditable>(k: K, v: SuEditable[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const text = (k: keyof SuEditable, rows = 3, placeholder?: string) =>
    editable ? (
      <Textarea rows={rows} value={(form[k] as string | null) ?? ""} onChange={(e) => set(k, (e.target.value || null) as never)} placeholder={placeholder} />
    ) : (
      <ReadText value={form[k] as string | null} />
    );
  const line = (k: keyof SuEditable, placeholder?: string, type = "text") =>
    editable ? (
      <Input type={type} value={(form[k] as string | null) ?? ""} onChange={(e) => set(k, (e.target.value || null) as never)} placeholder={placeholder} />
    ) : (
      <ReadText value={type === "date" ? formatDate(form[k] as string | null) : (form[k] as string | null)} />
    );
  const blockerText = (code: string) => {
    const [key, arg] = code.split(":");
    return t(`blocker_${key}`, arg ? { arg } : undefined);
  };
  const latest = doc.revisions[0];

  return (
    <div className="space-y-4 pb-16">
      <Link href="/software-updates" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Link>

      {/* Glava */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-gray-500">
                {doc.document_id} · {t("rev", { n: doc.revision })}
              </span>
              <SuStatusBadge status={doc.status} />
            </div>
            {editable ? (
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} className="mt-2 h-10 max-w-xl text-lg font-semibold" />
            ) : (
              <h2 className="mt-1 text-2xl font-bold text-gray-900">{doc.title}</h2>
            )}
            <p className="mt-1 text-sm text-gray-500">
              {doc.vehicle_type_name}
              {doc.status === "released" && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  {t("readOnly", { date: formatDateTime(doc.released_at), name: doc.released_by_name ?? "—" })}
                </span>
              )}
            </p>
            {doc.revisions.length > 1 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-gray-400">{t("revisions")}:</span>
                {doc.revisions.map((r) => (
                  <Link
                    key={r.id}
                    href={`/software-updates/${r.id}`}
                    className={cn(
                      "rounded-full border px-2 py-0.5",
                      r.id === doc.id ? "border-blue-300 bg-blue-50 text-blue-800" : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {t("rev", { n: r.revision })} · {t(`status_${r.status}`)}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => suApi.downloadReport(doc.id).catch(onErr)}>
              <FileDown className="h-3.5 w-3.5" />
              {t("pdf")}
            </Button>
            {doc.status === "draft" && canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={() => setDialog("discard")}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("discard")}
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => setDialog("release")}
                  disabled={!canRelease || dirty || doc.release_blockers.length > 0}
                  title={!canRelease ? t("vvRoleHint") : dirty ? t("unsaved") : undefined}
                >
                  <Lock className="h-3.5 w-3.5" />
                  {t("release")}
                </Button>
              </>
            )}
            {doc.status === "released" && canEdit && !doc.superseded_by_id && (
              <Button size="sm" onClick={() => setDialog("revise")} disabled={latest?.status === "draft"}>
                <FilePlus2 className="h-3.5 w-3.5" />
                {t("revise")}
              </Button>
            )}
            {doc.status === "superseded" && latest && latest.id !== doc.id && (
              <Button size="sm" variant="outline" onClick={() => router.push(`/software-updates/${latest.id}`)}>
                {t("openLatest")}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Pogoji za izdajo */}
      {doc.status === "draft" &&
        (doc.release_blockers.length > 0 ? (
          <Card className="border-amber-200 bg-amber-50/60 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              {t("blockersTitle")}
            </p>
            <ul className="grid gap-x-6 gap-y-1 text-sm text-amber-900 sm:grid-cols-2">
              {doc.release_blockers.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                  {blockerText(b)}
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="flex items-center gap-2 border-green-200 bg-green-50/60 p-4 text-sm font-medium text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            {t("readyToRelease")}
          </Card>
        ))}

      {/* 1. Namen */}
      <Section title={t("s1")} refText={t("s1ref")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={`${t("purpose")} *`} className="md:col-span-2">
            {text("description_purpose", 3)}
          </Field>
          <Field label={t("dependencies")}>{text("dependencies_identified", 3)}</Field>
          <div className="space-y-4">
            <Field label={t("systemSchemes")}>{line("system_schemes_baseline", "SSB-ES03-12")}</Field>
            <Field label={t("newHardware")}>
              <YesNo value={form.new_hardware_required} onChange={(v) => set("new_hardware_required", !!v)} disabled={!editable} allowUnset={false} />
            </Field>
          </div>
        </div>
      </Section>

      {/* 2. RXSWIN */}
      <Section
        title={t("s2")}
        refText={t("s2ref")}
        actions={
          editable && (
            <Button size="sm" variant="outline" onClick={() => setDialog("rxswin")}>
              <Plus className="h-3.5 w-3.5" />
              {t("addRxswin")}
            </Button>
          )
        }
      >
        {doc.affected_rxswins.length === 0 ? (
          <p className="text-sm text-gray-400">{t("noAffected")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="pb-2">RXSWIN</th>
                <th className="pb-2">{t("baselineBefore")}</th>
                <th className="pb-2">{t("baselineAfter")}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {doc.affected_rxswins.map((a) => (
                <tr key={a.id}>
                  <td className="py-2">
                    <Link href={`/rxswins/${a.rxswin_id}`} className="font-mono font-semibold text-blue-700 hover:underline">
                      {a.rxswin}
                    </Link>
                  </td>
                  <td className="py-2 text-gray-600">{a.baseline_before_number ?? "—"}</td>
                  <td className="py-2">
                    <span className="mr-2 font-medium">{a.baseline_after_number ?? "—"}</span>
                    {a.baseline_after_status && <BaselineStatusBadge status={a.baseline_after_status} />}
                  </td>
                  <td className="py-2 text-right">
                    {editable && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-500" onClick={() => removeRx.mutate(a.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 3. V&V */}
      <Section
        title={t("s3")}
        refText={t("s3ref")}
        actions={
          doc.status === "draft" &&
          canRelease && (
            <Button size="sm" variant="outline" onClick={() => setDialog("vv")}>
              {t("vvSign")}
            </Button>
          )
        }
      >
        <div className="flex flex-wrap items-start gap-6">
          <VvBadge status={doc.vv_status} />
          <div className="min-w-0 flex-1">
            <ReadText value={doc.vv_method} />
            {doc.vv_signed_by_name && (
              <p className="mt-1 text-xs text-gray-400">{t("vvSigned", { name: doc.vv_signed_by_name, date: formatDateTime(doc.vv_signed_at) })}</p>
            )}
            {doc.status === "draft" && !canRelease && <p className="mt-1 text-xs text-gray-400">{t("vvRoleHint")}</p>}
          </div>
        </div>
      </Section>

      {/* 4. Homologacija */}
      <Section title={t("s4")} refText={t("s4ref")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("taNecessary")}>
            <YesNo value={form.type_approval_update_necessary} onChange={(v) => set("type_approval_update_necessary", v)} disabled={!editable} />
          </Field>
          <Field label={t("taRequirements")} hint={editable ? t("taRequirementsHint") : undefined}>
            {editable ? (
              <Input
                value={form.unece_affected_requirements.join(", ")}
                onChange={(e) => set("unece_affected_requirements", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              />
            ) : (
              <ReadText value={form.unece_affected_requirements.join(", ")} />
            )}
          </Field>
          <Field label={t("taJustification")} className="md:col-span-2">
            {text("type_approval_justification", 2)}
          </Field>
          {form.type_approval_update_necessary && (
            <>
              <Field label={t("taGranted")}>
                <YesNo value={form.type_approval_granted} onChange={(v) => set("type_approval_granted", v)} disabled={!editable} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("taNumber")}>{line("type_approval_number", "E1*156R00/00*0001")}</Field>
                <Field label={t("taDate")}>{line("type_approval_date", undefined, "date")}</Field>
              </div>
            </>
          )}
        </div>
      </Section>

      {/* 5. Izvedba in varnost */}
      <Section title={t("s5")} refText={t("s5ref")}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={`${t("executionConditions")} *`}>{text("execution_conditions", 4)}</Field>
          <Field label={`${t("safeState")} *`}>{text("safe_state_conditions", 4)}</Field>
          <Field label={`${t("safetyConfirmation")} *`}>{text("safety_security_confirmation", 4)}</Field>
        </div>
      </Section>

      {/* 6. Obvestilo */}
      <Section
        title={t("s6")}
        refText={t("s6ref")}
        actions={
          doc.status !== "superseded" &&
          canEdit && (
            <Button size="sm" variant="outline" onClick={() => setDialog("notify")}>
              {t("recordNotification")}
            </Button>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-6">
          <Field label={t("notificationRequired")}>
            <YesNo value={form.user_notification_required} onChange={(v) => set("user_notification_required", !!v)} disabled={!editable} allowUnset={false} />
          </Field>
          <p className="text-sm text-gray-700">
            {doc.user_notified_at
              ? t("notified", {
                  date: formatDateTime(doc.user_notified_at),
                  name: doc.user_notified_by_name ?? "—",
                  method: doc.user_notification_method ?? "",
                })
              : t("notNotified")}
          </p>
        </div>
      </Section>

      {/* 7. Ciljna vozila */}
      <Section
        title={t("s7")}
        refText={t("s7ref")}
        actions={
          editable && (
            <Button size="sm" variant="outline" onClick={() => setDialog("targets")}>
              <Plus className="h-3.5 w-3.5" />
              {t("addTargets")}
            </Button>
          )
        }
      >
        {doc.targets.length === 0 ? (
          <p className="text-sm text-gray-400">{t("noTargets")}</p>
        ) : (
          <div className="-mx-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-3 pb-2">VIN</th>
                  <th className="px-3 pb-2">{t("compatibility")}</th>
                  <th className="px-3 pb-2">{t("result")}</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {doc.targets.map((tg) => (
                  <TargetRow key={tg.id} doc={doc} target={tg} editable={editable} canRecord={canEdit} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 8. Povezave */}
      <Section title={t("s8")}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("erpWorkOrder")}>{line("erp_work_order", "WO-2026-0142")}</Field>
          <Field label={t("erpWorkOrderUrl")}>
            {editable ? line("erp_work_order_url", "https://") : doc.erp_work_order_url ? (
              <a href={doc.erp_work_order_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> ERP
              </a>
            ) : (
              <ReadText value={null} />
            )}
          </Field>
          <Field label={t("egnyte")}>
            {editable ? line("egnyte_folder_url", "https://evision.egnyte.com/...") : doc.egnyte_folder_url ? (
              <a href={doc.egnyte_folder_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Egnyte
              </a>
            ) : (
              <ReadText value={null} />
            )}
          </Field>
        </div>
      </Section>

      {/* Lepljiva vrstica za shranjevanje */}
      {editable && dirty && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-white px-4 py-2 shadow-lg">
          <span className="text-sm text-gray-600">{t("unsaved")}</span>
          <Button size="sm" variant="ghost" onClick={() => setForm(pick(doc))}>
            {tc("cancel")}
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {t("save")}
          </Button>
        </div>
      )}

      {/* Dialogi */}
      <AddRxswinDialog open={dialog === "rxswin"} onClose={() => setDialog(null)} doc={doc} />
      <AddTargetsDialog open={dialog === "targets"} onClose={() => setDialog(null)} doc={doc} />
      <VvSignDialog open={dialog === "vv"} onClose={() => setDialog(null)} doc={doc} />
      <NotificationDialog open={dialog === "notify"} onClose={() => setDialog(null)} doc={doc} />
      <ConfirmDialog
        open={dialog === "release"}
        title={t("releaseTitle", { doc: doc.document_id, n: doc.revision })}
        text={t("releaseText")}
        confirmLabel={t("release")}
        busy={release.isPending}
        onConfirm={() => release.mutate()}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "revise"}
        title={t("revise")}
        text={t("reviseText", { n: doc.revision + 1 })}
        confirmLabel={t("revise")}
        busy={revise.isPending}
        onConfirm={() => revise.mutate()}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "discard"}
        title={t("discard")}
        text={t("discardText")}
        confirmLabel={t("discard")}
        destructive
        busy={discard.isPending}
        onConfirm={() => discard.mutate()}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
