"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Car,
  AlertTriangle,
  FileText,
  Bell,
  BarChart3,
  Cpu,
  Home,
  Settings,
  LogOut,
  ClipboardList,
  Plug,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useAlarmsStore } from "@/hooks/useAlarms";
import { useRouter } from "next/navigation";

const ALL_NAV_ITEMS = [
  { href: "/", label: "Pregled", icon: Home, partnerVisible: true },
  { href: "/vehicles", label: "Vozila", icon: Car, partnerVisible: true },
  { href: "/sw-updates", label: "SW posodobitve", icon: Cpu, partnerVisible: false },
  { href: "/dtc", label: "DTC napake", icon: AlertTriangle, partnerVisible: false },
  { href: "/obd", label: "OBD diagnostika", icon: Plug, partnerVisible: false },
  { href: "/alarms", label: "Alarmi", icon: Bell, showBadge: true, partnerVisible: false },
  { href: "/reports", label: "Poročila", icon: FileText, partnerVisible: true },
  { href: "/audit", label: "Revizijska sled", icon: ClipboardList, partnerVisible: false },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const unreadCount = useAlarmsStore((s) => s.unreadCount);
  const router = useRouter();
  const isPartner = user?.role === "partner_viewer";
  const navItems = isPartner
    ? ALL_NAV_ITEMS.filter((item) => item.partnerVisible)
    : ALL_NAV_ITEMS;

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <BarChart3 className="mr-2 h-6 w-6 text-blue-600" />
        <span className="text-lg font-bold text-gray-900">eVersum</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map(({ href, label, icon: Icon, showBadge }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon className="mr-3 h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {showBadge && unreadCount > 0 && (
                <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Partner badge */}
      {isPartner && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Eye className="h-3 w-3 flex-shrink-0" />
          <span className="font-medium">Partner — samo branje</span>
        </div>
      )}

      {/* Footer */}
      <div className="border-t p-3 space-y-1">
        <Link
          href="/settings"
          className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        >
          <Settings className="mr-3 h-4 w-4" />
          Nastavitve
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        >
          <LogOut className="mr-3 h-4 w-4" />
          Odjava
        </button>
      </div>
    </aside>
  );
}
