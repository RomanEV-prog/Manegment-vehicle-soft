import React from "react";
import { ActivityIndicator, View } from "react-native";

interface LoadingSpinnerProps {
  size?: "small" | "large";
  fullScreen?: boolean;
}

export function LoadingSpinner({ size = "large", fullScreen = false }: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-900">
        <ActivityIndicator size={size} color="#3b82f6" />
      </View>
    );
  }

  return (
    <View className="py-8 items-center">
      <ActivityIndicator size={size} color="#3b82f6" />
    </View>
  );
}
