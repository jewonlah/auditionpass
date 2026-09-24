import { NextResponse } from "next/server";
import sharp from "sharp";
import { createServerClient } from "@/lib/supabase/server";
import { profileWriteSchema } from "@/lib/profile/form";
import { profilePhotoWriteError } from "@/lib/profile/photo-write";
import { ownedPhotoPath } from "@/lib/profile/photos";
import { renderProfilePdf } from "@/lib/profile/pdf";
import { MAX_PDF_BYTES } from "@/lib/profile/pdf-storage";
import { checkRateLimit } from "@/lib/rate-limit";
export const maxDuration = 60;

/** Authenticated draft preview: no saved revision, no storage writes, no email. */
export async function POST(req: Request) {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const rate = checkRateLimit(`pdf-preview:${user.id}`, [{ limit: 10, windowMs: 60_000, label: "1분에" }]);
  if (!rate.ok) return NextResponse.json({ error: rate.message }, { status: 429 });
  const raw = await req.text();
  if (raw.length > 32_000) return NextResponse.json({ error: "프로필 내용이 너무 큽니다." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "입력 내용을 확인해주세요." }, { status: 400 }); }
  const parsed = profileWriteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "입력 내용을 확인해주세요." }, { status: 400 });
  const problem = profilePhotoWriteError(parsed.data, user.id, process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (problem) return NextResponse.json(problem, { status: 400 });
  try {
    const photos: Buffer[] = [];
    for (const url of parsed.data.photo_urls ?? []) {
      const { data, error } = await db.storage.from("profiles").download(ownedPhotoPath(url, user.id, process.env.NEXT_PUBLIC_SUPABASE_URL!));
      if (error || !data || data.size > 5 * 1024 * 1024) throw new Error("사진을 불러오지 못했습니다.");
      photos.push(await sharp(Buffer.from(await data.arrayBuffer()), { limitInputPixels: 40_000_000 }).rotate()
        .resize({ width: 1400, height: 1800, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer());
    }
    const bytes = await renderProfilePdf(parsed.data, photos, new Date().toISOString());
    if (bytes.length > MAX_PDF_BYTES) throw new Error("사진 용량을 줄여주세요.");
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "Content-Disposition": 'inline; filename="draft-profile.pdf"' } });
  } catch { return NextResponse.json({ error: "PDF를 준비하지 못했어요. 사진과 입력 내용을 확인해주세요." }, { status: 503 }); }
}
