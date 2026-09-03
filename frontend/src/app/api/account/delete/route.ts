import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { buildDeletionPlan, type DeletionStep } from "@/lib/account/deletion-plan";

/**
 * POST /api/account/delete — 회원 탈퇴 (자기서비스).
 *
 * 근거: 11_prd F3, 개인정보처리방침 §6("회원 탈퇴 시 즉시 파기"), MY > 회원 탈퇴.
 * 이 라우트가 생기기 전까지 탈퇴는 메일 문의로만 가능했고, 처리방침 문구와 실제가 어긋나 있었다.
 *
 * ── service role 을 쓰는 이유 (최소 범위) ──
 * 1) `auth.admin.deleteUser` 는 service role 로만 호출할 수 있다 (사용자 토큰으로는 불가).
 * 2) Storage `profiles` 버킷의 오브젝트 정리는 버킷 정책에 의존하지 않고 확실히 끝나야 한다.
 *    사진이 남으면 공개 URL 로 계속 접근 가능하다 = 파기 실패.
 * 3) community_posts/comments 는 is_active=false 로 내리는데, 소유자 RLS(update using auth.uid()=user_id)
 *    로도 가능하지만 위 1)·2)와 한 트랜잭션적 흐름으로 묶어 부분 실패 지점을 한 곳에서 보고한다.
 *
 * 권한 경계: **대상 user_id 는 요청 본문에서 받지 않는다.** 반드시 쿠키 세션에서 나온 값만 쓴다.
 * 본문에서 받으면 로그인한 아무나 남의 계정을 지울 수 있는 치명적 권한 상승이 된다.
 * service role 키는 서버에서만 읽히며 응답 어디에도 싣지 않는다.
 *
 * 삭제 순서·근거는 @/lib/account/deletion-plan (테스트로 고정).
 */
export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const userId = user.id;

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    // 키 미설정 — 사용자에게 원인을 노출하지 않는다.
    console.error("[account/delete] service role 클라이언트 생성 실패");
    return NextResponse.json(
      { error: "탈퇴 처리를 시작할 수 없습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }

  const plan = buildDeletionPlan();

  for (const step of plan) {
    if (!step.executed) continue;

    const failure = await runStep(admin, userId, step);
    if (failure) {
      // 서버 로그에만 상세. 응답에는 어디서 멈췄는지만 한국어로.
      console.error(`[account/delete] step=${step.key} user=${userId}`, failure);
      return NextResponse.json(
        {
          error: `탈퇴 처리 중 "${step.label}" 단계에서 실패했습니다. 잠시 후 다시 시도하시거나 support@auditionpass.co.kr 로 문의해주세요.`,
          step: step.key,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}

type Admin = ReturnType<typeof createServiceRoleClient>;

/** 한 단계 실행. 성공이면 null, 실패면 에러 메시지 문자열. */
async function runStep(
  admin: Admin,
  userId: string,
  step: DeletionStep
): Promise<string | null> {
  switch (step.mode) {
    case "storage":
      return removeProfilePhotos(admin, userId);

    case "delete": {
      const { error } = await admin
        .from(step.target)
        .delete()
        .eq(step.column!, userId);
      return error ? error.message : null;
    }

    case "soft_delete": {
      const { error } = await admin
        .from(step.target)
        .update({ is_active: false })
        .eq(step.column!, userId);
      return error ? error.message : null;
    }

    case "auth": {
      const { error } = await admin.auth.admin.deleteUser(userId);
      return error ? error.message : null;
    }

    default:
      return null;
  }
}

/**
 * Storage `profiles` 버킷에서 `${userId}/` 아래 전부 삭제.
 * 경로 규칙은 app/api/profile/photos (업로드 `${user.id}/${Date.now()}.${ext}`).
 * FK CASCADE 밖이라 여기서 지우지 않으면 공개 URL 로 계속 접근 가능한 사진이 남는다.
 */
const LIST_PAGE = 100;
/** 무한 루프 방지 상한 (프로필 사진은 5장 제한이지만 과거 잔여물까지 넉넉히) */
const MAX_PAGES = 20;

async function removeProfilePhotos(admin: Admin, userId: string): Promise<string | null> {
  const paths: string[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await admin.storage
      .from("profiles")
      .list(userId, { limit: LIST_PAGE, offset: page * LIST_PAGE });

    if (error) return `list: ${error.message}`;
    if (!data || data.length === 0) break;

    for (const entry of data) {
      // 폴더(하위 prefix)는 name 만 있고 id 가 null 로 온다 — 현재 경로 규칙엔 없지만 방어.
      if (!entry.id) continue;
      paths.push(`${userId}/${entry.name}`);
    }

    if (data.length < LIST_PAGE) break;
  }

  if (paths.length === 0) return null;

  const { error } = await admin.storage.from("profiles").remove(paths);
  return error ? `remove: ${error.message}` : null;
}
