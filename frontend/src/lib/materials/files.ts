export const MATERIAL_BUCKET = "materials";
export const MAX_MATERIAL_BYTES = 3 * 1024 * 1024;
export const MATERIAL_LIMIT = 100;
export const MATERIAL_TYPES: Record<string, { kind: MaterialKind; extension: string }> = {
  "image/jpeg": { kind: "photo", extension: "jpg" },
  "image/png": { kind: "photo", extension: "png" },
  "image/webp": { kind: "photo", extension: "webp" },
  "application/pdf": { kind: "document", extension: "pdf" },
  "video/mp4": { kind: "video", extension: "mp4" },
  "video/webm": { kind: "video", extension: "webm" },
  "audio/mpeg": { kind: "audio", extension: "mp3" },
  "audio/wav": { kind: "audio", extension: "wav" },
};
export type MaterialKind = "photo" | "document" | "video" | "audio";
export type Material = { id: string; name: string; kind: MaterialKind; mime_type: string; size_bytes: number; created_at: string };
export const MATERIAL_LABELS: Record<MaterialKind, string> = { photo: "사진", document: "PDF", video: "영상", audio: "음성" };
export const MATERIAL_COLUMNS = "id,name,kind,mime_type,size_bytes,created_at";

export function materialFileError(file: { size: number; type: string; name: string }): string | null {
  if (!file.size) return "비어 있는 파일은 올릴 수 없어요.";
  if (file.size > MAX_MATERIAL_BYTES) return "파일당 3MB까지 올릴 수 있어요. 큰 영상은 프로필에 링크로 추가해 주세요.";
  if (!Object.hasOwn(MATERIAL_TYPES, file.type)) return "JPG, PNG, WebP, PDF, MP4, WebM, MP3, WAV 파일을 선택해 주세요.";
  if (!file.name.trim() || file.name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(file.name)) return "파일 이름은 경로 기호 없이 180자 이내로 입력해 주세요.";
  return null;
}

/** Reject obvious MIME spoofing; files are downloaded as attachments, never executed inline. */
export function hasMaterialSignature(bytes: Uint8Array, mime: string): boolean {
  const text = (start: number, end: number) => new TextDecoder().decode(bytes.slice(start, end));
  const starts = (...prefix: number[]) => prefix.every((v, i) => bytes[i] === v);
  if (mime === "image/jpeg") return starts(255, 216, 255);
  if (mime === "image/png") return starts(137, 80, 78, 71, 13, 10, 26, 10);
  if (mime === "image/webp") return text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
  if (mime === "application/pdf") return text(0, 5) === "%PDF-";
  if (mime === "video/mp4") return bytes.length >= 12 && text(4, 8) === "ftyp";
  if (mime === "video/webm") return starts(0x1a, 0x45, 0xdf, 0xa3);
  if (mime === "audio/mpeg") return text(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0);
  if (mime === "audio/wav") return text(0, 4) === "RIFF" && text(8, 12) === "WAVE";
  return false;
}
