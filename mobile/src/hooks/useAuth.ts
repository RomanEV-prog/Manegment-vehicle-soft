import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { authApi, LoginPayload, User } from "@/lib/api";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  loadToken: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  loadToken: async () => {
    try {
      const token = await SecureStore.getItemAsync("auth_token");
      if (token) {
        const res = await authApi.me();
        set({ token, user: res.data, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false, isAuthenticated: false });
      }
    } catch {
      await SecureStore.deleteItemAsync("auth_token");
      set({ isLoading: false, isAuthenticated: false, token: null, user: null });
    }
  },

  login: async (payload) => {
    const res = await authApi.login(payload);
    const { access_token } = res.data;
    await SecureStore.setItemAsync("auth_token", access_token);
    const me = await authApi.me();
    set({ token: access_token, user: me.data, isAuthenticated: true });
    router.replace("/(tabs)/vehicles");
  },

  logout: async () => {
    await SecureStore.deleteItemAsync("auth_token");
    set({ token: null, user: null, isAuthenticated: false });
    router.replace("/(auth)/login");
  },
}));
