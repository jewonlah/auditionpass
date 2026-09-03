// 인메모리 슬라이딩 윈도 속도 제한.
//
// ⚠️ 인스턴스별 한계: 서버리스/멀티 인스턴스에서는 인스턴스마다 카운터가 따로 돌고,
// 콜드 스타트마다 초기화된다. 즉 실효 한도는 (설정값 × 동시 인스턴스 수)까지 늘어난다.
// 정식 한도는 Upstash Redis 등 외부 저장소 도입 시 같은 인터페이스로 교체할 것.
// 그럼에도 두는 이유: 로그인 사용자 한 명이 버튼을 연타해 선불 LLM 잔액을 태우는
// 가장 흔한 경로는 이걸로 충분히 막힌다(잔액은 크롤러와 같은 키를 공유한다).

export interface RateRule {
  /** 윈도 안에서 허용할 최대 요청 수 */
  limit: number;
  /** 윈도 길이(ms) */
  windowMs: number;
  /** 429 메시지에 쓸 한국어 라벨 */
  label: string;
}

export interface RateLimitResult {
  ok: boolean;
  /** 초과 시 재시도까지 남은 초 (>=1) */
  retryAfterSec: number;
  /** 초과 시 사용자에게 보여줄 한국어 메시지 */
  message?: string;
}

const buckets = new Map<string, number[]>();
// 메모리 누수 방지: 가장 긴 윈도를 넘긴 키는 접근이 없어도 주기적으로 버린다.
const MAX_KEYS = 10_000;

function sweep(now: number, maxWindowMs: number): void {
  if (buckets.size <= MAX_KEYS) return;
  for (const [key, stamps] of buckets) {
    if (stamps.length === 0 || now - stamps[stamps.length - 1] > maxWindowMs) {
      buckets.delete(key);
    }
  }
}

/**
 * 요청 1건을 기록하며 한도를 검사한다. 통과하면 기록하고, 초과하면 기록하지 않는다
 * (초과 요청이 윈도를 계속 밀어내며 영구 차단되는 것을 막는다).
 *
 * @param key 사용자 식별자 — 반드시 서버가 확인한 값(auth user id). 클라이언트 헤더 금지.
 */
export function checkRateLimit(key: string, rules: RateRule[]): RateLimitResult {
  const now = Date.now();
  const maxWindowMs = Math.max(...rules.map((r) => r.windowMs));
  sweep(now, maxWindowMs);

  const stamps = (buckets.get(key) ?? []).filter((t) => now - t < maxWindowMs);

  for (const rule of rules) {
    const inWindow = stamps.filter((t) => now - t < rule.windowMs);
    if (inWindow.length >= rule.limit) {
      const oldest = inWindow[0];
      const retryAfterSec = Math.max(1, Math.ceil((rule.windowMs - (now - oldest)) / 1000));
      buckets.set(key, stamps);
      return {
        ok: false,
        retryAfterSec,
        message: `요청이 너무 잦습니다. ${rule.label} ${rule.limit}회까지 가능합니다. ${retryAfterSec}초 후 다시 시도해주세요.`,
      };
    }
  }

  stamps.push(now);
  buckets.set(key, stamps);
  return { ok: true, retryAfterSec: 0 };
}

/** 테스트·운영 리셋용 (프로덕션 경로에서는 호출하지 않는다) */
export function resetRateLimit(key?: string): void {
  if (key) buckets.delete(key);
  else buckets.clear();
}
