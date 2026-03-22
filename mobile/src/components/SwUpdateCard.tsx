import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SWUpdate } from "@/lib/api";
import { StatusBadge } from "./StatusBadge";

const methodIcons: Record<string, string> = {
  OTA: "cloud-download-outline",
  Workshop: "construct-outline",
  J2534: "hardware-chip-outline",
};

interface SwUpdateCardProps {
  update: SWUpdate;
}

export function SwUpdateCard({ update }: SwUpdateCardProps) {
  return (
    <View className="bg-slate-800 rounded-xl p-4 mb-3 border border-slate-700">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-row items-center flex-1 mr-3">
          <Ionicons
            name={(methodIcons[update.method] ?? "code-slash-outline") as any}
            size={20}
            color="#3b82f6"
          />
          <View className="ml-2 flex-1">
            <Text className="text-white font-bold text-sm">
              {update.ecu_module}
            </Text>
            <Text className="text-slate-400 text-xs">{update.method}</Text>
          </View>
        </View>
        <StatusBadge status={update.status as any} />
      </View>

      <View className="bg-slate-900 rounded-lg px-3 py-2 mb-2">
        <View className="flex-row items-center">
          <Text className="text-slate-500 text-xs flex-1">
            {update.version_before}
          </Text>
          <Ionicons name="arrow-forward" size={14} color="#3b82f6" />
          <Text className="text-blue-400 text-xs font-semibold flex-1 text-right">
            {update.version_after}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center mb-1">
        <Ionicons name="shield-checkmark-outline" size={13} color="#94a3b8" />
        <Text className="text-slate-400 text-xs ml-1" numberOfLines={1}>
          {update.rxswin}
        </Text>
      </View>

      {update.notes && (
        <Text className="text-slate-500 text-xs mt-1">{update.notes}</Text>
      )}

      <View className="flex-row items-center mt-2 pt-2 border-t border-slate-700">
        <Ionicons name="calendar-outline" size={13} color="#94a3b8" />
        <Text className="text-slate-500 text-xs ml-1">
          {new Date(update.date).toLocaleDateString("sl-SI")}
        </Text>
      </View>
    </View>
  );
}
