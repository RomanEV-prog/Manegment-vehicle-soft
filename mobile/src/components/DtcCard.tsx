import React from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DtcRecord } from "@/lib/api";
import { StatusBadge } from "./StatusBadge";

interface DtcCardProps {
  dtc: DtcRecord;
  onResolve?: (id: string) => void;
  isResolving?: boolean;
}

export function DtcCard({ dtc, onResolve, isResolving }: DtcCardProps) {
  const handleResolve = () => {
    Alert.alert(
      "Reši DTC",
      `Označi kodo ${dtc.code} kot rešeno?`,
      [
        { text: "Prekliči", style: "cancel" },
        { text: "Reši", onPress: () => onResolve?.(dtc.id) },
      ]
    );
  };

  const severityIcon: Record<string, string> = {
    low: "information-circle-outline",
    medium: "warning-outline",
    high: "alert-circle-outline",
    critical: "nuclear-outline",
  };

  return (
    <View className="bg-slate-800 rounded-xl p-4 mb-3 border border-slate-700">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-row items-center flex-1 mr-3">
          <Ionicons
            name={(severityIcon[dtc.severity] as any) ?? "alert-outline"}
            size={20}
            color={
              dtc.severity === "high"
                ? "#ef4444"
                : dtc.severity === "medium"
                ? "#eab308"
                : "#3b82f6"
            }
          />
          <Text className="text-white font-bold text-base ml-2">{dtc.code}</Text>
        </View>
        <StatusBadge status={dtc.severity} />
      </View>

      <Text className="text-slate-300 text-sm mb-3">{dtc.description}</Text>


      <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-slate-700">
        <View className="flex-row items-center">
          <Ionicons name="time-outline" size={13} color="#94a3b8" />
          <Text className="text-slate-500 text-xs ml-1">
            {new Date(dtc.created_at).toLocaleDateString("sl-SI")}
          </Text>
        </View>

        {dtc.status === "active" && onResolve && (
          <TouchableOpacity
            onPress={handleResolve}
            disabled={isResolving}
            className="bg-green-600 px-3 py-1 rounded-lg flex-row items-center"
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-outline" size={14} color="white" />
            <Text className="text-white text-xs font-semibold ml-1">Reši</Text>
          </TouchableOpacity>
        )}

        {dtc.status === "resolved" && (
          <StatusBadge status="resolved" />
        )}
      </View>
    </View>
  );
}
