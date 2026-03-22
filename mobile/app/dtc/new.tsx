import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { dtcApi, vehiclesApi } from "@/lib/api";

type Severity = "low" | "medium" | "high";

const severityOptions: { value: Severity; label: string; color: string }[] = [
  { value: "low", label: "Nizka", color: "bg-blue-600" },
  { value: "medium", label: "Srednja", color: "bg-yellow-500" },
  { value: "high", label: "Visoka", color: "bg-orange-500" },
];

export default function NewDtcScreen() {
  const qc = useQueryClient();
  const [vehicleId, setVehicleId] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => vehiclesApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      dtcApi.create({
        vehicle_id: vehicleId,
        code: code.toUpperCase().trim(),
        description: description.trim(),
        severity,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dtc"] });
      Toast.show({ type: "success", text1: "DTC zapis dodan" });
      router.back();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail ?? "Napaka pri dodajanju DTC";
      Toast.show({ type: "error", text1: msg });
    },
  });

  const handleSubmit = () => {
    if (!vehicleId || !code.trim() || !description.trim()) {
      Toast.show({ type: "error", text1: "Izpolni vsa obvezna polja" });
      return;
    }
    createMutation.mutate();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-slate-900"
    >
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mb-4">
          <Text className="text-slate-400 text-sm mb-2">Vozilo (ID) *</Text>
          <View className="bg-slate-800 rounded-xl px-4 py-3 border border-slate-600">
            <TextInput
              className="text-white"
              placeholder="ID vozila"
              placeholderTextColor="#475569"
              value={vehicleId}
              onChangeText={setVehicleId}
              keyboardType="numeric"
            />
          </View>
          {vehicles && vehicles.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
              {vehicles.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  onPress={() => setVehicleId(String(v.id))}
                  className={`mr-2 px-3 py-1.5 rounded-xl border ${
                    vehicleId === String(v.id)
                      ? "bg-blue-600 border-blue-500"
                      : "bg-slate-800 border-slate-600"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      vehicleId === String(v.id) ? "text-white" : "text-slate-400"
                    }`}
                  >
                    {v.name} {v.model}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <View className="mb-4">
          <Text className="text-slate-400 text-sm mb-2">DTC koda *</Text>
          <View className="bg-slate-800 rounded-xl px-4 py-3 border border-slate-600">
            <TextInput
              className="text-white font-mono text-base"
              placeholder="npr. P0300"
              placeholderTextColor="#475569"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              maxLength={10}
            />
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-slate-400 text-sm mb-2">Opis *</Text>
          <View className="bg-slate-800 rounded-xl px-4 py-3 border border-slate-600">
            <TextInput
              className="text-white"
              placeholder="Opis napake..."
              placeholderTextColor="#475569"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        <View className="mb-8">
          <Text className="text-slate-400 text-sm mb-3">Resnost *</Text>
          <View className="flex-row gap-2">
            {severityOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setSeverity(opt.value)}
                className={`flex-1 py-3 rounded-xl items-center border-2 ${
                  severity === opt.value
                    ? `${opt.color} border-transparent`
                    : "bg-slate-800 border-slate-600"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    severity === opt.value ? "text-white" : "text-slate-400"
                  }`}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={createMutation.isPending}
          className="bg-blue-600 rounded-xl py-4 items-center mb-4"
          activeOpacity={0.8}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <View className="flex-row items-center">
              <Ionicons name="add-circle-outline" size={18} color="white" />
              <Text className="text-white font-semibold ml-2">Dodaj DTC zapis</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.back()}
          className="py-3 items-center"
        >
          <Text className="text-slate-400">Prekliči</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
