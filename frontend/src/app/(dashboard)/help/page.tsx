"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocale, useTranslations } from "@/lib/i18n";
import { helpContent } from "@/lib/help-content";
import { cn } from "@/lib/utils";
import { TopicBody } from "@/components/help/help";

export default function HelpPage() {
  const t = useTranslations("help");
  const locale = useLocale();
  const content = helpContent(locale);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string>("");

  // odpri vodič iz povezave /help#tema
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setActive(hash);
      setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, []);

  const topics = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return content.topics;
    return content.topics.filter((tp) =>
      [tp.title, tp.summary, ...tp.steps, ...(tp.tips ?? [])].some((s) => s.toLowerCase().includes(needle))
    );
  }, [q, content.topics]);

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-3 lg:sticky lg:top-0 lg:h-fit">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
            <BookOpen className="h-5 w-5 text-blue-600" />
            {t("title")}
          </h2>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="pl-8" />
        </div>
        <nav className="flex flex-col gap-0.5">
          {topics.map((tp) => (
            <a
              key={tp.id}
              href={`#${tp.id}`}
              onClick={() => setActive(tp.id)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm",
                active === tp.id ? "bg-blue-50 font-medium text-blue-700" : "text-gray-600 hover:bg-gray-50"
              )}
            >
              {tp.title}
            </a>
          ))}
        </nav>
      </aside>

      <div className="space-y-4">
        {topics.length === 0 && <p className="text-sm text-gray-400">{t("noResults")}</p>}
        {topics.map((tp) => (
          <Card key={tp.id} id={tp.id} className={cn("scroll-mt-4 p-5", active === tp.id && "ring-2 ring-blue-200")}>
            <h3 className="mb-2 text-base font-semibold text-gray-900">{tp.title}</h3>
            <TopicBody topic={tp} />
          </Card>
        ))}
      </div>
    </div>
  );
}
