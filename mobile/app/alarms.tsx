import React from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { alarmsApi, AlarmEvent } from "@/lib/api";
import { AlarmCard } from "@/components/AlarmCard";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function AlarmsScreen() {
  const qc = useQueryClient();

  const { data, isLoading, isRefetching, refetch, isError } = useQuery({
    queryKey: ["alarms"],
    queryFn: () => alarmsApi.list({ limit: 100 }).then((r) => r.data),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => alarmsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alarms"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => alarmsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alarms"] });
      Toast.show({ type: "success", text1: "Vsi alarmi prebrani" });
    },
  });

  const unreadCount = data?.filter((a) => !a.is_read).length ?? 0;

  if (isLoading) return <LoadingSpinner fullScreen />;

  if (isError) {
    return (
      <View className="flex-1 bg-slate-900 items-center justify-center px-6">
        <Ionicons name="cloud-offline-outline" size={48} color="#94a3b8" />
        <Text className="text-slate-400 mt-4 text-center">
          Napaka pri nalaganju alarmov.
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
        renderItem={({ item }) => (
          <AlarmCard
            alarm={item}
            onMarkRead={(id) => markReadMutation.mutate(id)}
          />
        )}
        keyExtractor={(item) => item.id}
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
              {unreadCount > 0 ? `${unreadCount} neprebranih` : "Vse prebrano"}
            </Text>
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={() => markAllReadMutation.mutate()}
                className="flex-row items-center bg-slate-700 px-3 py-1.5 rounded-xl"
              >
                <Ionicons name="checkmark-done-outline" size={14} color="#94a3b8" />
                <Text className="text-slate-300 text-xs font-medium ml-1">
                  Označi vse
                </Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListEmptyComponent={
          <View className="items-center py-16">
            <Ionicons name="notifications-off-outline" size={48} color="#475569" />
            <Text className="text-slate-500 mt-3">Ni alarmov</Text>
          </View>
        }
      />
    </View>
  );
}
