import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { swUpdatesApi, vehiclesApi } from "@/lib/api";

const METHODS = ["OTA", "Workshop", "J2534"] as const;

export default function NewSwUpdateScreen() {
  const { vehicle_id } = useLocalSearchParams<{ vehicle_id?: string }>();
  const qc = useQueryClient();

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => vehiclesApi.list().then((r) => r.data),
  });

  const [form, setForm] = useState({
    vehicle_id: vehicle_id ?? "",
    ecu_module: "",
    version_before: "",
    version_after: "",
    rxswin: "",
    method: "Workshop" as string,
    notes: "",
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
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sw-updates"] });
      Toast.show({ type: "success", text1: "SW posodobitev dodana" });
      router.back();
    },
    onError: (err: any) => {
      const detail =
        err?.response?.data?.detail ?? "Napaka pri dodajanju posodobitve";
      Toast.show({ type: "error", text1: String(detail) });
    },
  });

  const handleSubmit = () => {
    if (
      !form.vehicle_id ||
      !form.ecu_module ||
      !form.version_before ||
      !form.version_after ||
      !form.rxswin ||
      !form.method
    ) {
      Toast.show({ type: "error", text1: "Izpolni vsa obvezna polja" });
      return;
    }
    createMutation.mutate();
  };

  const update = (key: keyof typeof form, val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const selectedVehicle = vehicles?.find(
    (v) => String(v.id) === form.vehicle_id
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-slate-900"
    >
      <ScrollView className="flex-1 px-4 py-6">
        {/* Vehicle selector */}
        <View className="mb-4">
          <Text className="text-slate-400 text-sm mb-2">Vozilo *</Text>
          {vehicles && vehicles.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-2"
            >
              {vehicles.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  onPress={() => update("vehicle_id", String(v.id))}
                  className={`mr-2 px-3 py-2 rounded-xl border ${
                    String(v.id) === form.vehicle_id
                      ? "bg-blue-600 border-blue-500"
                      : "bg-slate-800 border-slate-700"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      String(v.id) === form.vehicle_id
                        ? "text-white"
                        : "text-slate-400"
                    }`}
                  >
                    {v.name} {v.model}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View className="bg-slate-800 rounded-xl px-4 py-3 border border-slate-600">
              <TextInput
                className="text-white"
                placeholder="ID vozila"
                placeholderTextColor="#475569"
                value={form.vehicle_id}
                onChangeText={(v) => update("vehicle_id", v)}
              />
            </View>
          )}
          {selectedVehicle && (
            <Text className="text-slate-500 text-xs">
              VIN: {selectedVehicle.vin}
            </Text>
          )}
        </View>

        {/* ECU Module */}
        <View className="mb-4">
          <Text className="text-slate-400 text-sm mb-2">ECU modul *</Text>
          <View className="bg-slate-800 rounded-xl px-4 py-3 border border-slate-600">
            <TextInput
              className="text-white"
              placeholder="npr. ECM, TCM, BCM..."
              placeholderTextColor="#475569"
              value={form.ecu_module}
              onChangeText={(v) => update("ecu_module", v)}
              autoCapitalize="characters"
            />
          </View>
        </View>

        {/* Version Before → After */}
        <View className="flex-row mb-4">
          <View className="flex-1 mr-2">
            <Text className="text-slate-400 text-sm mb-2">Verzija prej *</Text>
            <View className="bg-slate-800 rounded-xl px-4 py-3 border border-slate-600">
              <TextInput
                className="text-white"
                placeholder="1.0.0"
                placeholderTextColor="#475569"
                value={form.version_before}
                onChangeText={(v) => update("version_before", v)}
              />
            </View>
          </View>
          <View className="flex-1 ml-2">
            <Text className="text-slate-400 text-sm mb-2">Verzija potem *</Text>
            <View className="bg-slate-800 rounded-xl px-4 py-3 border border-slate-600">
              <TextInput
                className="text-white"
                placeholder="1.1.0"
                placeholderTextColor="#475569"
                value={form.version_after}
                onChangeText={(v) => update("version_after", v)}
              />
            </View>
          </View>
        </View>

        {/* RXSWIN */}
        <View className="mb-4">
          <Text className="text-slate-400 text-sm mb-2">RXSWIN *</Text>
          <View className="bg-slate-800 rounded-xl px-4 py-3 border border-slate-600">
            <TextInput
              className="text-white"
              placeholder="RXSWIN-EV-M1-ECM-001"
              placeholderTextColor="#475569"
              value={form.rxswin}
              onChangeText={(v) => update("rxswin", v.toUpperCase())}
              autoCapitalize="characters"
            />
          </View>
          <Text className="text-slate-600 text-xs mt-1">
            Format: RXSWIN-OEM-REG-MODULE-VERSION
          </Text>
        </View>

        {/* Method */}
        <View className="mb-4">
          <Text className="text-slate-400 text-sm mb-2">Metoda *</Text>
          <View className="flex-row">
            {METHODS.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => update("method", m)}
                className={`mr-2 px-4 py-2.5 rounded-xl border ${
                  form.method === m
                    ? "bg-blue-600 border-blue-500"
                    : "bg-slate-800 border-slate-700"
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    form.method === m ? "text-white" : "text-slate-400"
                  }`}
                >
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notes */}
        <View className="mb-6">
          <Text className="text-slate-400 text-sm mb-2">Opombe</Text>
          <View className="bg-slate-800 rounded-xl px-4 py-3 border border-slate-600">
            <TextInput
              className="text-white"
              placeholder="Dodatne opombe..."
              placeholderTextColor="#475569"
              value={form.notes}
              onChangeText={(v) => update("notes", v)}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={createMutation.isPending}
          className={`py-4 rounded-xl items-center mb-8 ${
            createMutation.isPending ? "bg-blue-800" : "bg-blue-600"
          }`}
        >
          <Text className="text-white font-bold text-base">
            {createMutation.isPending ? "Shranjujem..." : "Shrani posodobitev"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
