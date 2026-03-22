import "../global.css";
import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { router } from "expo-router";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import Toast from "react-native-toast-message";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { useAuth } from "@/hooks/useAuth";
import { authApi } from "@/lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60_000,        // 5 min — sveži podatki
      gcTime: 24 * 60 * 60_000,     // 24 ur — cache v AsyncStorage
    },
  },
});

// Persister: shranjuje cache v AsyncStorage za offline dostop
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "eversum-query-cache",
  throttleTime: 1000,
});

// Kako se notifikacija prikaže ko je app v ospredju
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null; // Simulator ne podpira push

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "eVersum alarmi",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#3b82f6",
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}

function RootLayoutInner() {
  const { loadToken, isLoading, isAuthenticated } = useAuth();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    loadToken();
  }, []);

  // Registracija push tokena ko je user avtenticiran
  useEffect(() => {
    if (!isAuthenticated) return;

    registerForPushNotifications().then((token) => {
      if (token) {
        authApi.registerFcmToken(token).catch(() => {
          // Tiho preskoči — ni kritično
        });
      }
    });

    // Poslušalec za notifikacije ko je app odprt
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (_notification) => {
        // Notifikacija prikazana avtomatsko (setNotificationHandler zgoraj)
      }
    );

    // Tap na notifikacijo → navigacija na alarme
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<string, string>;
        if (data?.alarm_type) {
          router.push("/alarms");
        }
      }
    );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated]);

  if (isLoading) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="vehicles/[id]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: "#1e293b" },
            headerTintColor: "#fff",
            headerTitle: "Vozilo",
          }}
        />
        <Stack.Screen
          name="dtc/new"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: "#1e293b" },
            headerTintColor: "#fff",
            headerTitle: "Nov DTC zapis",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="sw-updates/new"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: "#1e293b" },
            headerTintColor: "#fff",
            headerTitle: "Nova SW posodobitev",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="alarms"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: "#1e293b" },
            headerTintColor: "#fff",
            headerTitle: "Alarmi",
          }}
        />
      </Stack>
      <StatusBar style="light" />
      <Toast />
    </>
  );
}

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <RootLayoutInner />
    </PersistQueryClientProvider>
  );
}
