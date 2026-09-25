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
  ShieldCheck,
  CircuitBoard,
  Hash,
  FileCheck2,
  Truck,
  LayoutDashboard,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useAlarmsStore } from "@/hooks/useAlarms";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { moduleEnabled, type ModuleKey } from "@/lib/modules";

export function Sidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const unreadCount = useAlarmsStore((s) => s.unreadCount);
  const router = useRouter();
  const isPartner = user?.role === "partner_viewer";
  const t = useTranslations("nav");

  // Skriti moduli (lib/modules.ts) ostanejo dosegljivi po URL-ju, le v meniju jih ni
  const ALL_NAV_ITEMS: {
    href: string;
    label: string;
    icon: React.ElementType;
    module: ModuleKey;
    partnerVisible: boolean;
    showBadge?: boolean;
  }[] = [
    { href: "/sums", label: t("sumsOverview"), icon: LayoutDashboard, module: "r156", partnerVisible: true },
    { href: "/rxswins", label: t("rxswins"), icon: ShieldCheck, module: "r156", partnerVisible: true },
    { href: "/software-updates", label: t("softwareUpdates"), icon: FileCheck2, module: "r156", partnerVisible: true },
    { href: "/ecus", label: t("ecus"), icon: CircuitBoard, module: "r156", partnerVisible: true },
    { href: "/fleet", label: t("fleet"), icon: Truck, module: "r156", partnerVisible: true },
    { href: "/sha256", label: t("sha256"), icon: Hash, module: "r156", partnerVisible: true },
    { href: "/", label: t("overview"), icon: Home, module: "overview", partnerVisible: true },
    { href: "/vehicles", label: t("vehicles"), icon: Car, module: "vehicles", partnerVisible: true },
    { href: "/sw-updates", label: t("swUpdates"), icon: Cpu, module: "swUpdates", partnerVisible: false },
    { href: "/dtc", label: t("dtc"), icon: AlertTriangle, module: "dtc", partnerVisible: false },
    { href: "/obd", label: t("obd"), icon: Plug, module: "obd", partnerVisible: false },
    { href: "/alarms", label: t("alarms"), icon: Bell, module: "alarms", showBadge: true, partnerVisible: false },
    { href: "/reports", label: t("reports"), icon: FileText, module: "reports", partnerVisible: true },
    { href: "/audit", label: t("audit"), icon: ClipboardList, module: "audit", partnerVisible: false },
  ];

  const navItems = ALL_NAV_ITEMS.filter(
    (item) => moduleEnabled(item.module) && (!isPartner || item.partnerVisible)
  );

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
        <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
          SUMS
        </span>
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
          <span className="font-medium">{t("partnerReadOnly")}</span>
        </div>
      )}

      {/* Footer */}
      <div className="border-t p-3 space-y-1">
        <Link
          href="/help"
          className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        >
          <BookOpen className="mr-3 h-4 w-4" />
          {t("help")}
        </Link>
        <Link
          href="/settings"
          className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        >
          <Settings className="mr-3 h-4 w-4" />
          {t("settings")}
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        >
          <LogOut className="mr-3 h-4 w-4" />
          {t("logout")}
        </button>
      </div>
    </aside>
  );
}
