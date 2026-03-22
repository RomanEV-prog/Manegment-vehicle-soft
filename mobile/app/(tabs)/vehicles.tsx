import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { vehiclesApi, Vehicle } from "@/lib/api";
import { VehicleCard } from "@/components/VehicleCard";
import { LoadingSpinner } from "@/components/LoadingSpinner";

const STATUS_FILTERS = ["all", "active", "in_service", "shipped", "decommissioned"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const statusLabels: Record<StatusFilter, string> = {
  all: "Vse",
  active: "Aktivna",
  in_service: "V servisu",
  shipped: "Odpremljena",
  decommissioned: "Izločena",
};

export default function VehiclesScreen() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data, isLoading, isRefetching, refetch, isError } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => vehiclesApi.list().then((r) => r.data),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    let result = data;
    if (statusFilter !== "all") {
      result = result.filter((v) => v.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (v) =>
          v.name?.toLowerCase().includes(q) ||
          v.model?.toLowerCase().includes(q) ||
          v.vin?.toLowerCase().includes(q) ||
          v.project_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [data, search, statusFilter]);

  const renderItem = useCallback(
    ({ item }: { item: Vehicle }) => <VehicleCard vehicle={item} />,
    []
  );

  const keyExtractor = useCallback((item: Vehicle) => String(item.id), []);

  if (isLoading) return <LoadingSpinner fullScreen />;

  if (isError) {
    return (
      <View className="flex-1 bg-slate-900 items-center justify-center px-6">
        <Ionicons name="cloud-offline-outline" size={48} color="#94a3b8" />
        <Text className="text-slate-400 mt-4 text-center">
          Napaka pri nalaganju vozil.
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          className="mt-4 bg-blue-600 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Poskusi znova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-900">
      <View className="px-4 pt-4">
        <View className="bg-slate-800 rounded-xl flex-row items-center px-3 py-2 border border-slate-700 mb-3">
          <Ionicons name="search-outline" size={18} color="#94a3b8" />
          <TextInput
            className="flex-1 text-white ml-2 text-sm"
            placeholder="Išči po znamki, modelu, VIN, tablici..."
            placeholderTextColor="#475569"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color="#64748b" />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          horizontal
          data={STATUS_FILTERS as unknown as StatusFilter[]}
          keyExtractor={(i) => i}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ marginBottom: 8 }}
          renderItem={({ item: s }) => (
            <TouchableOpacity
              onPress={() => setStatusFilter(s)}
              className={`mr-2 px-3 py-1.5 rounded-full border ${
                statusFilter === s
                  ? "bg-blue-600 border-blue-500"
                  : "bg-slate-800 border-slate-700"
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  statusFilter === s ? "text-white" : "text-slate-400"
                }`}
              >
                {statusLabels[s]}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#3b82f6"
            colors={["#3b82f6"]}
          />
        }
        ListEmptyComponent={
          <View className="items-center py-16">
            <Ionicons name="car-outline" size={48} color="#475569" />
            <Text className="text-slate-500 mt-3">
              {search || statusFilter !== "all"
                ? "Ni zadetkov"
                : "Ni vozil"}
            </Text>
          </View>
        }
        ListHeaderComponent={
          <View className="mb-2">
            <Text className="text-slate-400 text-sm">
              {filtered.length} vozil{filtered.length !== (data?.length ?? 0) ? ` (od ${data?.length})` : ""}
            </Text>
          </View>
        }
      />
    </View>
  );
}
