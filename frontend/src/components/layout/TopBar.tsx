"use client";

import { Bell, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useAlarmsStore } from "@/hooks/useAlarms";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useTranslations, useLocale } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { moduleEnabled } from "@/lib/modules";

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  const unreadCount = useAlarmsStore((s) => s.unreadCount);
  const connected = useAlarmsStore((s) => s.connected);
  const { user } = useAuth();
  const t = useTranslations("topbar");
  const tLang = useTranslations("lang");
  const locale = useLocale();
  const router = useRouter();
  const alarmsOn = moduleEnabled("alarms");

  const switchLocale = (newLocale: string) => {
    Cookies.set("NEXT_LOCALE", newLocale, { expires: 365, path: "/" });
    router.refresh();
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>

      <div className="flex items-center gap-4">
        {/* WS status */}
        {alarmsOn && (
        <span
          title={connected ? t("wsConnected") : t("wsDisconnected")}
          className={cn("flex items-center gap-1 text-xs", connected ? "text-green-600" : "text-gray-400")}
        >
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        </span>
        )}

        {/* Language switcher */}
        <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 p-0.5">
          <button
            onClick={() => switchLocale("sl")}
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
              locale === "sl"
                ? "bg-white shadow text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {tLang("sl")}
          </button>
          <button
            onClick={() => switchLocale("en")}
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
              locale === "en"
                ? "bg-white shadow text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {tLang("en")}
          </button>
        </div>

        {/* Alarm bell */}
        {alarmsOn && (
        <Link href="/alarms" className="relative">
          <Bell className="h-5 w-5 text-gray-500 hover:text-gray-900" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
        )}

        {/* User */}
        {user && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700">
              {user.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
              <p className="text-xs text-gray-500">{user.role}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
