import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendApplicationEmail } from "@/lib/email/sendApplicationEmail";
import { getMissingFields } from "@/lib/profile";
import { buildApplicationRow, sendFailureResponse } from "@/lib/apply/status";

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();

    // 1. 로그인 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { auditionId } = await req.json();

    if (!auditionId) {
      return NextResponse.json(
        { error: "오디션 ID가 필요합니다." },
        { status: 400 }
      );
    }

    // 2. 미니 프로필(지원 최소 요건) 확인 — 이름·출생연도·성별·분야
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    const missingFields = getMissingFields(profile);
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: "지원에 필요한 프로필 정보가 부족합니다.",
          code: "INCOMPLETE_PROFILE",
          missingFields,
        },
        { status: 400 }
      );
    }

    // 3. 이미 지원한 오디션인지 확인
    //    발송이 실패한(status:'failed') 이력은 "지원함"이 아니다 — 재시도를 막으면 안 된다.
    const { data: existingApplication } = await supabase
      .from("applications")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("audition_id", auditionId)
      .maybeSingle();

    if (existingApplication && existingApplication.status !== "failed") {
      return NextResponse.json(
        { error: "이미 지원한 오디션입니다.", code: "ALREADY_APPLIED" },
        { status: 409 }
      );
    }

    // 3.5. 일일 쿼터 스위치 (2026-08-31 제원 결정: 지금은 무제한, 스위치만 심어둔다)
    //
    // APPLY_DAILY_LIMIT 환경변수가 양수일 때만 작동한다. 미설정·0 = 무제한.
    // BM 확정치는 무료 하루 5건 + 광고 시청 +3건 — 트래픽이 생기면 5로 켜고,
    // 광고 보너스는 그때 별도 컬럼으로 붙인다. 날짜 경계는 KST 자정.
    const dailyLimit = Number(process.env.APPLY_DAILY_LIMIT) || 0;
    if (dailyLimit > 0) {
      const kstMidnight = new Date(
        new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10) + "T00:00:00+09:00"
      ).toISOString();
      const { count: sentToday } = await supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("sent_at", kstMidnight);
      if ((sentToday ?? 0) >= dailyLimit) {
        return NextResponse.json(
          {
            error: `오늘의 원클릭 지원 ${dailyLimit}건을 모두 사용했습니다. 내일 다시 열립니다.`,
            code: "DAILY_LIMIT_REACHED",
            limit: dailyLimit,
          },
          { status: 429 }
        );
      }
    }

    // 4. 오디션 정보 조회
    const { data: audition, error: auditionError } = await supabase
      .from("auditions")
      .select("*")
      .eq("id", auditionId)
      .single();

    if (auditionError || !audition) {
      return NextResponse.json(
        { error: "오디션 정보를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (!audition.apply_email) {
      return NextResponse.json(
        { error: "이 오디션은 이메일 지원이 불가능합니다." },
        { status: 400 }
      );
    }

    // 내려간 공고로는 발송하지 않는다. 상세 페이지는 id로 직접 열리므로,
    // 이미 열어둔 화면·저장한 링크에서 마감·게시중지·격리·suppression된 공고에
    // 그대로 지원이 나가는 경로가 있다.
    if (!audition.is_active) {
      return NextResponse.json(
        {
          error: "지금은 지원할 수 없는 공고입니다. 마감되었거나 확인 중입니다.",
          code: "NOT_ACTIVE",
        },
        { status: 409 }
      );
    }

    // 심각 신고 자동 조치 — 운영자 확인 전까지 대리 발송 금지 (36 §4)
    if (audition.oneclick_blocked) {
      return NextResponse.json(
        {
          error: "신고가 접수되어 지원이 일시 중지된 공고입니다. 확인 후 다시 열립니다.",
          code: "ONECLICK_BLOCKED",
        },
        { status: 409 }
      );
    }

    // 5. 이메일 발송 — Reply-To 에 지원자 주소를 넣어 담당자 답장이 지원자에게 직접 가게 한다
    //    실패해도 여기서 끝내지 않는다 — 이력이 안 남으면 지원 탭에 "발송 실패"가 뜰 수 없고,
    //    유저는 지원했는지조차 알 수 없다 (11 PRD F6, applications/page.tsx 발송 실패 분기).
    let sendError: Error | null = null;
    try {
      await sendApplicationEmail({ audition, profile, replyToEmail: user.email });
    } catch (err) {
      sendError = err instanceof Error ? err : new Error("메일 발송 실패");
    }

    // 6. 지원 이력 저장 — unique(user_id, audition_id) 충돌 시 갱신(재시도로 성공하면 같은 행이 sent로 바뀐다)
    const row = buildApplicationRow({
      userId: user.id,
      auditionId,
      outcome: sendError ? "failed" : "sent",
    });
    const { error: upsertError } = await supabase
      .from("applications")
      .upsert(row, { onConflict: "user_id,audition_id" });

    if (sendError) {
      console.error("[apply] 메일 발송 실패", sendError);
      const { status, body } = sendFailureResponse();
      return NextResponse.json(body, { status });
    }

    if (upsertError) {
      return NextResponse.json(
        { error: "지원 이력 저장에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "지원이 완료되었습니다.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "지원 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
