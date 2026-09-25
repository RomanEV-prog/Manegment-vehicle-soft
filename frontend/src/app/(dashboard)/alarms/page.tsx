"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { alarmsApi } from "@/lib/api";
import { useAlarmsStore } from "@/hooks/useAlarms";
import { severityColor, timeAgo } from "@/lib/utils";
import { Bell, CheckCheck, Wifi, WifiOff } from "lucide-react";
import type { AlarmEvent } from "@/types";
import toast from "react-hot-toast";
import { useTranslations } from "@/lib/i18n";

const SEVERITY_ICONS: Record<string, string> = {
  critical: "🔴",
  warning: "🟠",
  info: "🔵",
  success: "🟢",
};

export default function AlarmsPage() {
  const { alarms, setAlarms, markRead, markAllRead, connected, unreadCount } =
    useAlarmsStore();
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [readFilter, setReadFilter] = useState<string>("");
  const t = useTranslations("alarms");

  const { data, isLoading } = useQuery<AlarmEvent[]>({
    queryKey: ["alarms", severityFilter, readFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (severityFilter) params.severity = severityFilter;
      if (readFilter !== "") params.is_read = readFilter;
      return alarmsApi.list(Object.keys(params).length ? params : undefined);
    },
  });

  useEffect(() => {
    if (data) setAlarms(data);
  }, [data, setAlarms]);

  const markReadMutation = useMutation({
    mutationFn: (id: string) => alarmsApi.markRead(id),
    onSuccess: (_, id) => {
      markRead(id);
      queryClient.invalidateQueries({ queryKey: ["alarms"] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => alarmsApi.markAllRead(),
    onSuccess: () => {
      markAllRead();
      queryClient.invalidateQueries({ queryKey: ["alarms"] });
      toast.success(t("markAllSuccess"));
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("title")}</h2>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
            <span className={`flex items-center gap-1 ${connected ? "text-green-600" : "text-gray-400"}`}>
              {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {connected ? t("connected") : t("disconnected")}
            </span>
            {unreadCount > 0 && (
              <span className="text-red-600 font-medium">{t("unread", { count: unreadCount })}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
          >
            <option value="">{t("allSeverity")}</option>
            <option value="critical">{t("severityCritical")}</option>
            <option value="warning">{t("severityWarning")}</option>
            <option value="info">{t("severityInfo")}</option>
            <option value="success">{t("severitySuccess")}</option>
          </select>
          <select
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
          >
            <option value="">{t("allAlarms")}</option>
            <option value="false">{t("unreadOnly")}</option>
            <option value="true">{t("readOnly")}</option>
          </select>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
            >
              <CheckCheck className="mr-2 h-4 w-4" />
              {t("markAllRead")}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : alarms.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
          <Bell className="h-10 w-10" />
          <p>{t("noAlarms")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alarms.map((alarm) => (
            <Card
              key={alarm.id}
              className={`transition-all ${
                !alarm.is_read ? "border-l-4 border-l-blue-500 bg-blue-50/30" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <span className="mt-0.5 text-lg">
                      {SEVERITY_ICONS[alarm.severity] ?? "⚪"}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-semibold ${!alarm.is_read ? "text-gray-900" : "text-gray-600"}`}>
                          {alarm.title}
                        </p>
                        <span className={`rounded px-1.5 py-0.5 text-xs border ${severityColor(alarm.severity)}`}>
                          {alarm.severity}
                        </span>
                        <Badge variant="muted" className="text-xs">{alarm.alarm_type}</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-gray-600">{alarm.message}</p>
                      <p className="mt-1 text-xs text-gray-400">{timeAgo(alarm.created_at)}</p>
                      {alarm.delivered_via.length > 0 && (
                        <div className="mt-1 flex gap-1">
                          {alarm.delivered_via.map((ch) => (
                            <span key={ch} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                              {ch}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {!alarm.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-gray-500"
                      onClick={() => markReadMutation.mutate(alarm.id)}
                    >
                      {t("markRead")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
