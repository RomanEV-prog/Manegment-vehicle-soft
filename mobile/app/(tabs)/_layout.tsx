import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/hooks/useAuth";
import { Redirect, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { alarmsApi } from "@/lib/api";

function AlarmBell() {
  const { data: alarms } = useQuery({
    queryKey: ["alarms", "unread"],
    queryFn: () => alarmsApi.list({ is_read: false, limit: 50 }).then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
    gcTime: 24 * 60 * 60_000,
  });

  const count = alarms?.length ?? 0;

  return (
    <TouchableOpacity
      onPress={() => router.push("/alarms")}
      className="mr-4 relative"
    >
      <Ionicons name="notifications-outline" size={22} color="#fff" />
      {count > 0 && (
        <View className="absolute -top-1 -right-1 bg-red-600 rounded-full w-4 h-4 items-center justify-center">
          <Text className="text-white text-[9px] font-bold">
            {count > 9 ? "9+" : count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: "#1e293b",
          borderTopColor: "#334155",
        },
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: "#64748b",
        headerStyle: { backgroundColor: "#1e293b" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "bold" },
        headerRight: () => <AlarmBell />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Pregled",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
          headerTitle: "Pregled flote",
        }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{
          title: "Vozila",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="car-sport-outline" size={size} color={color} />
          ),
          headerTitle: "Vozila",
        }}
      />
      <Tabs.Screen
        name="dtc"
        options={{
          title: "DTC",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="warning-outline" size={size} color={color} />
          ),
          headerTitle: "DTC kode",
        }}
      />
      <Tabs.Screen
        name="sw"
        options={{
          title: "SW",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="hardware-chip-outline" size={size} color={color} />
          ),
          headerTitle: "SW posodobitve",
        }}
      />
      <Tabs.Screen
        name="obd"
        options={{
          title: "OBD",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pulse-outline" size={size} color={color} />
          ),
          headerTitle: "OBD Diagnostika",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
          headerTitle: "Profil",
        }}
      />
      {/* Service je še vedno dosegljiv, ni pa v tab baru */}
      <Tabs.Screen
        name="service"
        options={{
          href: null,
          headerTitle: "Servisni zapisi",
        }}
      />
    </Tabs>
  );
}
