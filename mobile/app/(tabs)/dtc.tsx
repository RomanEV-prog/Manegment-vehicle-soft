import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { dtcApi, DtcRecord } from "@/lib/api";
import { DtcCard } from "@/components/DtcCard";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function DtcScreen() {
  const qc = useQueryClient();

  const { data, isLoading, isRefetching, refetch, isError } = useQuery({
    queryKey: ["dtc", "active"],
    queryFn: () => dtcApi.list({ status: "active" }).then((r) => r.data),
    staleTime: 30_000,
    gcTime: 24 * 60 * 60_000,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => dtcApi.resolve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dtc"] });
      Toast.show({ type: "success", text1: "DTC označen kot rešen" });
    },
    onError: () => {
      Toast.show({ type: "error", text1: "Napaka pri reševanju DTC" });
    },
  });

  const renderItem = useCallback(
    ({ item }: { item: DtcRecord }) => (
      <DtcCard
        dtc={item}
        onResolve={(id) => resolveMutation.mutate(id)}
        isResolving={resolveMutation.isPending}
      />
    ),
    [resolveMutation]
  );

  if (isLoading) return <LoadingSpinner fullScreen />;

  if (isError) {
    return (
      <View className="flex-1 bg-slate-900 items-center justify-center px-6">
        <Ionicons name="cloud-offline-outline" size={48} color="#94a3b8" />
        <Text className="text-slate-400 mt-4 text-center">
          Napaka pri nalaganju DTC zapisov.
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
      <FlatList
        data={data ?? []}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#3b82f6"
            colors={["#3b82f6"]}
          />
        }
        ListHeaderComponent={
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-slate-400 text-sm">
              {data?.length ?? 0} aktivnih DTC
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/dtc/new")}
              className="flex-row items-center bg-blue-600 px-3 py-2 rounded-xl"
            >
              <Ionicons name="add" size={16} color="white" />
              <Text className="text-white text-sm font-semibold ml-1">
                Nov DTC
              </Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center py-16">
            <Ionicons name="checkmark-circle-outline" size={48} color="#22c55e" />
            <Text className="text-slate-500 mt-3">Ni aktivnih DTC zapisov</Text>
          </View>
        }
      />
    </View>
  );
}
