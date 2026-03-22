import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Vehicle } from "@/lib/api";

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "#14532d", text: "#86efac", label: "Aktiven" },
  in_service: { bg: "#78350f", text: "#fcd34d", label: "V servisu" },
  shipped: { bg: "#1e3a5f", text: "#93c5fd", label: "Odpremljeno" },
  decommissioned: { bg: "#1e293b", text: "#64748b", label: "Izločen" },
};

interface VehicleCardProps {
  vehicle: Vehicle;
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
  const sc = STATUS_COLORS[vehicle.status] ?? { bg: "#1e293b", text: "#64748b", label: vehicle.status };

  return (
    <TouchableOpacity
      onPress={() => router.push(`/vehicles/${vehicle.id}`)}
      className="bg-slate-800 rounded-xl p-4 mb-3 border border-slate-700"
      activeOpacity={0.7}
    >
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1 mr-3">
          <Text className="text-white text-base font-bold">{vehicle.name}</Text>
          <Text className="text-slate-400 text-sm">
            {vehicle.model} · {vehicle.year}
          </Text>
        </View>
        <View
          className="px-2 py-0.5 rounded-full"
          style={{ backgroundColor: sc.bg }}
        >
          <Text className="text-xs font-semibold" style={{ color: sc.text }}>
            {sc.label}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center mb-1">
        <Ionicons name="card-outline" size={13} color="#94a3b8" />
        <Text className="text-slate-400 text-xs ml-1 font-mono">{vehicle.vin}</Text>
      </View>

      {vehicle.project_name && (
        <View className="flex-row items-center mt-2 pt-2 border-t border-slate-700/60">
          <Ionicons name="folder-outline" size={12} color="#64748b" />
          <Text className="text-slate-500 text-xs ml-1">{vehicle.project_name}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
