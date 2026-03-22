import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useAuth } from "@/hooks/useAuth";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Toast.show({ type: "error", text1: "Vnesi email in geslo" });
      return;
    }

    setIsLoading(true);
    try {
      await login({ email: email.trim(), password });
    } catch (err: any) {
      const msg =
        err.response?.data?.detail || "Napaka pri prijavi. Preveri podatke.";
      Toast.show({ type: "error", text1: "Napaka", text2: msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-slate-900"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center px-6 py-12">
          <View className="items-center mb-10">
            <View className="w-16 h-16 bg-blue-600 rounded-2xl items-center justify-center mb-4">
              <Ionicons name="car-sport" size={32} color="white" />
            </View>
            <Text className="text-white text-3xl font-bold">eVersum</Text>
            <Text className="text-slate-400 mt-1">Upravljanje vozil</Text>
          </View>

          <View className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <Text className="text-white text-xl font-semibold mb-6">
              Prijava
            </Text>

            <View className="mb-4">
              <Text className="text-slate-400 text-sm mb-2">E-mail</Text>
              <View className="flex-row items-center bg-slate-900 rounded-xl px-4 py-3 border border-slate-600">
                <Ionicons name="mail-outline" size={18} color="#94a3b8" />
                <TextInput
                  className="flex-1 text-white ml-3"
                  placeholder="tehnik@eversum.si"
                  placeholderTextColor="#475569"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View className="mb-6">
              <Text className="text-slate-400 text-sm mb-2">Geslo</Text>
              <View className="flex-row items-center bg-slate-900 rounded-xl px-4 py-3 border border-slate-600">
                <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" />
                <TextInput
                  className="flex-1 text-white ml-3"
                  placeholder="••••••••"
                  placeholderTextColor="#475569"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color="#94a3b8"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleLogin}
              disabled={isLoading}
              className="bg-blue-600 rounded-xl py-4 items-center"
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  Prijava
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
