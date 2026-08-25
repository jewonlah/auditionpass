import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";
import { evaluateSingle } from "@/lib/admin/queue";

// 어드민 검수 액션 (39 §2): 승인 게이트는 서버에서 재판정해 강제한다.
// - approve: SAFE 즉시 / CHECK는 confirmed=true 필요 / BLOCKED 403
// - reject · quarantine: 게이트 무관 (안전 방향)
// - undo: admin_actions.prev 스냅샷으로 복원
// 승인 = 게시만(publish only). 원클릭·trust 승격은 이 API에 없음 (승인 범위 3분리).

type ActionBody = {
  action: "approve" | "reject" | "quarantine" | "undo";
  auditionId?: string;
  actionId?: number;
  confirmed?: boolean;
};

const TRANSITIONS: Record<string, { review_status: string; is_active: boolean }> = {
  approve: { review_status: "approved", is_active: true },
  reject: { review_status: "rejected", is_active: false },
  quarantine: { review_status: "quarantine", is_active: false },
};

export async function POST(req: Request) {
  try {
    const admin = await getAdminEmail();
    if (!admin) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const body = (await req.json()) as ActionBody;
    const supabase = createAdminServiceClient();

    if (body.action === "undo") {
      if (!body.actionId) {
        return NextResponse.json({ error: "actionId가 필요합니다." }, { status: 400 });
      }
      const { data: original } = await supabase
        .from("admin_actions")
        .select("*")
        .eq("id", body.actionId)
        .maybeSingle();
      if (!original) {
        return NextResponse.json({ error: "액션을 찾을 수 없습니다." }, { status: 404 });
      }
      if (original.action === "undo" || original.undone_by) {
        return NextResponse.json(
          { error: "이미 되돌렸거나 되돌릴 수 없는 액션입니다." },
          { status: 409 }
        );
      }
      if (!original.audition_id || !original.prev) {
        return NextResponse.json({ error: "복원 정보가 없습니다." }, { status: 409 });
      }

      const { error: revertError } = await supabase
        .from("auditions")
        .update(original.prev)
        .eq("id", original.audition_id);
      if (revertError) {
        return NextResponse.json({ error: `복원 실패: ${revertError.message}` }, { status: 500 });
      }

      const { data: undoLog } = await supabase
        .from("admin_actions")
        .insert({
          actor_email: admin,
          action: "undo",
          audition_id: original.audition_id,
          audition_title: original.audition_title,
          prev: original.next,
          next: original.prev,
          note: `undo of #${original.id}`,
        })
        .select("id")
        .maybeSingle();
      if (undoLog) {
        await supabase
          .from("admin_actions")
          .update({ undone_by: undoLog.id })
          .eq("id", original.id);
      }
      return NextResponse.json({ success: true });
    }

    // approve / reject / quarantine
    if (!body.auditionId || !TRANSITIONS[body.action]) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const evaluated = await evaluateSingle(supabase, body.auditionId);
    if (!evaluated) {
      return NextResponse.json({ error: "공고를 찾을 수 없습니다." }, { status: 404 });
    }
    const { row, gate } = evaluated;

    if (body.action === "approve") {
      if (gate.decision === "BLOCKED") {
        return NextResponse.json(
          { error: "승인 불가 (BLOCKED)", reasons: gate.blockedReasons },
          { status: 403 }
        );
      }
      if (gate.decision === "CHECK" && !body.confirmed) {
        return NextResponse.json(
          { requiresConfirm: true, reasons: gate.checkReasons },
          { status: 409 }
        );
      }
    }

    const next = TRANSITIONS[body.action];
    const prev = { review_status: row.review_status, is_active: row.is_active };

    const { error: updateError } = await supabase
      .from("auditions")
      .update(next)
      .eq("id", row.id);
    if (updateError) {
      return NextResponse.json(
        { error: `업데이트 실패: ${updateError.message}` },
        { status: 500 }
      );
    }

    const { data: logRow, error: logError } = await supabase
      .from("admin_actions")
      .insert({
        actor_email: admin,
        action: body.action,
        audition_id: row.id,
        audition_title: row.title,
        prev,
        next,
        note: body.confirmed ? "CHECK 확인 후 승인" : null,
      })
      .select("id")
      .maybeSingle();

    return NextResponse.json({
      success: true,
      actionId: logRow?.id ?? null,
      logged: !logError,
      ...(logError ? { logWarning: "액션 로그 기록 실패 — 013 마이그레이션 적용 여부 확인" } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "액션 처리 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
