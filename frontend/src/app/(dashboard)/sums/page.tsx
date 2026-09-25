"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, FileCheck2, History, ShieldCheck, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";

interface Overview {
  counts: { rxswins: number; released_baselines: number; released_updates: number; vehicles: number };
  draft_baselines: { rxswin_id: string; rxswin: string; baseline_number: number; created_at: string }[];
  su_drafts: { id: string; document_id: string; revision: number; title: string; updated_at: string }[];
  pending_execution: { id: string; document_id: string; revision: number; title: string; pending: number }[];
  vehicles_without_eol: { id: string; vin: string; name: string }[];
  recent: { at: string; action: string; entity_type: string; label: string; user: string | null }[];
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </Card>
  );
}

function Todo({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const t = useTranslations("sums");
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b bg-gray-50/70 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className={count ? "rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-800" : "text-xs text-gray-400"}>
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-gray-400">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {t("nothing")}
        </p>
      ) : (
        <ul className="divide-y">{children}</ul>
      )}
    </Card>
  );
}

function Row({ href, main, sub }: { href: string; main: string; sub?: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50">
        <span className="flex-1">
          <span className="font-medium text-gray-900">{main}</span>
          {sub && <span className="ml-2 text-gray-500">{sub}</span>}
        </span>
        <ChevronRight className="h-4 w-4 text-gray-300" />
      </Link>
    </li>
  );
}

export default function SumsOverviewPage() {
  const t = useTranslations("sums");
  const { data, isLoading } = useQuery<Overview>({
    queryKey: ["sums-overview"],
    queryFn: () => api.get<Overview>("/sums-overview").then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{t("title")}</h2>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("rxswins")} value={data.counts.rxswins} icon={ShieldCheck} />
        <Stat label={t("releasedBaselines")} value={data.counts.released_baselines} icon={ShieldCheck} />
        <Stat label={t("releasedUpdates")} value={data.counts.released_updates} icon={FileCheck2} />
        <Stat label={t("vehicles")} value={data.counts.vehicles} icon={Truck} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Todo title={t("suDrafts")} count={data.su_drafts.length}>
          {data.su_drafts.map((d) => (
            <Row key={d.id} href={`/software-updates/${d.id}`} main={`${d.document_id} rev. ${d.revision}`} sub={d.title} />
          ))}
        </Todo>
        <Todo title={t("pendingExecution")} count={data.pending_execution.length}>
          {data.pending_execution.map((d) => (
            <Row
              key={d.id}
              href={`/software-updates/${d.id}`}
              main={`${d.document_id} rev. ${d.revision}`}
              sub={t("vehiclesPending", { n: d.pending })}
            />
          ))}
        </Todo>
        <Todo title={t("draftBaselines")} count={data.draft_baselines.length}>
          {data.draft_baselines.map((b) => (
            <Row key={`${b.rxswin_id}-${b.baseline_number}`} href={`/rxswins/${b.rxswin_id}`} main={b.rxswin} sub={`Baseline ${b.baseline_number}`} />
          ))}
        </Todo>
        <Todo title={t("noEol")} count={data.vehicles_without_eol.length}>
          {data.vehicles_without_eol.map((v) => (
            <Row key={v.id} href={`/fleet/${v.id}`} main={v.vin} sub={v.name} />
          ))}
        </Todo>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-gray-50/70 px-4 py-2.5">
          <History className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">{t("recent")}</h3>
        </div>
        {data.recent.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-400">—</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.recent.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2">
                <span className="w-36 text-xs text-gray-400">{formatDateTime(r.at)}</span>
                <span className="w-24 text-xs font-medium text-gray-600">{r.action}</span>
                <span className="text-gray-700">{r.label || r.entity_type}</span>
                <span className="ml-auto text-xs text-gray-400">{r.user ?? "system"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
