import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Profile } from "@/types";
import { renderProfilePdf } from "./pdf";
import { ownedPhotoPath } from "./photos";
import { withAccountFileOperation } from "../account/file-lifecycle";

export type SavedProfile = { id: string; user_id: string; profile: Profile; created_at: string };
export const PDF_BUCKET = "profile-documents";
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

/** Caller must authenticate and read this version with user-scoped RLS first. */
export async function getOrCreateProfilePdf(db: SupabaseClient, version: SavedProfile, userId: string): Promise<Buffer> {
  if (version.user_id !== userId) throw Error("프로필 조회 권한이 없습니다.");
  if ((version.profile.photo_urls?.length ?? 0) > 5) throw Error("사진은 최대 5장까지 사용할 수 있습니다.");
  return withAccountFileOperation(db, userId, async (write) => {
    const objectPath = `${userId}/${version.id}.pdf`;
    const bucket = db.storage.from(PDF_BUCKET);
    const existing = await bucket.download(objectPath);
    if (existing.data) return Buffer.from(await existing.data.arrayBuffer());
    if (existing.error && !/not found|does not exist/i.test(existing.error.message)) throw Error("PDF 저장소를 확인하지 못했습니다.");
    const photos: Buffer[] = [];
    for (const url of version.profile.photo_urls ?? []) {
      const photoPath = ownedPhotoPath(url, userId, process.env.NEXT_PUBLIC_SUPABASE_URL!);
      const { data, error } = await db.storage.from("profiles").download(photoPath);
      if (error || !data || data.size > 5 * 1024 * 1024) throw Error("프로필 사진을 불러오지 못했습니다. 사진을 확인해주세요.");
      photos.push(await sharp(Buffer.from(await data.arrayBuffer()), { limitInputPixels: 40_000_000 })
        .rotate().resize({ width: 1400, height: 1800, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer());
    }
    const bytes = await renderProfilePdf(version.profile, photos, version.created_at);
    if (bytes.length > MAX_PDF_BYTES) throw Error("PDF 용량이 큽니다. 사진 수를 줄여 새 버전으로 저장해주세요.");
    write.startWrite();
    const uploaded = await bucket.upload(objectPath, bytes, { contentType: "application/pdf", upsert: false });
    // A definite successful response or conflict means the remote write has ended.
    if (!uploaded.error || String(uploaded.error.statusCode) === "409") write.finishWrite();
    if (!uploaded.error) return bytes;
    // Another request may have won. Return only its immutable stored bytes.
    const winner = await bucket.download(objectPath);
    if (winner.error || !winner.data) throw Error("PDF를 보관하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return Buffer.from(await winner.data.arrayBuffer());
  });
}
