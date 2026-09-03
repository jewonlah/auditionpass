// /auditions 탐색 페이지의 URL 쿼리 파싱 — 서버 컴포넌트(generateMetadata·초기 SSR 페치)와
// 클라이언트(필터 변경 시 router.replace)가 같은 규칙을 쓰도록 단일 소스로 둔다.
//
// Next.js App Router의 searchParams는 반복 쿼리(`?filter=a&filter=b`)를 배열로 준다 —
// 우리는 단일 값만 쓰므로 첫 값만 취한다.

export interface AuditionsQuery {
  filter: string;
  q: string;
}

const DEFAULT_FILTER = "전체";

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseAuditionsSearchParams(
  searchParams: Record<string, string | string[] | undefined> | undefined
): AuditionsQuery {
  const filter = firstValue(searchParams?.filter)?.trim() || DEFAULT_FILTER;
  const q = firstValue(searchParams?.q)?.trim() || "";
  return { filter, q };
}
