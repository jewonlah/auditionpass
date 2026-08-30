import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * AI 소개문 생성 — P2 (2026-08-31).
 *
 * 랜딩의 약속 "프로필은 AI가 씁니다"의 실체. 폼에 흩어진 사실(나이·키·분야·
 * 특기·경력)을 받아 캐스팅 담당자에게 보낼 한 줄 소개(bio, ≤100자)를 써 준다.
 * 결과는 폼에 채워질 뿐 저장은 사용자가 한다 — AI는 초안, 확정은 본인.
 *
 * DeepSeek 사용 수칙 (crawler/utils/refine_description.py 에서 실측 확인):
 *   thinking 을 끄지 않으면 V4가 추론으로 max_tokens 를 전부 소진하고
 *   content='' 로 조용히 실패한다. 반드시 disabled.
 */

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

interface Facts {
  birth_year?: number | null;
  gender?: string | null;
  height?: number | null;
  genre?: string[] | null;
  activity_field?: string[] | null;
  specialty?: string[] | null;
  career?: string | null;
  bio?: string | null; // 기존 초안 — 있으면 결을 살린다
}

function buildFacts(f: Facts): string {
  const lines: string[] = [];
  if (f.birth_year) lines.push(`나이: 만 ${new Date().getFullYear() - f.birth_year}세`);
  if (f.gender) lines.push(`성별: ${f.gender}`);
  if (f.height) lines.push(`키: ${f.height}cm`);
  if (f.activity_field?.length) lines.push(`활동 분야: ${f.activity_field.join(", ")}`);
  else if (f.genre?.length) lines.push(`활동 분야: ${f.genre.join(", ")}`);
  if (f.specialty?.length) lines.push(`특기: ${f.specialty.join(", ")}`);
  if (f.career?.trim()) lines.push(`경력: ${f.career.trim().slice(0, 400)}`);
  if (f.bio?.trim()) lines.push(`본인이 써 둔 초안: ${f.bio.trim()}`);
  return lines.join("\n");
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    // 키가 빠진 환경에서 죽는 대신, 폼은 수동 입력으로 계속 쓸 수 있게 한다.
    return NextResponse.json(
      { error: "AI 소개 기능이 잠시 꺼져 있습니다. 직접 입력해 주세요.", code: "AI_DISABLED" },
      { status: 503 }
    );
  }

  let facts: Facts;
  try {
    facts = (await req.json()) as Facts;
  } catch {
    return NextResponse.json({ error: "요청 형식이 잘못됐습니다." }, { status: 400 });
  }

  const factSheet = buildFacts(facts);
  if (!factSheet) {
    return NextResponse.json(
      { error: "소개를 쓸 재료가 부족합니다. 분야·특기·경력 중 하나라도 채워주세요.", code: "NO_FACTS" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 180,
        temperature: 1.2,
        thinking: { type: "disabled" },
        messages: [
          {
            role: "system",
            content: [
              "너는 배우·모델 지망생의 프로필 소개문을 쓰는 캐스팅 전문 카피라이터다.",
              "캐스팅 담당자가 지원 메일에서 처음 읽는 한 줄 소개를 쓴다.",
              "규칙:",
              "- 반드시 한국어, 100자 이내, 1~2문장, '-습니다'체.",
              "- 주어진 사실만 사용한다. 없는 경력·수상·소속을 지어내지 않는다.",
              "- 나이·키 같은 숫자는 반복하지 않는다(메일에 별도 표기됨). 강점과 태도를 쓴다.",
              "- 과장 형용사(최고의, 완벽한)와 유행어, 이모지, 느낌표 금지.",
              "- 본인이 써 둔 초안이 있으면 그 결을 살려 다듬는다.",
              "- 소개문 텍스트만 출력한다. 따옴표·설명·머리말 금지.",
            ].join("\n"),
          },
          { role: "user", content: factSheet },
        ],
      }),
      // 폼에서 기다리는 요청이다 — 오래 끌지 않는다.
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      throw new Error(`deepseek ${res.status}`);
    }
    const data = await res.json();
    let bio: string = (data.choices?.[0]?.message?.content ?? "").trim();
    // 모델이 규칙을 어기고 따옴표로 감싸는 경우가 있다
    bio = bio.replace(/^["'「『]+|["'」』]+$/g, "").trim();
    if (!bio) throw new Error("empty completion");
    if (bio.length > 100) bio = bio.slice(0, 100);

    return NextResponse.json({ bio });
  } catch (e) {
    console.error("[profile/polish]", e);
    return NextResponse.json(
      { error: "소개문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.", code: "AI_FAILED" },
      { status: 502 }
    );
  }
}
