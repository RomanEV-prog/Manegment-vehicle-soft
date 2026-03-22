import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { vehiclesApi, Vehicle } from "@/lib/api";

interface Props {
  value: string | null;            // vehicle id
  onChange: (vehicle: Vehicle) => void;
  placeholder?: string;
}

export function VehiclePicker({ value, onChange, placeholder = "Izberi vozilo..." }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => vehiclesApi.list().then((r) => r.data),
    staleTime: 2 * 60_000,
  });

  const selected = vehicles.find((v) => v.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return vehicles;
    const q = search.toLowerCase();
    return vehicles.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.vin.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q)
    );
  }, [vehicles, search]);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        className="bg-slate-900 rounded-xl px-4 py-3 border border-slate-600 flex-row items-center justify-between"
      >
        <View className="flex-1">
          {selected ? (
            <>
              <Text className="text-white text-sm font-medium">{selected.name}</Text>
              <Text className="text-slate-500 text-xs font-mono">{selected.vin}</Text>
            </>
          ) : (
            <Text className="text-slate-500 text-sm">{placeholder}</Text>
          )}
        </View>
        <Ionicons name="chevron-down" size={18} color="#64748b" />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/50" onPress={() => setOpen(false)} />
        <View className="bg-slate-800 rounded-t-3xl p-4 max-h-[70%]">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-white text-base font-bold">Izberi vozilo</Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Ionicons name="close" size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <View className="bg-slate-900 rounded-xl flex-row items-center px-3 py-2 border border-slate-700 mb-3">
            <Ionicons name="search-outline" size={16} color="#94a3b8" />
            <TextInput
              className="flex-1 text-white ml-2 text-sm"
              placeholder="Ime, VIN, model..."
              placeholderTextColor="#475569"
              value={search}
              onChangeText={setSearch}
              autoFocus
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color="#64748b" />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(v) => v.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                  setSearch("");
                }}
                className={`flex-row items-center px-3 py-3 rounded-xl mb-1 ${
                  item.id === value ? "bg-blue-900/50 border border-blue-700" : ""
                }`}
              >
                <View className="bg-slate-700 rounded-lg w-9 h-9 items-center justify-center mr-3">
                  <Ionicons name="car-sport-outline" size={18} color="#94a3b8" />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-sm font-medium">{item.name}</Text>
                  <Text className="text-slate-500 text-xs font-mono">{item.vin}</Text>
                </View>
                <View
                  className={`px-2 py-0.5 rounded-full ${
                    item.status === "active"
                      ? "bg-green-900/50"
                      : item.status === "in_service"
                      ? "bg-amber-900/50"
                      : "bg-slate-700"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      item.status === "active"
                        ? "text-green-400"
                        : item.status === "in_service"
                        ? "text-amber-400"
                        : "text-slate-400"
                    }`}
                  >
                    {item.status === "active"
                      ? "Aktiven"
                      : item.status === "in_service"
                      ? "Servis"
                      : item.status === "shipped"
                      ? "Odpremljeno"
                      : "Izločen"}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View className="items-center py-8">
                <Text className="text-slate-500">Ni vozil</Text>
              </View>
            }
          />
        </View>
      </Modal>
    </>
  );
}
