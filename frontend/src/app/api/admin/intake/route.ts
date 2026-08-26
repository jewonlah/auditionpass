import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";

// 인테이크 면 (39 §1 ⑤): 가공 잔여물(agent_queue, 017) + 출처 후보(source_candidates, 011).
// 쓰기는 최소한만 — 잔여물 격리 이동·처리 표시, 후보 승인·거절.
// 후보 '승인'은 발견 큐의 판정일 뿐 trust 승격이 아니다(39 §3: 승격은 완전 별도 절차).

type Body = {
  kind?: "queue" | "candidate";
  id?: number | string;
  action?: "quarantine" | "resolve" | "dismiss" | "approve" | "reject";
  note?: string;
};

export async function GET() {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

    const supabase = createAdminServiceClient();

    const [queueRes, candidateRes] = await Promise.all([
      supabase
        .from("agent_queue")
        .select("id, audition_id, title, url, reason, status, note, first_seen, last_seen")
        .eq("status", "open")
        .order("last_seen", { ascending: false })
        .limit(100),
      supabase
        .from("source_candidates")
        .select("id, url, kind, found_by, hits, sample_title, status, first_seen")
        .eq("status", "new")
        .order("hits", { ascending: false })
        .limit(50),
    ]);

    // 잔여물이 가리키는 공고의 현재 상태 — 이미 격리됐거나 값이 채워졌으면 그렇게 보여준다
    const auditionIds = [...new Set((queueRes.data ?? []).map((q) => q.audition_id))];
    const auditionMap = new Map<string, Record<string, unknown>>();
    if (auditionIds.length > 0) {
      const { data } = await supabase
        .from("auditions")
        .select("id, review_status, is_active, apply_email, deadline, source_name")
        .in("id", auditionIds);
      for (const a of data ?? []) auditionMap.set(a.id, a);
    }

    return NextResponse.json({
      queue: (queueRes.data ?? []).map((q) => ({
        ...q,
        audition: auditionMap.get(q.audition_id) ?? null,
      })),
      queueUnavailable: Boolean(queueRes.error),
      candidates: candidateRes.data ?? [],
      candidatesUnavailable: Boolean(candidateRes.error),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "인테이크 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

    const body = (await req.json()) as Body;
    const supabase = createAdminServiceClient();
    const now = new Date().toISOString();

    if (body.kind === "candidate") {
      if (!body.id || !["approve", "reject"].includes(body.action ?? "")) {
        return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
      }
      const { error } = await supabase
        .from("source_candidates")
        .update({
          status: body.action === "approve" ? "approved" : "rejected",
          last_seen: now,
        })
        .eq("id", body.id);
      if (error) {
        return NextResponse.json({ error: `후보 처리 실패: ${error.message}` }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        actionLabel: body.action === "approve" ? "후보 승인(발견 큐)" : "후보 거절",
      });
    }

    // 잔여물 처리
    if (!body.id || !["quarantine", "resolve", "dismiss"].includes(body.action ?? "")) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const { data: item } = await supabase
      .from("agent_queue")
      .select("id, audition_id, title, status")
      .eq("id", body.id)
      .maybeSingle();
    if (!item) {
      return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
    }

    if (body.action === "quarantine") {
      const { data: audition } = await supabase
        .from("auditions")
        .select("id, title, review_status, is_active, oneclick_blocked")
        .eq("id", item.audition_id)
        .maybeSingle();
      if (!audition) {
        return NextResponse.json({ error: "공고를 찾을 수 없습니다." }, { status: 404 });
      }
      const { error: qError } = await supabase
        .from("auditions")
        .update({ review_status: "quarantine", is_active: false, oneclick_blocked: true })
        .eq("id", audition.id);
      if (qError) {
        return NextResponse.json({ error: `격리 실패: ${qError.message}` }, { status: 500 });
      }
      await supabase.from("admin_actions").insert({
        actor_email: admin,
        action: "quarantine",
        audition_id: audition.id,
        audition_title: audition.title,
        prev: {
          review_status: audition.review_status,
          is_active: audition.is_active,
          oneclick_blocked: audition.oneclick_blocked ?? false,
        },
        next: { review_status: "quarantine", is_active: false, oneclick_blocked: true },
        note: `인테이크 잔여물 #${item.id} 처리`,
      });
    }

    const { error } = await supabase
      .from("agent_queue")
      .update({
        status: body.action === "dismiss" ? "dismissed" : "resolved",
        note: body.note ?? null,
        resolved_by: admin,
        resolved_at: now,
      })
      .eq("id", item.id);
    if (error) {
      return NextResponse.json({ error: `처리 실패: ${error.message}` }, { status: 500 });
    }

    const labels: Record<string, string> = {
      quarantine: "격리 이동",
      resolve: "처리 완료",
      dismiss: "보류(제외)",
    };
    return NextResponse.json({ success: true, actionLabel: labels[body.action!] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "인테이크 처리 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
