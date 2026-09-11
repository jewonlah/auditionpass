"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { PhotoCrop, type CropChoice } from "./PhotoCrop";

interface PhotoUploadProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  maxPhotos?: number;
  onUploadingChange?: (uploading: boolean) => void;
}

export function PhotoUpload({
  photos,
  onChange,
  maxPhotos = 5,
  onUploadingChange,
}: PhotoUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  async function handleUpload(file: File, crop: CropChoice) {
    let completed = false;
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("crop", JSON.stringify(crop));

      const res = await fetch("/api/profile/photos", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        onChange([...photos, data.url]);
        setPendingFile(null);
        completed = true;
      } else {
        toast.error(data.error || "업로드에 실패했습니다.");
      }
    } catch {
      toast.error("네트워크 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      onUploadingChange?.(!completed);
      // 같은 파일 재선택 가능하도록 초기화
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleRemove(url: string) {
    // Removing a draft must not break the persisted profile if the user cancels editing.
    onChange(photos.filter((p) => p !== url));
  }

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-2 block">
        프로필 사진 ({photos.length}/{maxPhotos})
      </label>

      <div className="grid grid-cols-3 gap-2">
        {/* 기존 사진들 */}
        {photos.map((url, index) => (
          <div
            key={url}
            className="relative aspect-[3/4] rounded-lg overflow-hidden bg-gray-100"
          >
            <Image
              src={url}
              alt={index === 0 ? "대표 프로필 사진" : "프로필 사진 " + (index + 1)}
              fill unoptimized sizes="130px"
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => handleRemove(url)}
              aria-label={"사진 " + (index + 1) + " 제외"}
              disabled={uploading}
              className="absolute top-0 right-0 grid size-11 place-items-center rounded-full bg-black/50 text-white transition-colors"
            >
              <X size={14} />
            </button>
            <button type="button" disabled={uploading || index === 0} onClick={() => onChange([url, ...photos.filter((p) => p !== url)])} className="absolute right-0 bottom-0 left-0 min-h-11 bg-black/60 px-1 text-xs font-semibold text-white">{index === 0 ? "대표 사진" : "대표로 선택"}</button>
          </div>
        ))}

        {/* 추가 버튼 */}
        {photos.length < maxPhotos && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={cn(
              "flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 transition-colors",
              uploading
                ? "cursor-not-allowed"
                : "hover:border-primary hover:text-primary"
            )}
          >
            {uploading ? (
              <Loader2 size={24} className="animate-spin" />
            ) : (
              <>
                <Camera size={24} />
                <span className="text-xs">사진 추가</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && file.size <= 5 * 1024 * 1024) { setPendingFile(file); onUploadingChange?.(true); }
          else if (file) toast.error("5MB 이하 사진을 선택해주세요.");
          e.target.value = "";
        }}
        className="hidden"
      />
      {pendingFile && <PhotoCrop key={pendingFile.name + pendingFile.lastModified} file={pendingFile} busy={uploading} onConfirm={(crop) => handleUpload(pendingFile, crop)} onCancel={() => { setPendingFile(null); onUploadingChange?.(false); }} />}

      <p className="mt-1.5 text-xs text-gray-400">
        최대 {maxPhotos}장, 5MB 이하 이미지
      </p>
    </div>
  );
}
