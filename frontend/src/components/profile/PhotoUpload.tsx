"use client";

import { useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhotoUploadProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  maxPhotos?: number;
}

export function PhotoUpload({
  photos,
  onChange,
  maxPhotos = 5,
}: PhotoUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/profile/photos", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        onChange([...photos, data.url]);
      } else {
        alert(data.error || "업로드에 실패했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      // 같은 파일 재선택 가능하도록 초기화
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove(url: string) {
    try {
      await fetch("/api/profile/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
    } catch {
      // Storage 삭제 실패해도 목록에서는 제거
    }
    onChange(photos.filter((p) => p !== url));
  }

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-2 block">
        프로필 사진 ({photos.length}/{maxPhotos})
      </label>

      <div className="grid grid-cols-3 gap-2">
        {/* 기존 사진들 */}
        {photos.map((url) => (
          <div
            key={url}
            className="relative aspect-[3/4] rounded-lg overflow-hidden bg-gray-100"
          >
            <img
              src={url}
              alt="프로필 사진"
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => handleRemove(url)}
              className="absolute top-1 right-1 rounded-full bg-black/50 p-1 text-white hover:bg-black/70 transition-colors"
            >
              <X size={14} />
            </button>
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
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />

      <p className="mt-1.5 text-xs text-gray-400">
        최대 {maxPhotos}장, 5MB 이하 이미지
      </p>
    </div>
  );
}
