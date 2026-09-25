"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, BookOpen, CheckCircle2, ChevronDown, ChevronUp, Circle, HelpCircle, Lightbulb, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Card } from "@/components/ui/card";
import { useLocale, useTranslations } from "@/lib/i18n";
import { helpContent, topicForPath, type HelpTopic } from "@/lib/help-content";
import { cn } from "@/lib/utils";

// **besedilo** → krepko (imena gumbov v navodilih)
export function HelpText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") ? (
          <strong key={i} className="font-semibold text-gray-900">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export function TopicBody({ topic, compact }: { topic: HelpTopic; compact?: boolean }) {
  const t = useTranslations("help");
  return (
    <div className="space-y-3 text-sm text-gray-700">
      <p className="text-gray-600">{topic.summary}</p>
      {topic.ref && <p className="text-xs text-gray-400">UN R156 {topic.ref}</p>}
      <ol className="space-y-2">
        {topic.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
              {i + 1}
            </span>
            <span>
              <HelpText text={s} />
            </span>
          </li>
        ))}
      </ol>
      {topic.tips && topic.tips.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <Lightbulb className="h-3.5 w-3.5" />
            {t("tips")}
          </p>
          <ul className="space-y-1 text-xs text-amber-900">
            {topic.tips.map((tip, i) => (
              <li key={i}>
                <HelpText text={tip} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {!compact && topic.route && (
        <Link href={topic.route} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
          {t("openPage")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

// Gumb "?" v zgornji vrstici — navodila za trenutno stran v stranski plošči
export function HelpButton() {
  const t = useTranslations("help");
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const content = helpContent(locale);
  const topic = content.topics.find((x) => x.id === topicForPath(pathname)) ?? content.topics[0];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          title={t("pageHelp")}
          aria-label={t("pageHelp")}
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20" />
        <DialogPrimitive.Content className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l bg-white shadow-xl focus:outline-none">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <BookOpen className="h-4 w-4 text-blue-600" />
              {topic.title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <TopicBody topic={topic} compact />
          </div>
          <div className="border-t px-5 py-3">
            <Link href={`/help#${topic.id}`} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
              {t("allGuides")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// Čarovnik "Prvi koraki" na pregledni strani
const DISMISS_KEY = "sums-setup-collapsed";

export function SetupChecklist({ setup }: { setup: Record<string, number> }) {
  const t = useTranslations("help");
  const locale = useLocale();
  const content = helpContent(locale);
  const done = content.setup.filter((s) => (setup[s.key] ?? 0) > 0).length;
  const total = content.setup.length;
  const complete = done === total;
  const [collapsed, setCollapsed] = useState(false);

  // stanje strnjenosti je le udobje — shranjeno v brskalniku, če je na voljo
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(DISMISS_KEY) === "1" || complete);
    } catch {
      setCollapsed(complete);
    }
  }, [complete]);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, next ? "1" : "0");
    } catch {
      /* brez localStorage */
    }
  };
  const nextStep = content.setup.find((s) => (setup[s.key] ?? 0) === 0);

  return (
    <Card className="overflow-hidden">
      <button onClick={toggle} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-gray-50/60">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{content.setupTitle}</p>
          <p className="text-xs text-gray-500">{complete ? content.setupDone : content.setupIntro}</p>
        </div>
        <div className="hidden w-40 sm:block">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <p className="mt-1 text-right text-xs text-gray-400">{t("progress", { done, total })}</p>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
      </button>
      {!collapsed && (
        <ol className="grid gap-px border-t bg-gray-100 sm:grid-cols-2">
          {content.setup.map((s, i) => {
            const ok = (setup[s.key] ?? 0) > 0;
            const isNext = s === nextStep;
            return (
              <li key={s.key} className={cn("flex items-start gap-3 bg-white px-5 py-3", isNext && "bg-blue-50/60")}>
                {ok ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
                ) : (
                  <Circle className={cn("mt-0.5 h-5 w-5 flex-shrink-0", isNext ? "text-blue-500" : "text-gray-300")} />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", ok ? "text-gray-500" : "text-gray-900")}>
                    {i + 1}. {s.title}
                  </p>
                  <p className="text-xs text-gray-500">{s.hint}</p>
                  {!ok && (
                    <div className="mt-1.5 flex gap-3 text-xs">
                      <Link href={s.route} className="font-medium text-blue-600 hover:underline">
                        {t("goThere")}
                      </Link>
                      <Link href={`/help#${s.topic}`} className="text-gray-500 hover:text-gray-800 hover:underline">
                        {t("howTo")}
                      </Link>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

