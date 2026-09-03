// JSON-LD 직렬화 — <script type="application/ld+json"> 안에 넣기 안전한 형태로.
//
// 왜 JSON.stringify 만으로는 안 되는가:
//   HTML 파서는 <script> 안의 내용을 문자열로 보지 않는다. 본문에 `</script>` 가 있으면
//   거기서 스크립트가 끝나고, 뒤따르는 텍스트가 그대로 마크업이 된다.
//   JSON.stringify 는 `<` 를 이스케이프하지 않으므로 크롤/LLM 이 가져온 공고 본문
//   (title·description·requirements·company·genre)에 `</script><script>...` 를 심으면
//   저장형 XSS 가 성립한다. 값이 아니라 **출력 지점**에서 막는다.
//
// U+2028/U+2029 는 JSON 에서는 합법이지만 옛 JS 파서에서 줄바꿈으로 해석돼
// 문자열 리터럴을 깨뜨린다 — 함께 이스케이프한다.
//
// 치환 결과(< 등)는 JSON 문자열 이스케이프라 JSON.parse 왕복 시 원문 그대로 복원된다.
// 즉 검색엔진이 읽는 값은 바뀌지 않고, HTML 파서만 속지 않게 된다.
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
