import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AlarmEvent } from "@/lib/api";

const severityColors: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#94a3b8",
};

const typeIcons: Record<string, string> = {
  dtc_critical: "nuclear-outline",
  dtc_high: "alert-circle-outline",
  sw_update_failed: "cloud-offline-outline",
  twin_desync: "git-network-outline",
  service_overdue: "time-outline",
};

interface AlarmCardProps {
  alarm: AlarmEvent;
  onMarkRead?: (id: string) => void;
}

export function AlarmCard({ alarm, onMarkRead }: AlarmCardProps) {
  const color = severityColors[alarm.severity] ?? "#94a3b8";
  const icon = typeIcons[alarm.alarm_type] ?? "notifications-outline";

  return (
    <TouchableOpacity
      onPress={() => !alarm.is_read && onMarkRead?.(alarm.id)}
      activeOpacity={alarm.is_read ? 1 : 0.7}
      className={`rounded-xl p-4 mb-3 border ${
        alarm.is_read
          ? "bg-slate-800/60 border-slate-700/50"
          : "bg-slate-800 border-slate-700"
      }`}
    >
      <View className="flex-row items-start">
        <View
          className="w-9 h-9 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: color + "20" }}
        >
          <Ionicons name={icon as any} size={18} color={color} />
        </View>
        <View className="flex-1">
          <View className="flex-row justify-between items-start mb-1">
            <Text
              className={`font-semibold text-sm flex-1 mr-2 ${
                alarm.is_read ? "text-slate-400" : "text-white"
              }`}
            >
              {alarm.title}
            </Text>
            {!alarm.is_read && (
              <View className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
            )}
          </View>
          <Text
            className={`text-xs mb-2 ${
              alarm.is_read ? "text-slate-500" : "text-slate-300"
            }`}
            numberOfLines={2}
          >
            {alarm.message}
          </Text>
          <View className="flex-row items-center">
            <Ionicons name="time-outline" size={11} color="#64748b" />
            <Text className="text-slate-500 text-xs ml-1">
              {new Date(alarm.created_at).toLocaleDateString("sl-SI")}{" "}
              {new Date(alarm.created_at).toLocaleTimeString("sl-SI", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
