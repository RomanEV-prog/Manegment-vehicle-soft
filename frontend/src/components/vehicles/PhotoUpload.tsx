"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { photosApi } from "@/lib/api";
import { Upload, X, ImageIcon } from "lucide-react";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";

interface Props {
  vehicleId: string;
  /** Opcijsko — poveže foto z določenim zapisom (npr. homologacijo) */
  linkedToType?: string;
  linkedToId?: string;
  /** Callback po uspešnem uploadu */
  onSuccess?: () => void;
}

const PHOTO_TYPES = ["exterior", "interior", "damage", "service", "diagnostic", "document", "other"];
const MAX_SIZE_MB = 20;

export function PhotoUpload({ vehicleId, linkedToType, linkedToId, onSuccess }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [photoType, setPhotoType] = useState(linkedToType === "homologation" ? "document" : "exterior");

  const handleFile = (file: File) => {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Datoteka je prevelika (max ${MAX_SIZE_MB} MB)`);
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Samo slike so dovoljene");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const extra: Record<string, string> = { photo_type: photoType };
      if (linkedToType) extra.linked_to_type = linkedToType;
      if (linkedToId) extra.linked_to_id = linkedToId;
      return photosApi.upload(vehicleId, preview!.file, extra);
    },
    onSuccess: () => {
      toast.success("Fotografija naložena");
      qc.invalidateQueries({ queryKey: ["photos", vehicleId] });
      if (linkedToId) {
        qc.invalidateQueries({ queryKey: ["photos-hom", linkedToId] });
      }
      if (preview) URL.revokeObjectURL(preview.url);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      onSuccess?.();
    },
    onError: (e: AxiosError<{ detail: string }>) => {
      toast.error(e.response?.data?.detail ?? "Napaka pri nalaganju");
    },
  });

  return (
    <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-4">
      {preview ? (
        <div className="flex items-start gap-4">
          {/* Preview */}
          <div className="relative flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt="preview"
              className="h-24 w-32 rounded-lg object-cover"
            />
            <button
              onClick={() => {
                URL.revokeObjectURL(preview.url);
                setPreview(null);
              }}
              className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 shadow"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          {/* Options */}
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-gray-700 truncate">{preview.file.name}</p>
            <p className="text-xs text-gray-400">
              {(preview.file.size / 1024 / 1024).toFixed(1)} MB
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Tip fotografije</label>
              <select
                value={photoType}
                onChange={(e) => setPhotoType(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm"
              >
                {PHOTO_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />}
              Naloži
            </Button>
          </div>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center gap-2 py-4">
          <ImageIcon className="h-8 w-8 text-gray-300" />
          <span className="text-sm text-gray-500">
            Povleci fotografijo ali <span className="text-blue-600">klikni za izbiro</span>
          </span>
          <span className="text-xs text-gray-400">PNG, JPG, WEBP — max {MAX_SIZE_MB} MB</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
      )}
    </div>
  );
}
