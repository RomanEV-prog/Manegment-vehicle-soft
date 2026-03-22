"use client";

import { Bell, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useAlarmsStore } from "@/hooks/useAlarms";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  const unreadCount = useAlarmsStore((s) => s.unreadCount);
  const connected = useAlarmsStore((s) => s.connected);
  const { user } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>

      <div className="flex items-center gap-4">
        {/* WS status */}
        <span
          title={connected ? "Živi alarmi: povezan" : "Živi alarmi: odklopljeno"}
          className={cn("flex items-center gap-1 text-xs", connected ? "text-green-600" : "text-gray-400")}
        >
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        </span>

        {/* Alarm bell */}
        <Link href="/alarms" className="relative">
          <Bell className="h-5 w-5 text-gray-500 hover:text-gray-900" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>

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
