/**
 * 공고 본문에서 수집기가 덧붙인 출처 꼬리표를 떼어낸다.
 *
 * 크롤러(naver_web/naver_cafe)가 본문 끝에 이런 블록을 붙인다:
 *
 *   ---
 *   출처: 블로그 '어떤블로거' (요약만 수집 — 전문·지원 방법은 원문 링크 확인)
 *
 * 활성 공고 4,457건 중 4,151건(93%)에 이 꼬리표가 있고, 그대로
 * `<meta name="description">` 과 JobPosting JSON-LD 의 description 으로 나가고 있었다.
 * 검색엔진과 AI 에게 "여기엔 정보가 없으니 다른 데를 보라"고 말하는 신호라
 * 색인·인용 대상에서 스스로 빠진다. 출처는 화면에서 `source_name` 배지로 이미 보여준다.
 *
 * 원본 컬럼은 건드리지 않는다 — 표시·메타 생성 시점에만 뗀다.
 */

// "---" 구분선 뒤에 오는 "출처:" 블록 전체
const SOURCE_NOTE = /\n*-{3,}\s*\n*출처\s*:[\s\S]*$/;
// 구분선 없이 붙는 변형
const SOURCE_NOTE_BARE = /\n{2,}출처\s*:\s*(?:블로그|카페|홈페이지|네이버카페)[\s\S]*$/;
// 괄호 안내문만 남은 경우
const COLLECT_NOTE = /\((?:요약만\s*수집[^)]*)\)/g;

export function stripSourceNote(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(SOURCE_NOTE, "")
    .replace(SOURCE_NOTE_BARE, "")
    .replace(COLLECT_NOTE, "")
    .trim();
}

/**
 * meta description·JSON-LD 용 요약. 꼬리표를 뗀 뒤 공백을 정리하고 길이를 맞춘다.
 * 잘릴 때는 단어 중간이 아니라 문장·어절 경계에서 자른다.
 */
export function metaDescription(
  text: string | null | undefined,
  fallback: string,
  max = 155
): string {
  const body = stripSourceNote(text).replace(/\s+/g, " ").trim();
  if (!body) return fallback;
  if (body.length <= max) return body;
  const cut = body.slice(0, max);
  const at = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "), cut.lastIndexOf("·"));
  return (at > max * 0.6 ? cut.slice(0, at) : cut).trim() + "…";
}
