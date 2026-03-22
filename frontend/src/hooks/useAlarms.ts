"use client";

import { useEffect, useRef, useCallback } from "react";
import { create } from "zustand";
import { getAccessToken } from "@/lib/auth";
import type { AlarmEvent } from "@/types";
import toast from "react-hot-toast";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

interface AlarmsState {
  alarms: AlarmEvent[];
  unreadCount: number;
  connected: boolean;
  addAlarm: (alarm: AlarmEvent) => void;
  setAlarms: (alarms: AlarmEvent[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export const useAlarmsStore = create<AlarmsState>((set) => ({
  alarms: [],
  unreadCount: 0,
  connected: false,

  addAlarm: (alarm) =>
    set((state) => ({
      alarms: [alarm, ...state.alarms],
      unreadCount: state.unreadCount + (alarm.is_read ? 0 : 1),
    })),

  setAlarms: (alarms) =>
    set({
      alarms,
      unreadCount: alarms.filter((a) => !a.is_read).length,
    }),

  markRead: (id) =>
    set((state) => ({
      alarms: state.alarms.map((a) =>
        a.id === id ? { ...a, is_read: true } : a
      ),
      unreadCount: Math.max(
        0,
        state.alarms.filter((a) => !a.is_read && a.id !== id).length
      ),
    })),

  markAllRead: () =>
    set((state) => ({
      alarms: state.alarms.map((a) => ({ ...a, is_read: true })),
      unreadCount: 0,
    })),
}));

export function useAlarmSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addAlarm = useAlarmsStore((s) => s.addAlarm);

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;

    const ws = new WebSocket(`${WS_URL}/ws/alarms?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      useAlarmsStore.setState({ connected: true });
    };

    ws.onmessage = (event) => {
      try {
        const alarm: AlarmEvent = JSON.parse(event.data);
        addAlarm(alarm);

        const toastFn =
          alarm.severity === "critical" || alarm.severity === "warning"
            ? toast.error
            : toast.success;
        toastFn(alarm.title, { duration: 5000 });
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      useAlarmsStore.setState({ connected: false });
      reconnectTimer.current = setTimeout(connect, 5000);
    };

    ws.onerror = () => ws.close();
  }, [addAlarm]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);
}
