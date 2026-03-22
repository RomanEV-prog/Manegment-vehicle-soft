import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VehicleTwin } from "@/lib/api";

interface TwinViewerProps {
  twin: VehicleTwin;
}

function TwinRow({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View className="flex-row items-center px-4 py-3 border-b border-slate-700">
      <Ionicons name={icon as any} size={16} color={color ?? "#94a3b8"} />
      <Text className="text-slate-500 text-xs ml-2.5 flex-1">{label}</Text>
      <Text className="text-white text-xs font-medium">{value}</Text>
    </View>
  );
}

export function TwinViewer({ twin }: TwinViewerProps) {
  const ecuEntries = twin.ecu_config
    ? Object.entries(twin.ecu_config)
    : [];

  return (
    <View className="bg-slate-800 rounded-2xl border border-slate-700">
      <View className="px-4 py-3 border-b border-slate-700 flex-row items-center">
        <Ionicons name="git-network-outline" size={16} color="#3b82f6" />
        <Text className="text-white font-semibold text-sm ml-2">
          Digitalni dvojček
        </Text>
      </View>

      <TwinRow
        icon="warning-outline"
        label="Aktivne DTC"
        value={String(twin.active_dtcs?.length ?? 0)}
        color={
          twin.active_dtcs?.length > 0 ? "#f97316" : "#22c55e"
        }
      />
      <TwinRow
        icon="shield-checkmark-outline"
        label="Homologacija"
        value={twin.hom_status ? JSON.stringify(twin.hom_status) : "—"}
      />
      <TwinRow
        icon="construct-outline"
        label="Zadnji servis"
        value={
          twin.last_service_date
            ? new Date(twin.last_service_date).toLocaleDateString("sl-SI")
            : "—"
        }
      />
      <TwinRow
        icon="cloud-download-outline"
        label="Zadnja SW posodobitev"
        value={
          twin.last_sw_update_date
            ? new Date(twin.last_sw_update_date).toLocaleDateString("sl-SI")
            : "—"
        }
      />
      <TwinRow
        icon="camera-outline"
        label="Posnetki (snapshots)"
        value={String(twin.snapshot_count ?? 0)}
      />

      {ecuEntries.length > 0 && (
        <View className="px-4 py-3">
          <Text className="text-slate-400 text-xs uppercase tracking-widest mb-2">
            ECU konfiguracija
          </Text>
          {ecuEntries.map(([key, val]) => (
            <View key={key} className="flex-row justify-between py-1">
              <Text className="text-slate-400 text-xs">{key}</Text>
              <Text className="text-blue-400 text-xs font-mono">
                {String(val)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View className="px-4 py-2 border-t border-slate-700">
        <Text className="text-slate-600 text-xs">
          Posodobljeno:{" "}
          {new Date(twin.updated_at).toLocaleDateString("sl-SI")}{" "}
          {new Date(twin.updated_at).toLocaleTimeString("sl-SI", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    </View>
  );
}
