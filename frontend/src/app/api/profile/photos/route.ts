import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

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
  const file = formData.get("file") as File | null;

  if (!file) {
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
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "이미지 파일만 업로드 가능합니다" },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop() || "jpg";
  const filePath = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("profiles")
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "업로드 실패: " + uploadError.message },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("profiles").getPublicUrl(filePath);

  return NextResponse.json({ url: publicUrl }, { status: 201 });
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

  const { url } = await request.json();

  // URL에서 파일 경로 추출
  const path = url.split("/profiles/").pop();
  if (!path || !path.startsWith(user.id + "/")) {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  const { error } = await supabase.storage
    .from("profiles")
    .remove([path]);

  if (error) {
    return NextResponse.json(
      { error: "삭제 실패: " + error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
