import React from "react";
import { View, Text } from "react-native";

type Status =
  | "active"
  | "inactive"
  | "maintenance"
  | "synced"
  | "pending"
  | "error"
  | "resolved"
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "success"
  | "failed"
  | "in_progress"
  | "rolled_back"
  | "in_service"
  | "shipped"
  | "decommissioned"
  | "under_review"
  | "installing"
  | "installed";

const statusConfig: Record<Status, { label: string; bg: string; text: string }> = {
  active: { label: "Aktiven", bg: "bg-green-100", text: "text-green-800" },
  inactive: { label: "Neaktiven", bg: "bg-gray-100", text: "text-gray-700" },
  maintenance: { label: "Vzdrževanje", bg: "bg-yellow-100", text: "text-yellow-800" },
  synced: { label: "Sinhroniziran", bg: "bg-blue-100", text: "text-blue-800" },
  pending: { label: "V čakanju", bg: "bg-orange-100", text: "text-orange-800" },
  error: { label: "Napaka", bg: "bg-red-100", text: "text-red-800" },
  resolved: { label: "Rešen", bg: "bg-green-100", text: "text-green-800" },
  low: { label: "Nizka", bg: "bg-blue-100", text: "text-blue-800" },
  medium: { label: "Srednja", bg: "bg-yellow-100", text: "text-yellow-800" },
  high: { label: "Visoka", bg: "bg-orange-100", text: "text-orange-800" },
  critical: { label: "Kritično", bg: "bg-red-100", text: "text-red-800" },
  success: { label: "Uspešno", bg: "bg-green-100", text: "text-green-800" },
  failed: { label: "Neuspešno", bg: "bg-red-100", text: "text-red-800" },
  in_progress: { label: "V teku", bg: "bg-blue-100", text: "text-blue-800" },
  rolled_back: { label: "Povrnjeno", bg: "bg-purple-100", text: "text-purple-800" },
  in_service: { label: "V servisu", bg: "bg-yellow-100", text: "text-yellow-800" },
  shipped: { label: "Odpremljeno", bg: "bg-blue-100", text: "text-blue-800" },
  decommissioned: { label: "Izločeno", bg: "bg-gray-100", text: "text-gray-700" },
  under_review: { label: "Pregled", bg: "bg-purple-100", text: "text-purple-800" },
  installing: { label: "Nameščanje", bg: "bg-blue-100", text: "text-blue-800" },
  installed: { label: "Nameščeno", bg: "bg-green-100", text: "text-green-800" },
};

interface StatusBadgeProps {
  status: Status;
  customLabel?: string;
}

export function StatusBadge({ status, customLabel }: StatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    bg: "bg-gray-100",
    text: "text-gray-700",
  };

  return (
    <View className={`px-2 py-1 rounded-full ${config.bg}`}>
      <Text className={`text-xs font-semibold ${config.text}`}>
        {customLabel ?? config.label}
      </Text>
    </View>
  );
}
