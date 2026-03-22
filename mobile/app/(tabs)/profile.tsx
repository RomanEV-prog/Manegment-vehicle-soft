import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { alarmsApi } from "@/lib/api";

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const { data: alarms } = useQuery({
    queryKey: ["alarms", "unread"],
    queryFn: () => alarmsApi.list({ is_read: false, limit: 50 }).then((r) => r.data),
  });

  const unreadCount = alarms?.length ?? 0;

  const handleLogout = () => {
    Alert.alert("Odjava", "Si prepričan, da se želiš odjaviti?", [
      { text: "Prekliči", style: "cancel" },
      {
        text: "Odjavi se",
        style: "destructive",
        onPress: logout,
      },
    ]);
  };

  const roleLabel: Record<string, string> = {
    admin: "Administrator",
    technician: "Tehnik",
    manager: "Vodja",
  };

  return (
    <ScrollView className="flex-1 bg-slate-900">
      <View className="px-6 py-8">
        <View className="items-center mb-8">
          <View className="w-20 h-20 bg-blue-600 rounded-full items-center justify-center mb-4">
            <Text className="text-white text-3xl font-bold">
              {user?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
            </Text>
          </View>
          <Text className="text-white text-xl font-bold">{user?.full_name}</Text>
          <Text className="text-slate-400 mt-1">{user?.email}</Text>
          {user?.role && (
            <View className="mt-2 bg-blue-900 px-3 py-1 rounded-full">
              <Text className="text-blue-300 text-sm">
                {roleLabel[user.role] ?? user.role}
              </Text>
            </View>
          )}
        </View>

        <View className="bg-slate-800 rounded-2xl border border-slate-700 mb-6">
          <View className="px-4 py-3 border-b border-slate-700">
            <Text className="text-slate-400 text-xs uppercase tracking-widest">
              Podatki
            </Text>
          </View>

          <View className="px-4 py-3 flex-row items-center border-b border-slate-700">
            <Ionicons name="person-outline" size={18} color="#94a3b8" />
            <View className="ml-3 flex-1">
              <Text className="text-slate-500 text-xs">Ime in priimek</Text>
              <Text className="text-white mt-0.5">{user?.full_name ?? "—"}</Text>
            </View>
          </View>

          <View className="px-4 py-3 flex-row items-center border-b border-slate-700">
            <Ionicons name="mail-outline" size={18} color="#94a3b8" />
            <View className="ml-3 flex-1">
              <Text className="text-slate-500 text-xs">E-mail</Text>
              <Text className="text-white mt-0.5">{user?.email ?? "—"}</Text>
            </View>
          </View>

          <View className="px-4 py-3 flex-row items-center">
            <Ionicons name="shield-outline" size={18} color="#94a3b8" />
            <View className="ml-3 flex-1">
              <Text className="text-slate-500 text-xs">Vloga</Text>
              <Text className="text-white mt-0.5">
                {user?.role ? (roleLabel[user.role] ?? user.role) : "—"}
              </Text>
            </View>
          </View>
        </View>

        <View className="bg-slate-800 rounded-2xl border border-slate-700 mb-6">
          <View className="px-4 py-3 border-b border-slate-700">
            <Text className="text-slate-400 text-xs uppercase tracking-widest">
              Aplikacija
            </Text>
          </View>
          <View className="px-4 py-3 flex-row items-center">
            <Ionicons name="information-circle-outline" size={18} color="#94a3b8" />
            <View className="ml-3">
              <Text className="text-slate-500 text-xs">Verzija</Text>
              <Text className="text-white mt-0.5">eVersum Mobile 1.0.0</Text>
            </View>
          </View>
        </View>

        {/* Alarmi */}
        <TouchableOpacity
          onPress={() => router.push("/alarms")}
          className="bg-slate-800 rounded-2xl border border-slate-700 mb-6 px-4 py-4 flex-row items-center"
          activeOpacity={0.7}
        >
          <View className="w-10 h-10 bg-orange-900/40 rounded-full items-center justify-center">
            <Ionicons name="notifications-outline" size={20} color="#f97316" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-white font-semibold">Alarmi</Text>
            <Text className="text-slate-400 text-xs">
              {unreadCount > 0 ? `${unreadCount} neprebranih` : "Ni novih alarmov"}
            </Text>
          </View>
          {unreadCount > 0 && (
            <View className="bg-red-600 rounded-full w-6 h-6 items-center justify-center mr-2">
              <Text className="text-white text-xs font-bold">{unreadCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color="#64748b" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleLogout}
          className="bg-red-900 border border-red-700 rounded-2xl px-6 py-4 flex-row items-center justify-center"
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color="#f87171" />
          <Text className="text-red-400 font-semibold ml-2">Odjava</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
