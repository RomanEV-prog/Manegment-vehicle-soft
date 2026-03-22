import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons as Ion } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { swUpdatesApi, SWUpdate, SWStatus } from "@/lib/api";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { VehiclePicker } from "@/components/VehiclePicker";

const STATUS_COLORS: Record<SWStatus, string> = {
  pending: "#f59e0b",
  installing: "#3b82f6",
  installed: "#22c55e",
  failed: "#ef4444",
  rolled_back: "#64748b",
};

const STATUS_LABELS: Record<SWStatus, string> = {
  pending: "Čaka",
  installing: "Namešča",
  installed: "Nameščeno",
  failed: "Napaka",
  rolled_back: "Povrnjeno",
};

const ALL_STATUSES = ["all", "pending", "installing", "installed", "failed"] as const;
type FilterStatus = (typeof ALL_STATUSES)[number];

function SwUpdateCard({ item }: { item: SWUpdate }) {
  const color = STATUS_COLORS[item.status as SWStatus] ?? "#64748b";
  const label = STATUS_LABELS[item.status as SWStatus] ?? item.status;
  return (
    <View className="bg-slate-800 rounded-xl p-4 mb-3 border border-slate-700">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1 mr-2">
          <Text className="text-white font-semibold text-sm">{item.ecu_module}</Text>
          <Text className="text-slate-500 text-xs font-mono mt-0.5">{item.rxswin}</Text>
        </View>
        <View
          className="px-2 py-1 rounded-full"
          style={{ backgroundColor: color + "22" }}
        >
          <Text className="text-xs font-semibold" style={{ color }}>
            {label}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2 mb-2">
        <Text className="text-slate-400 text-xs font-mono">{item.version_before}</Text>
        <Ion name="arrow-forward" size={12} color="#475569" />
        <Text className="text-green-400 text-xs font-mono">{item.version_after}</Text>
      </View>

      <View className="flex-row justify-between">
        <View className="flex-row items-center gap-1">
          <Ion name="settings-outline" size={12} color="#64748b" />
          <Text className="text-slate-500 text-xs">{item.method}</Text>
        </View>
        <Text className="text-slate-500 text-xs">
          {new Date(item.date).toLocaleDateString("sl-SI")}
        </Text>
      </View>

      {item.notes && (
        <Text className="text-slate-400 text-xs mt-2 italic">{item.notes}</Text>
      )}
    </View>
  );
}

interface NewSwForm {
  vehicle_id: string;
  ecu_module: string;
  version_before: string;
  version_after: string;
  rxswin: string;
  method: string;
  notes: string;
}

const emptyForm: NewSwForm = {
  vehicle_id: "",
  ecu_module: "",
  version_before: "",
  version_after: "",
  rxswin: "",
  method: "OTA",
  notes: "",
};

export default function SwScreen() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<NewSwForm>(emptyForm);

  const { data, isLoading, isRefetching, refetch, isError } = useQuery({
    queryKey: ["sw-updates", statusFilter],
    queryFn: () =>
      swUpdatesApi
        .list(statusFilter !== "all" ? { status: statusFilter } : undefined)
        .then((r) => r.data),
    staleTime: 60_000,
    gcTime: 24 * 60 * 60_000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      swUpdatesApi.create({
        vehicle_id: form.vehicle_id,
        date: new Date().toISOString().split("T")[0],
        ecu_module: form.ecu_module,
        version_before: form.version_before,
        version_after: form.version_after,
        rxswin: form.rxswin,
        method: form.method,
        status: "pending",
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sw-updates"] });
      setModalOpen(false);
      setForm(emptyForm);
      Toast.show({ type: "success", text1: "SW posodobitev dodana" });
    },
    onError: () => {
      Toast.show({ type: "error", text1: "Napaka pri dodajanju" });
    },
  });

  const handleSubmit = () => {
    if (!form.vehicle_id || !form.ecu_module || !form.version_after || !form.rxswin) {
      Toast.show({ type: "error", text1: "Izpolni obvezna polja" });
      return;
    }
    createMutation.mutate();
  };

  const renderItem = useCallback(
    ({ item }: { item: SWUpdate }) => <SwUpdateCard item={item} />,
    []
  );

  if (isLoading) return <LoadingSpinner fullScreen />;

  if (isError) {
    return (
      <View className="flex-1 bg-slate-900 items-center justify-center px-6">
        <Ion name="cloud-offline-outline" size={48} color="#94a3b8" />
        <Text className="text-slate-400 mt-4 text-center">Napaka pri nalaganju.</Text>
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
      {/* Status filtri */}
      <View className="px-4 pt-4">
        <FlatList
          horizontal
          data={ALL_STATUSES as unknown as FilterStatus[]}
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
                {s === "all"
                  ? "Vse"
                  : STATUS_LABELS[s as SWStatus] ?? s}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <FlatList
        data={data ?? []}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
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
              {data?.length ?? 0} posodobitev
            </Text>
            <TouchableOpacity
              onPress={() => setModalOpen(true)}
              className="flex-row items-center bg-blue-600 px-3 py-2 rounded-xl"
            >
              <Ion name="add" size={16} color="white" />
              <Text className="text-white text-sm font-semibold ml-1">Nova</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center py-16">
            <Ion name="hardware-chip-outline" size={48} color="#475569" />
            <Text className="text-slate-500 mt-3">Ni SW posodobitev</Text>
          </View>
        }
      />

      {/* Dodaj modal */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <View className="flex-1 justify-end">
            <View className="bg-slate-800 rounded-t-3xl p-6 border-t border-slate-600">
              <View className="flex-row justify-between items-center mb-5">
                <Text className="text-white text-lg font-bold">Nova SW posodobitev</Text>
                <TouchableOpacity onPress={() => setModalOpen(false)}>
                  <Ion name="close" size={24} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="mb-4">
                  <Text className="text-slate-400 text-sm mb-2">Vozilo *</Text>
                  <VehiclePicker
                    value={form.vehicle_id || null}
                    onChange={(v) => setForm((f) => ({ ...f, vehicle_id: v.id }))}
                  />
                </View>

                {(
                  [
                    { key: "ecu_module", label: "ECU modul *", placeholder: "npr. BMS, ADAS" },
                    { key: "version_before", label: "Verzija pred", placeholder: "1.0.0" },
                    { key: "version_after", label: "Verzija po *", placeholder: "1.1.0" },
                    { key: "rxswin", label: "RXSWIN *", placeholder: "RXSWIN-OEM-R156-BMS-110" },
                    { key: "method", label: "Metoda", placeholder: "OTA / USB / CAN" },
                  ] as const
                ).map(({ key, label, placeholder }) => (
                  <View key={key} className="mb-4">
                    <Text className="text-slate-400 text-sm mb-2">{label}</Text>
                    <View className="bg-slate-900 rounded-xl px-4 py-3 border border-slate-600">
                      <TextInput
                        className="text-white"
                        placeholder={placeholder}
                        placeholderTextColor="#475569"
                        value={form[key]}
                        onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
                        autoCapitalize="none"
                      />
                    </View>
                  </View>
                ))}

                <View className="mb-6">
                  <Text className="text-slate-400 text-sm mb-2">Opombe</Text>
                  <View className="bg-slate-900 rounded-xl px-4 py-3 border border-slate-600">
                    <TextInput
                      className="text-white"
                      placeholder="Opcijsko..."
                      placeholderTextColor="#475569"
                      value={form.notes}
                      onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                      multiline
                      numberOfLines={2}
                      textAlignVertical="top"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={createMutation.isPending}
                  className="bg-blue-600 rounded-xl py-4 items-center mb-4"
                >
                  {createMutation.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-semibold">Shrani</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
