import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Alert,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import * as ImagePicker from "expo-image-picker";
import {
  vehiclesApi,
  dtcApi,
  swUpdatesApi,
  photosApi,
  twinsApi,
  Photo,
} from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { DtcCard } from "@/components/DtcCard";
import { SwUpdateCard } from "@/components/SwUpdateCard";
import { TwinViewer } from "@/components/TwinViewer";
import { PhotoGrid } from "@/components/PhotoGrid";
import { LoadingSpinner } from "@/components/LoadingSpinner";

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value?: string | null;
}) {
  return (
    <View className="flex-row items-center px-4 py-3 border-b border-slate-700">
      <Ionicons name={icon as any} size={18} color="#94a3b8" />
      <View className="ml-3 flex-1">
        <Text className="text-slate-500 text-xs">{label}</Text>
        <Text className="text-white mt-0.5">{value ?? "—"}</Text>
      </View>
    </View>
  );
}

type Tab = "info" | "dtc" | "sw" | "photos";

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("info");

  const {
    data: vehicle,
    isLoading: vehicleLoading,
    refetch: refetchVehicle,
  } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => vehiclesApi.get(id!).then((r) => r.data),
    enabled: !!id,
  });

  const { data: dtcRecords, refetch: refetchDtc } = useQuery({
    queryKey: ["dtc", "vehicle", id],
    queryFn: () =>
      dtcApi.list({ vehicle_id: id }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: swUpdates, refetch: refetchSw } = useQuery({
    queryKey: ["sw-updates", "vehicle", id],
    queryFn: () =>
      swUpdatesApi.list({ vehicle_id: id }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: photos, refetch: refetchPhotos } = useQuery({
    queryKey: ["photos", "vehicle", id],
    queryFn: () =>
      photosApi.list({ vehicle_id: id }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: twin } = useQuery({
    queryKey: ["twin", id],
    queryFn: () => twinsApi.get(id!).then((r) => r.data),
    enabled: !!id,
  });

  const resolveMutation = useMutation({
    mutationFn: (dtcId: string) => dtcApi.resolve(dtcId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dtc"] });
      Toast.show({ type: "success", text1: "DTC označen kot rešen" });
    },
    onError: () => {
      Toast.show({ type: "error", text1: "Napaka pri reševanju DTC" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => photosApi.upload(formData),
    onSuccess: () => {
      refetchPhotos();
      Toast.show({ type: "success", text1: "Fotografija naložena" });
    },
    onError: () => {
      Toast.show({ type: "error", text1: "Napaka pri nalaganju" });
    },
  });

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Dovoljenje", "Potrebno je dovoljenje za kamero.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const formData = new FormData();
    formData.append("file", {
      uri: asset.uri,
      name: asset.fileName ?? `photo_${Date.now()}.jpg`,
      type: asset.mimeType ?? "image/jpeg",
    } as any);
    formData.append("vehicle_id", id!);
    formData.append("photo_type", "other");

    uploadMutation.mutate(formData);
  };

  const handleRefresh = () => {
    refetchVehicle();
    refetchDtc();
    refetchSw();
    refetchPhotos();
  };

  if (vehicleLoading) return <LoadingSpinner fullScreen />;

  if (!vehicle) {
    return (
      <View className="flex-1 bg-slate-900 items-center justify-center">
        <Ionicons name="car-outline" size={48} color="#475569" />
        <Text className="text-slate-500 mt-3">Vozilo ni najdeno</Text>
      </View>
    );
  }

  const activeDtc = dtcRecords?.filter((d) => d.status === "active") ?? [];
  const resolvedDtc = dtcRecords?.filter((d) => d.status === "resolved") ?? [];

  const tabs: { key: Tab; label: string; icon: string; badge?: number }[] = [
    { key: "info", label: "Info", icon: "information-circle-outline" },
    {
      key: "dtc",
      label: "DTC",
      icon: "warning-outline",
      badge: activeDtc.length,
    },
    {
      key: "sw",
      label: "SW",
      icon: "cloud-download-outline",
      badge: swUpdates?.length,
    },
    {
      key: "photos",
      label: "Foto",
      icon: "images-outline",
      badge: photos?.length,
    },
  ];

  return (
    <ScrollView
      className="flex-1 bg-slate-900"
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={handleRefresh}
          tintColor="#3b82f6"
          colors={["#3b82f6"]}
        />
      }
    >
      <View className="px-4 py-4">
        {/* Vehicle Header */}
        <View className="bg-slate-800 rounded-2xl border border-slate-700 mb-4">
          <View className="px-4 py-4 flex-row justify-between items-center">
            <View>
              <Text className="text-white text-xl font-bold">
                {vehicle.name}
              </Text>
              <Text className="text-slate-400">{vehicle.year}</Text>
            </View>
            <StatusBadge status={vehicle.status} />
          </View>
        </View>

        {/* Tab Bar */}
        <View className="flex-row mb-4 bg-slate-800 rounded-xl p-1 border border-slate-700">
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`flex-1 flex-row items-center justify-center py-2 rounded-lg ${
                activeTab === tab.key ? "bg-blue-600" : ""
              }`}
            >
              <Ionicons
                name={tab.icon as any}
                size={14}
                color={activeTab === tab.key ? "white" : "#64748b"}
              />
              <Text
                className={`text-xs font-medium ml-1 ${
                  activeTab === tab.key ? "text-white" : "text-slate-500"
                }`}
              >
                {tab.label}
              </Text>
              {tab.badge != null && tab.badge > 0 && (
                <View className="ml-1 bg-slate-600 rounded-full px-1.5 min-w-[18px] items-center">
                  <Text className="text-white text-xs">{tab.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab: Info */}
        {activeTab === "info" && (
          <View>
            <View className="bg-slate-800 rounded-2xl border border-slate-700 mb-4">
              <InfoRow icon="card-outline" label="VIN" value={vehicle.vin} />
              <InfoRow icon="car-outline" label="Model" value={vehicle.model} />
              <InfoRow icon="calendar-outline" label="Leto" value={String(vehicle.year)} />
              {vehicle.project_name && (
                <InfoRow icon="folder-outline" label="Projekt" value={vehicle.project_name} />
              )}
            </View>

            {twin && <TwinViewer twin={twin} />}
          </View>
        )}

        {/* Tab: DTC */}
        {activeTab === "dtc" && (
          <View>
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-white font-semibold text-base">
                Aktivne DTC ({activeDtc.length})
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/dtc/new")}
                className="flex-row items-center bg-blue-600 px-3 py-1.5 rounded-xl"
              >
                <Ionicons name="add" size={14} color="white" />
                <Text className="text-white text-xs font-semibold ml-1">
                  Dodaj
                </Text>
              </TouchableOpacity>
            </View>

            {activeDtc.length === 0 ? (
              <View className="items-center py-8 bg-slate-800 rounded-xl border border-slate-700 mb-4">
                <Ionicons
                  name="checkmark-circle-outline"
                  size={32}
                  color="#22c55e"
                />
                <Text className="text-slate-500 mt-2">Ni aktivnih DTC</Text>
              </View>
            ) : (
              activeDtc.map((dtc) => (
                <DtcCard
                  key={dtc.id}
                  dtc={dtc}
                  onResolve={(dtcId) => resolveMutation.mutate(dtcId)}
                  isResolving={resolveMutation.isPending}
                />
              ))
            )}

            {resolvedDtc.length > 0 && (
              <>
                <Text className="text-slate-400 font-medium text-sm mb-3 mt-4">
                  Rešeni DTC ({resolvedDtc.length})
                </Text>
                {resolvedDtc.map((dtc) => (
                  <DtcCard key={dtc.id} dtc={dtc} />
                ))}
              </>
            )}
          </View>
        )}

        {/* Tab: SW Updates */}
        {activeTab === "sw" && (
          <View>
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-white font-semibold text-base">
                SW posodobitve ({swUpdates?.length ?? 0})
              </Text>
              <TouchableOpacity
                onPress={() => router.push(`/sw-updates/new?vehicle_id=${id}`)}
                className="flex-row items-center bg-blue-600 px-3 py-1.5 rounded-xl"
              >
                <Ionicons name="add" size={14} color="white" />
                <Text className="text-white text-xs font-semibold ml-1">
                  Dodaj
                </Text>
              </TouchableOpacity>
            </View>

            {!swUpdates || swUpdates.length === 0 ? (
              <View className="items-center py-8 bg-slate-800 rounded-xl border border-slate-700">
                <Ionicons
                  name="cloud-done-outline"
                  size={32}
                  color="#475569"
                />
                <Text className="text-slate-500 mt-2">
                  Ni SW posodobitev
                </Text>
              </View>
            ) : (
              swUpdates.map((sw) => <SwUpdateCard key={sw.id} update={sw} />)
            )}
          </View>
        )}

        {/* Tab: Photos */}
        {activeTab === "photos" && (
          <View>
            <PhotoGrid
              photos={photos ?? []}
              onAdd={handlePickPhoto}
            />
          </View>
        )}
      </View>
    </ScrollView>
  );
}
