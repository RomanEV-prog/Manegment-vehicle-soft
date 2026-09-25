"use client";

import { create } from "zustand";
import { authApi } from "@/lib/api";
import { setTokens, clearTokens, getCurrentUser, refreshAccessToken } from "@/lib/auth";
import type { JwtPayload, User } from "@/types";

interface AuthState {
  user: User | null;
  payload: JwtPayload | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  init: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  payload: getCurrentUser(),
  isLoading: false,

  init: async () => {
    // dostopni žeton je kratkotrajen — ob ponovnem nalaganju strani ga obnovi iz httpOnly piškota
    if (!getCurrentUser()) await refreshAccessToken();
    const payload = getCurrentUser();
    if (!payload) {
      set({ user: null, payload: null });
      return;
    }
    try {
      const user = await authApi.me();
      set({ user, payload });
    } catch {
      clearTokens();
      set({ user: null, payload: null });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const tokens = await authApi.login(email, password);
      setTokens(tokens.access_token);
      const user = await authApi.me();
      const payload = getCurrentUser();
      set({ user, payload, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      clearTokens();
      set({ user: null, payload: null });
    }
  },
}));
