"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { useAuth } from "@/hooks/useAuth";
import { useAlarmSocket, useAlarmsStore } from "@/hooks/useAlarms";
import { alarmsApi } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";

const PAGE_TITLES: Record<string, string> = {
  "/": "Pregled flote",
  "/vehicles": "Vozila",
  "/sw-updates": "SW posodobitve",
  "/dtc": "DTC napake",
  "/alarms": "Alarmi",
  "/reports": "Poročila",
  "/settings": "Nastavitve",
  "/audit": "Revizijska sled",
  "/obd": "OBD diagnostika",
};

function getTitle(pathname: string): string {
  if (pathname.startsWith("/vehicles/")) return "Podrobnosti vozila";
  return PAGE_TITLES[pathname] ?? "eVersum";
}

function AlarmSocketInit() {
  useAlarmSocket();
  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, payload, init } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const setAlarms = useAlarmsStore((s) => s.setAlarms);
  const initDone = useRef(false);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    init().then(() => {
      // After init, if still no user → redirect to login
      const state = useAuth.getState();
      if (!state.user && !state.payload) {
        router.replace("/login");
      }
    });
  }, [init, router]);

  // Redirect if tokens get cleared while on dashboard
  useEffect(() => {
    if (initDone.current && payload === null && !user) {
      router.replace("/login");
    }
  }, [payload, user, router]);

  // Load unread alarms on mount
  useEffect(() => {
    if (user) {
      alarmsApi
        .list({ is_read: "false" })
        .then((data: unknown) => setAlarms(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [user, setAlarms]);

  // Show spinner until init completes
  if (!initDone.current || (!user && payload === null)) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {user && <AlarmSocketInit />}
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={getTitle(pathname)} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
