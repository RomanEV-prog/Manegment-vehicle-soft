import React from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { vehiclesApi, dtcApi, alarmsApi, swUpdatesApi, Vehicle, DtcRecord } from "@/lib/api";
import { LoadingSpinner } from "@/components/LoadingSpinner";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  in_service: "#f59e0b",
  shipped: "#3b82f6",
  decommissioned: "#64748b",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Aktivna",
  in_service: "V servisu",
  shipped: "Odpremljena",
  decommissioned: "Izločena",
};

function StatCard({
  icon,
  label,
  value,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: number | string;
  color: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      className="flex-1 bg-slate-800 rounded-2xl p-4 border border-slate-700"
    >
      <View
        className="w-10 h-10 rounded-xl items-center justify-center mb-3"
        style={{ backgroundColor: color + "22" }}
      >
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text className="text-2xl font-bold text-white">{value}</Text>
      <Text className="text-slate-400 text-xs mt-1">{label}</Text>
    </TouchableOpacity>
  );
}

function CriticalDtcItem({ dtc }: { dtc: DtcRecord }) {
  return (
    <TouchableOpacity
      onPress={() => router.push("/(tabs)/dtc")}
      className="bg-slate-800 rounded-xl p-3 mb-2 border border-red-900/50 flex-row items-center"
    >
      <View className="bg-red-900/40 rounded-lg w-8 h-8 items-center justify-center mr-3">
        <Ionicons name="warning" size={16} color="#ef4444" />
      </View>
      <View className="flex-1">
        <Text className="text-white text-sm font-semibold">{dtc.code}</Text>
        <Text className="text-slate-400 text-xs" numberOfLines={1}>
          {dtc.description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#475569" />
    </TouchableOpacity>
  );
}

export default function PregledScreen() {
  const {
    data: vehicles,
    isLoading: vLoading,
    refetch: vRefetch,
    isRefetching: vRefetching,
  } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => vehiclesApi.list().then((r) => r.data),
    staleTime: 60_000,
    gcTime: 24 * 60 * 60_000,
  });

  const { data: highDtcs, isLoading: dLoading, refetch: dRefetch } = useQuery({
    queryKey: ["dtc", "high", "active"],
    queryFn: () =>
      dtcApi.list({ status: "active", severity: "high" }).then((r) => r.data),
    staleTime: 30_000,
    gcTime: 24 * 60 * 60_000,
  });

  const { data: unreadAlarms, refetch: aRefetch } = useQuery({
    queryKey: ["alarms", "unread"],
    queryFn: () => alarmsApi.list({ is_read: false, limit: 50 }).then((r) => r.data),
    staleTime: 30_000,
    gcTime: 24 * 60 * 60_000,
  });

  const { data: pendingSW, refetch: swRefetch } = useQuery({
    queryKey: ["sw-updates", "pending"],
    queryFn: () => swUpdatesApi.list({ status: "pending" }).then((r) => r.data),
    staleTime: 60_000,
    gcTime: 24 * 60 * 60_000,
  });

  const isLoading = vLoading || dLoading;
  const isRefetching = vRefetching;

  const handleRefetch = () => {
    vRefetch();
    dRefetch();
    aRefetch();
    swRefetch();
  };

  if (isLoading) return <LoadingSpinner fullScreen />;

  // Preštej vozila po statusu
  const byStatus = (vehicles ?? []).reduce<Record<string, number>>((acc, v) => {
    acc[v.status] = (acc[v.status] ?? 0) + 1;
    return acc;
  }, {});

  const totalVehicles = vehicles?.length ?? 0;
  const activeCount = byStatus["active"] ?? 0;
  const inServiceCount = byStatus["in_service"] ?? 0;
  const highDtcCount = highDtcs?.length ?? 0;
  const unreadCount = unreadAlarms?.length ?? 0;
  const pendingSwCount = pendingSW?.length ?? 0;

  const criticalDtcs = (highDtcs ?? []).slice(0, 5);

  return (
    <ScrollView
      className="flex-1 bg-slate-900"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={handleRefetch}
          tintColor="#3b82f6"
          colors={["#3b82f6"]}
        />
      }
    >
      {/* Pozdrav / naslov */}
      <View className="mb-6">
        <Text className="text-white text-2xl font-bold">Pregled flote</Text>
        <Text className="text-slate-400 text-sm mt-1">
          {totalVehicles} vozil skupaj
        </Text>
      </View>

      {/* Statistike — 1. vrstica */}
      <View className="flex-row gap-3 mb-3">
        <StatCard
          icon="car-sport-outline"
          label="Skupaj"
          value={totalVehicles}
          color="#3b82f6"
          onPress={() => router.push("/(tabs)/vehicles")}
        />
        <StatCard
          icon="checkmark-circle-outline"
          label="Aktivna"
          value={activeCount}
          color="#22c55e"
          onPress={() => router.push("/(tabs)/vehicles")}
        />
      </View>

      {/* Statistike — 2. vrstica */}
      <View className="flex-row gap-3 mb-3">
        <StatCard
          icon="construct-outline"
          label="V servisu"
          value={inServiceCount}
          color="#f59e0b"
        />
        <StatCard
          icon="hardware-chip-outline"
          label="Čakajoči SW"
          value={pendingSwCount}
          color="#8b5cf6"
          onPress={() => router.push("/(tabs)/sw")}
        />
      </View>

      {/* Statistike — 3. vrstica */}
      <View className="flex-row gap-3 mb-6">
        <StatCard
          icon="warning-outline"
          label="DTC visoko"
          value={highDtcCount}
          color="#ef4444"
          onPress={() => router.push("/(tabs)/dtc")}
        />
        <StatCard
          icon="notifications-outline"
          label="Alarmi"
          value={unreadCount}
          color="#f59e0b"
        />
      </View>

      {/* Statusna porazdelitev */}
      <View className="bg-slate-800 rounded-2xl p-4 border border-slate-700 mb-6">
        <Text className="text-white font-semibold text-sm mb-3">Status vozil</Text>
        {(["active", "in_service", "shipped", "decommissioned"] as const).map((s) => {
          const count = byStatus[s] ?? 0;
          const pct = totalVehicles > 0 ? (count / totalVehicles) * 100 : 0;
          return (
            <View key={s} className="mb-2">
              <View className="flex-row justify-between mb-1">
                <Text className="text-slate-400 text-xs">{STATUS_LABELS[s]}</Text>
                <Text className="text-slate-300 text-xs font-medium">{count}</Text>
              </View>
              <View className="bg-slate-700 rounded-full h-1.5">
                <View
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: STATUS_COLORS[s],
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>

      {/* Kritični DTC-ji */}
      {criticalDtcs.length > 0 && (
        <View>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-white font-semibold text-sm">Kritični DTC-ji</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/dtc")}>
              <Text className="text-blue-400 text-xs">Prikaži vse</Text>
            </TouchableOpacity>
          </View>
          {criticalDtcs.map((dtc) => (
            <CriticalDtcItem key={dtc.id} dtc={dtc} />
          ))}
        </View>
      )}

      {criticalDtcs.length === 0 && highDtcCount === 0 && (
        <View className="bg-slate-800 rounded-2xl p-4 border border-slate-700 flex-row items-center gap-3">
          <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
          <Text className="text-slate-300 text-sm">Ni kritičnih DTC napak</Text>
        </View>
      )}
    </ScrollView>
  );
}
