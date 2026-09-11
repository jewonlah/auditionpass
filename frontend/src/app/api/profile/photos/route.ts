import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import sharp from "sharp";
import { z } from "zod";
import { cropRectangle } from "@/lib/profile/photos";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { withAccountFileOperation } from "@/lib/account/file-lifecycle";

// POST /api/profile/photos — 사진 업로드
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }

  // 파일 크기 제한 (5MB)
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "파일 크기는 5MB 이하여야 합니다" },
      { status: 400 }
    );
  }

  // 이미지 타입 확인
  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  if (!extensions[file.type]) {
    return NextResponse.json(
      { error: "JPG, PNG, WebP 사진을 선택해주세요" },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid = file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : file.type === "image/png" ? [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)
    : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (!valid) return NextResponse.json({ error: "사진 파일을 확인해주세요." }, { status: 400 });
  const crop = z.object({ enabled: z.boolean(), x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).safeParse(
    (() => { try { return JSON.parse(String(formData.get("crop") || '{"enabled":false,"x":50,"y":50}')); } catch { return null; } })(),
  );
  if (!crop.success) return NextResponse.json({ error: "사진의 자를 위치를 확인해주세요." }, { status: 400 });
  let image: Buffer;
  let width: number, height: number;
  try {
    const rotated = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().toBuffer({ resolveWithObject: true });
    let pipeline = sharp(rotated.data, { limitInputPixels: 40_000_000 });
    if (crop.data.enabled) pipeline = pipeline.extract(cropRectangle(rotated.info.width, rotated.info.height, crop.data.x, crop.data.y));
    const output = await pipeline.resize({ width: 1600, height: 2133, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
    image = output.data; width = output.info.width; height = output.info.height;
  } catch { return NextResponse.json({ error: "사진을 처리하지 못했습니다. 해상도와 파일 형식을 확인해주세요." }, { status: 400 }); }
  const filePath = `${user.id}/${crypto.randomUUID()}.jpg`;

  try {
    return await withAccountFileOperation(createServiceRoleClient(), user.id, async (write) => {
      write.startWrite();
      const { error: uploadError } = await supabase.storage
        .from("profiles")
        .upload(filePath, image, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (!uploadError) write.finishWrite();

      if (uploadError) {
        return NextResponse.json(
          { error: "업로드 실패: " + uploadError.message },
          { status: 500 }
        );
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("profiles").getPublicUrl(filePath);

      return NextResponse.json({ url: publicUrl, width, height }, { status: 201 });
    });
  } catch {
    return NextResponse.json({ error: "사진을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.", code: "PHOTO_UPLOAD_UNAVAILABLE" }, { status: 503 });
  }
}

// DELETE /api/profile/photos — 사진 삭제
export async function DELETE(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const url = body?.url;
  if (typeof url !== "string") return NextResponse.json({ error: "사진 정보를 확인해주세요." }, { status: 400 });

  // URL에서 파일 경로 추출
  const path = url.split("/profiles/").pop();
  if (!path || !path.startsWith(user.id + "/")) {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  // Old open tabs used to physically delete files on edit. Saved versions still need them.
  // Until a version-aware retention workflow exists, removal is only from the editor.
  return NextResponse.json({
    error: "저장한 프로필에 쓰일 수 있는 사진입니다. 프로필 편집에서 사진을 제외한 뒤 저장해주세요.",
    code: "PHOTO_RETENTION_REQUIRED",
  }, { status: 409 });
}
