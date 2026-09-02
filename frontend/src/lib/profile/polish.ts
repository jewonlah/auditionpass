import { z } from "zod";

// AI 소개문 생성(/api/profile/polish)의 입력 스키마와 팩트시트 조립.
//
// 왜 라우트에서 분리했나: 이 입력은 곧바로 **선불 잔액이 걸린 LLM 프롬프트**가 된다.
// 캐스팅만 하고 넘기면 (a) `{"genre":"배우"}` 같은 문자열 하나로 500이 나고
// (b) 길이 제한이 없어 로그인 사용자 한 명이 잔액을 태울 수 있다(같은 키를 크롤러가 쓴다).
// 검증을 순수 함수로 떼어 테스트로 고정한다.

const CURRENT_YEAR = new Date().getFullYear();

// 배열 항목: 프로필 폼의 칩 라벨이라 짧다. 빈 문자열은 걸러 준다.
const chipList = (label: string) =>
  z
    .array(z.string().max(30, `${label} 항목은 30자 이내여야 합니다.`))
    .max(10, `${label}은(는) 최대 10개까지 보낼 수 있습니다.`)
    .nullish();

export const polishInputSchema = z.object({
  birth_year: z
    .number()
    .int("출생연도는 정수여야 합니다.")
    .min(1940, "출생연도를 확인해주세요.")
    .max(CURRENT_YEAR, "출생연도를 확인해주세요.")
    .nullish(),
  gender: z.string().max(10, "성별은 10자 이내여야 합니다.").nullish(),
  height: z
    .number()
    .int("키는 정수여야 합니다.")
    .min(100, "키를 확인해주세요.")
    .max(250, "키를 확인해주세요.")
    .nullish(),
  genre: chipList("분야"),
  activity_field: chipList("활동 분야"),
  specialty: chipList("특기"),
  career: z.string().max(400, "경력은 400자 이내로 입력해주세요.").nullish(),
  // 기존 초안 — 있으면 결을 살린다. 폼 자체는 100자 제한이지만 여유를 둔다.
  bio: z.string().max(300, "한 줄 소개는 300자 이내로 입력해주세요.").nullish(),
});

export type PolishInput = z.infer<typeof polishInputSchema>;

export interface ParseResult {
  ok: boolean;
  data?: PolishInput;
  /** 사용자에게 그대로 보여줄 한국어 메시지 (첫 번째 위반) */
  error?: string;
}

/** 실패 시 한국어 메시지 1건만 돌려준다 — 내부 필드 경로를 노출하지 않는다. */
export function parsePolishInput(raw: unknown): ParseResult {
  const parsed = polishInputSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const first = parsed.error.issues[0];
  const fallback = "입력값을 확인해주세요.";
  // zod 기본 메시지(영문)는 그대로 내보내지 않는다.
  const message = /[가-힣]/.test(first?.message ?? "") ? first.message : fallback;
  return { ok: false, error: message };
}

/** 검증된 입력 → LLM에 줄 팩트시트. 재료가 하나도 없으면 빈 문자열. */
export function buildFacts(f: PolishInput): string {
  const lines: string[] = [];
  if (f.birth_year) {
    const age = CURRENT_YEAR - f.birth_year;
    // 검증을 통과해도 방어한다 — 여기서 NaN이 새면 프롬프트에 "만 NaN세"가 박힌다.
    if (Number.isFinite(age) && age >= 0) lines.push(`나이: 만 ${age}세`);
  }
  if (f.gender) lines.push(`성별: ${f.gender}`);
  if (f.height) lines.push(`키: ${f.height}cm`);

  const fields = (f.activity_field ?? []).filter(Boolean);
  const genres = (f.genre ?? []).filter(Boolean);
  if (fields.length) lines.push(`활동 분야: ${fields.join(", ")}`);
  else if (genres.length) lines.push(`활동 분야: ${genres.join(", ")}`);

  const specialty = (f.specialty ?? []).filter(Boolean);
  if (specialty.length) lines.push(`특기: ${specialty.join(", ")}`);
  if (f.career?.trim()) lines.push(`경력: ${f.career.trim()}`);
  if (f.bio?.trim()) lines.push(`본인이 써 둔 초안: ${f.bio.trim()}`);
  return lines.join("\n");
}
