import type { Profile } from "@/types";

export type MiniProfileField = "name" | "birth_year" | "gender" | "genre";

/** 분야 14개 카테고리 (007_category_system — '기타' 제외) */
export const PROFILE_GENRES = [
  "배우",
  "모델",
  "아이돌",
  "키즈모델",
  "가수",
  "트로트",
  "촬영모델",
  "뮤지컬",
  "연극",
  "성우",
  "댄서",
  "MC/진행자",
  "엑스트라",
  "인플루언서",
] as const;

export const MINI_PROFILE_LABELS: Record<MiniProfileField, string> = {
  name: "이름",
  birth_year: "출생연도",
  gender: "성별",
  genre: "분야",
};

/**
 * 가입 최저 연령 — 개인정보 보호법 제22조의2(만 14세 미만 아동의 개인정보).
 * 약관·개인정보처리방침이 "만 14세 미만은 가입할 수 없습니다"라고 고지하므로
 * 코드가 그 고지와 어긋나면 안 된다.
 */
export const MIN_SIGNUP_AGE = 14;
/**
 * 출생연도 하한 — 오타·센티넬(0, 1000) 차단용.
 * ProfileForm·polish 의 `min(1940)` 과 값을 맞춘다(불일치하면 폼이 막은 값을 서버가 통과시킨다).
 */
export const MIN_BIRTH_YEAR = 1940;

/**
 * 허용되는 최대 출생연도. **연도를 하드코딩하지 않는다** — 상수로 박아 두면
 * 해가 바뀌는 순간 조용히 미성년자를 통과시킨다(직전 코드가 `max(2015)`였다).
 */
export function maxBirthYear(now: Date = new Date()): number {
  return now.getFullYear() - MIN_SIGNUP_AGE;
}

const UNDERAGE_MESSAGE = "만 14세 이상만 가입할 수 있습니다.";

export type BirthYearError = {
  code: "UNDERAGE" | "INVALID_BIRTH_YEAR";
  message: string;
};

/**
 * 출생연도 검증 단일 소스 — 클라이언트 폼과 API 라우트가 같은 함수를 쓴다.
 * 값이 없으면(null/undefined) 통과: birth_year 는 부분 수정 요청에서 빠질 수 있고,
 * 필수 여부는 getMissingFields 가 따로 본다.
 */
export function validateBirthYear(
  value: unknown,
  now: Date = new Date()
): BirthYearError | null {
  if (value === null || value === undefined || value === "") return null;

  const year = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR || year > now.getFullYear()) {
    return { code: "INVALID_BIRTH_YEAR", message: "출생연도를 확인해주세요." };
  }
  if (year > maxBirthYear(now)) {
    return { code: "UNDERAGE", message: UNDERAGE_MESSAGE };
  }
  return null;
}

/**
 * 프로필 요청 본문의 연령 검증 — **birth_year 와 deprecated `age` 를 함께** 본다.
 * `age` 만 보내도 getMissingFields 가 birth_year 대체로 인정하므로(아래 §미니 프로필),
 * birth_year 만 검사하면 `{"age": 10}` 으로 만 14세 차단이 통째로 우회된다.
 * `age` 는 폐기 예정 폴백 컬럼이라 하한만 막고 그 이상은 손대지 않는다.
 */
export function validateAgeFields(
  input: { birth_year?: unknown; age?: unknown } | null | undefined,
  now: Date = new Date()
): BirthYearError | null {
  const byError = validateBirthYear(input?.birth_year, now);
  if (byError) return byError;

  const raw = input?.age;
  if (raw === null || raw === undefined || raw === "") return null;
  const age = Number(raw);
  if (Number.isFinite(age) && age < MIN_SIGNUP_AGE) {
    return { code: "UNDERAGE", message: UNDERAGE_MESSAGE };
  }
  return null;
}

/**
 * 프로필 요청 본문 정리 — 라우트가 body 를 그대로 insert/update 하기 전에 통과시킨다.
 * ① id·created_at·updated_at 제거: 001 의 profiles UPDATE 정책에 `with check` 가 없어
 *    (→ 024 에서 추가) `PUT {"id": "<타인 uuid>"}` 로 행 주인을 바꿀 수 있다.
 *    024 적용 전까지 이 함수가 유일한 방어다.
 * ② birth_year·age 의 빈 문자열 → null: 폼에서 값을 지우면 `""` 가 오는데 int 컬럼
 *    캐스팅에 실패해 500 이 난다. 빈 값은 "미제공"이므로 null 저장이 맞다.
 */
export function sanitizeProfileBody(body: unknown): Record<string, unknown> {
  const rest = { ...(body as Record<string, unknown> | null) };
  delete rest.id;
  delete rest.created_at;
  delete rest.updated_at;
  for (const key of ["birth_year", "age"]) {
    if (rest[key] === "") rest[key] = null;
  }
  return rest;
}

/** 미니 프로필(지원 최소 요건) 부족 필드 계산 — 12_ia-userflows F5: 이름·출생연도·성별·분야 */
export function getMissingFields(profile: Profile | null): MiniProfileField[] {
  const missing: MiniProfileField[] = [];
  if (!profile?.name) missing.push("name");
  if (!profile?.birth_year && !profile?.age) missing.push("birth_year");
  if (!profile?.gender) missing.push("gender");
  if ((profile?.genre?.length ?? 0) === 0) missing.push("genre");
  return missing;
}

type CompletenessInput = Partial<
  Pick<Profile, "name" | "birth_year" | "age" | "gender" | "activity_field" | "genre" | "photo_urls">
> | null;

/** 프로필 완성도 (지원 필수 필드 + 사진) — 필수 null 체크 파생, 별도 컬럼 없음 */
export function getProfileCompleteness(profile: CompletenessInput): number {
  const checks = [
    !!profile?.name,
    !!profile?.birth_year || !!profile?.age,
    !!profile?.gender,
    (profile?.activity_field?.length ?? 0) > 0,
    (profile?.genre?.length ?? 0) > 0,
    (profile?.photo_urls?.length ?? 0) > 0,
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}
