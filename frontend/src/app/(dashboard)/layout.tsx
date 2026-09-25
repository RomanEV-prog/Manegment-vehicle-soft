"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { useAuth } from "@/hooks/useAuth";
import { useAlarmSocket, useAlarmsStore } from "@/hooks/useAlarms";
import { alarmsApi } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/lib/i18n";
import { moduleEnabled } from "@/lib/modules";

function AlarmSocketInit() {
  useAlarmSocket();
  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, payload, init } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const setAlarms = useAlarmsStore((s) => s.setAlarms);
  const initStarted = useRef(false);
  // true šele, ko init (vključno z obnovo seje iz httpOnly piškota) res konča
  const [ready, setReady] = useState(false);
  const t = useTranslations("nav");
  const alarmsOn = moduleEnabled("alarms");

  const PAGE_TITLES: Record<string, string> = {
    "/": t("overview"),
    "/vehicles": t("vehicles"),
    "/sw-updates": t("swUpdates"),
    "/dtc": t("dtc"),
    "/alarms": t("alarms"),
    "/reports": t("reports"),
    "/settings": t("settings"),
    "/audit": t("audit"),
    "/obd": t("obd"),
    "/rxswins": t("rxswins"),
    "/ecus": t("ecus"),
    "/sha256": t("sha256"),
    "/software-updates": t("softwareUpdates"),
    "/fleet": t("fleet"),
    "/sums": t("sumsOverview"),
    "/help": t("help"),
  };

  function getTitle(pathname: string): string {
    if (pathname.startsWith("/vehicles/")) return t("vehicles");
    if (pathname.startsWith("/rxswins/")) return t("rxswins");
    if (pathname.startsWith("/software-updates/")) return t("softwareUpdates");
    if (pathname.startsWith("/fleet/")) return t("fleet");
    return PAGE_TITLES[pathname] ?? "eVersum";
  }

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;
    init().then(() => {
      // After init, if still no user → redirect to login
      const state = useAuth.getState();
      if (!state.user && !state.payload) {
        router.replace("/login");
      }
      setReady(true);
    });
  }, [init, router]);

  // Redirect if tokens get cleared while on dashboard
  useEffect(() => {
    if (ready && payload === null && !user) {
      router.replace("/login");
    }
  }, [ready, payload, user, router]);

  // Load unread alarms on mount
  useEffect(() => {
    if (user && alarmsOn) {
      alarmsApi
        .list({ is_read: "false" })
        .then((data: unknown) => setAlarms(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [user, setAlarms, alarmsOn]);

  // Show spinner until init completes
  if (!ready || (!user && payload === null)) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {user && alarmsOn && <AlarmSocketInit />}
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={getTitle(pathname)} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
