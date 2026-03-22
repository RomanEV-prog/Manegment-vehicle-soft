import React, { useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { serviceApi, ServiceRecord } from "@/lib/api";
import { VehiclePicker } from "@/components/VehiclePicker";
import { LoadingSpinner } from "@/components/LoadingSpinner";

function ServiceRecordItem({ record }: { record: ServiceRecord }) {
  return (
    <View className="bg-slate-800 rounded-xl p-4 mb-3 border border-slate-700">
      <View className="flex-row justify-between items-start mb-2">
        <Text className="text-white font-semibold text-base flex-1 mr-2">
          {record.service_type}
        </Text>
        <Text className="text-slate-400 text-xs">
          {new Date(record.date_performed).toLocaleDateString("sl-SI")}
        </Text>
      </View>
      {record.notes && (
        <Text className="text-slate-300 text-sm mb-2">{record.notes}</Text>
      )}
      <View className="flex-row justify-between">
        <View className="flex-row items-center">
          <Ionicons name="person-outline" size={13} color="#94a3b8" />
          <Text className="text-slate-400 text-xs ml-1">{record.technician}</Text>
        </View>
        {record.mileage_km != null && (
          <View className="flex-row items-center">
            <Ionicons name="speedometer-outline" size={13} color="#94a3b8" />
            <Text className="text-slate-400 text-xs ml-1">
              {record.mileage_km.toLocaleString()} km
            </Text>
          </View>
        )}
        {record.cost_eur != null && (
          <View className="flex-row items-center">
            <Ionicons name="cash-outline" size={13} color="#94a3b8" />
            <Text className="text-slate-400 text-xs ml-1">
              {record.cost_eur.toFixed(2)} €
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

interface NewServiceForm {
  vehicle_id: string;
  service_type: string;
  technician: string;
  notes: string;
  mileage_km: string;
  cost_eur: string;
}

const emptyForm: NewServiceForm = {
  vehicle_id: "",
  service_type: "",
  technician: "",
  notes: "",
  mileage_km: "",
  cost_eur: "",
};

export default function ServiceScreen() {
  const qc = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<NewServiceForm>(emptyForm);

  const { data, isLoading, isRefetching, refetch, isError } = useQuery({
    queryKey: ["service"],
    queryFn: () => serviceApi.list().then((r) => r.data),
    staleTime: 60_000,
    gcTime: 24 * 60 * 60_000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      serviceApi.create({
        vehicle_id: form.vehicle_id,
        service_type: form.service_type,
        technician: form.technician,
        date_performed: new Date().toISOString().split("T")[0],
        notes: form.notes || undefined,
        mileage_km: form.mileage_km ? Number(form.mileage_km) : undefined,
        cost_eur: form.cost_eur ? Number(form.cost_eur) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service"] });
      setModalVisible(false);
      setForm(emptyForm);
      Toast.show({ type: "success", text1: "Servisni zapis dodan" });
    },
    onError: () => {
      Toast.show({ type: "error", text1: "Napaka pri dodajanju zapisa" });
    },
  });

  const handleSubmit = () => {
    if (!form.vehicle_id || !form.service_type || !form.technician) {
      Toast.show({ type: "error", text1: "Izpolni obvezna polja" });
      return;
    }
    createMutation.mutate();
  };

  if (isLoading) return <LoadingSpinner fullScreen />;

  if (isError) {
    return (
      <View className="flex-1 bg-slate-900 items-center justify-center px-6">
        <Ionicons name="cloud-offline-outline" size={48} color="#94a3b8" />
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
      <FlatList
        data={data ?? []}
        renderItem={({ item }) => <ServiceRecordItem record={item} />}
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
              {data?.length ?? 0} zapisov
            </Text>
            <TouchableOpacity
              onPress={() => setModalVisible(true)}
              className="flex-row items-center bg-blue-600 px-3 py-2 rounded-xl"
            >
              <Ionicons name="add" size={16} color="white" />
              <Text className="text-white text-sm font-semibold ml-1">
                Nov servis
              </Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center py-16">
            <Ionicons name="construct-outline" size={48} color="#475569" />
            <Text className="text-slate-500 mt-3">Ni servisnih zapisov</Text>
          </View>
        }
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <View className="flex-1 justify-end">
            <View className="bg-slate-800 rounded-t-3xl p-6 border-t border-slate-600">
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-white text-lg font-bold">Nov servisni zapis</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#94a3b8" />
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

                <View className="mb-4">
                  <Text className="text-slate-400 text-sm mb-2">Tip servisa *</Text>
                  <View className="bg-slate-900 rounded-xl px-4 py-3 border border-slate-600">
                    <TextInput
                      className="text-white"
                      placeholder="npr. Zamenjava olja, pregled"
                      placeholderTextColor="#475569"
                      value={form.service_type}
                      onChangeText={(v) => setForm((f) => ({ ...f, service_type: v }))}
                    />
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-slate-400 text-sm mb-2">Tehnik *</Text>
                  <View className="bg-slate-900 rounded-xl px-4 py-3 border border-slate-600">
                    <TextInput
                      className="text-white"
                      placeholder="Ime tehnika"
                      placeholderTextColor="#475569"
                      value={form.technician}
                      onChangeText={(v) => setForm((f) => ({ ...f, technician: v }))}
                    />
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-slate-400 text-sm mb-2">Opombe</Text>
                  <View className="bg-slate-900 rounded-xl px-4 py-3 border border-slate-600">
                    <TextInput
                      className="text-white"
                      placeholder="Opis opravljenega dela..."
                      placeholderTextColor="#475569"
                      value={form.notes}
                      onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                  </View>
                </View>

                <View className="flex-row gap-3 mb-6">
                  <View className="flex-1">
                    <Text className="text-slate-400 text-sm mb-2">Kilometrina</Text>
                    <View className="bg-slate-900 rounded-xl px-4 py-3 border border-slate-600">
                      <TextInput
                        className="text-white"
                        placeholder="km"
                        placeholderTextColor="#475569"
                        value={form.mileage_km}
                        onChangeText={(v) => setForm((f) => ({ ...f, mileage_km: v }))}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-400 text-sm mb-2">Strošek (€)</Text>
                    <View className="bg-slate-900 rounded-xl px-4 py-3 border border-slate-600">
                      <TextInput
                        className="text-white"
                        placeholder="0.00"
                        placeholderTextColor="#475569"
                        value={form.cost_eur}
                        onChangeText={(v) => setForm((f) => ({ ...f, cost_eur: v }))}
                        keyboardType="decimal-pad"
                      />
                    </View>
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
