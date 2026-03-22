import React from "react";
import { View, Text, Image, TouchableOpacity, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Photo } from "@/lib/api";

interface PhotoGridProps {
  photos: Photo[];
  onAdd?: () => void;
  onPress?: (photo: Photo) => void;
}

export function PhotoGrid({ photos, onAdd, onPress }: PhotoGridProps) {
  const typeLabels: Record<string, string> = {
    exterior: "Zunanjost",
    interior: "Notranjost",
    damage: "Poškodba",
    service: "Servis",
    diagnostic: "Diagnostika",
    document: "Dokument",
    other: "Ostalo",
  };

  return (
    <View className="bg-slate-800 rounded-2xl border border-slate-700">
      <View className="px-4 py-3 border-b border-slate-700 flex-row justify-between items-center">
        <View className="flex-row items-center">
          <Ionicons name="images-outline" size={16} color="#3b82f6" />
          <Text className="text-white font-semibold text-sm ml-2">
            Fotografije ({photos.length})
          </Text>
        </View>
        {onAdd && (
          <TouchableOpacity
            onPress={onAdd}
            className="flex-row items-center bg-blue-600 px-3 py-1.5 rounded-xl"
          >
            <Ionicons name="camera-outline" size={14} color="white" />
            <Text className="text-white text-xs font-semibold ml-1">Dodaj</Text>
          </TouchableOpacity>
        )}
      </View>

      {photos.length === 0 ? (
        <View className="items-center py-8">
          <Ionicons name="image-outline" size={36} color="#475569" />
          <Text className="text-slate-500 text-xs mt-2">Ni fotografij</Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ padding: 12 }}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => onPress?.(item)}
              activeOpacity={0.8}
              className="mr-3"
            >
              <Image
                source={{ uri: item.url }}
                className="w-24 h-24 rounded-lg bg-slate-700"
                resizeMode="cover"
              />
              <Text className="text-slate-400 text-xs mt-1 text-center">
                {typeLabels[item.photo_type] ?? item.photo_type}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
