"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

export type CropChoice = { enabled: boolean; x: number; y: number };
export function PhotoCrop({ file, busy, onConfirm, onCancel }: {
  file: File; busy: boolean; onConfirm: (crop: CropChoice) => void; onCancel: () => void;
}) {
  const [url, setUrl] = useState("");
  const [crop, setCrop] = useState<CropChoice>({ enabled: false, x: 50, y: 50 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    // The URL's acquisition/release must share a lifecycle, including Strict Mode remounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <section className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-white p-4" aria-label="사진 자르기">
    <h3 className="font-semibold">사진 전체를 확인해주세요</h3>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={crop.enabled} disabled={busy} onChange={(e) => setCrop({ ...crop, enabled: e.target.checked })} />3:4 비율로 자르기</label>
    <div className="relative mx-auto aspect-[3/4] w-full max-w-64 overflow-hidden rounded-lg bg-gray-100">
      {url && <Image src={url} alt="업로드할 사진의 자르기 미리보기" fill unoptimized sizes="256px" style={{ objectFit: crop.enabled ? "cover" : "contain", objectPosition: `${crop.x}% ${crop.y}%` }}
        onLoad={(event) => { const image = event.currentTarget; setSize({ width: image.naturalWidth, height: image.naturalHeight }); }} onError={() => setFailed(true)} />}
    </div>
    {crop.enabled && <div className="space-y-2">{(["x", "y"] as const).map((axis) => <label key={axis} className="block text-sm">{axis === "x" ? "좌우 위치" : "상하 위치"}<input className="mt-2 block w-full accent-primary" type="range" min={0} max={100} value={crop[axis]} disabled={busy} onChange={(e) => setCrop({ ...crop, [axis]: Number(e.target.value) })} /></label>)}</div>}
    {size.width > 0 && Math.min(size.width, size.height) < 600 && <p className="text-xs text-amber-700">작은 사진은 PDF에서 흐릿하게 보일 수 있어요. 더 큰 원본을 권장해요.</p>}
    {failed && <p role="alert" className="text-sm text-red-600">사진을 열 수 없습니다. 다른 JPG·PNG·WebP 파일을 선택해주세요.</p>}
    <p className="text-xs text-gray-500">{crop.enabled ? "선택한 구도로 잘라 저장해요. 기기의 원본 파일은 유지돼요." : "사진을 자르지 않고 전체 구도로 저장해요."}</p>
    <div className="flex gap-2"><Button type="button" className="flex-1" disabled={busy || failed || !size.width} onClick={() => onConfirm(crop)}>{busy ? "사진 저장 중…" : "이 사진 사용하기"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>취소</Button></div>
  </section>;
}
