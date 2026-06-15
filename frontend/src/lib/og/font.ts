/**
 * Google Fonts에서 렌더링에 필요한 글자만 서브셋으로 동적 로드.
 * next/og(satori)는 한글 글리프를 내장하지 않으므로 한글 폰트를 직접 넘겨야 한다.
 * text에 포함된 문자만 받아오므로 용량이 수 KB 수준으로 작다.
 */
export async function loadGoogleFont(
  family: string,
  text: string,
  weight: 400 | 500 | 700 | 900 = 400
): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(
    / /g,
    "+"
  )}:wght@${weight}&text=${encodeURIComponent(text)}`;

  // 구형 User-Agent를 보내면 woff2 대신 satori가 읽을 수 있는 truetype을 반환한다.
  const cssRes = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 5.1)" },
  });
  if (!cssRes.ok) {
    throw new Error(`폰트 CSS 로드 실패: ${cssRes.status}`);
  }
  const css = await cssRes.text();

  const resource = css.match(
    /src: url\((.+?)\) format\((?:'|")(?:opentype|truetype)(?:'|")\)/
  );
  if (!resource) {
    throw new Error("폰트 URL 파싱 실패");
  }

  const fontRes = await fetch(resource[1]);
  if (!fontRes.ok) {
    throw new Error(`폰트 바이너리 로드 실패: ${fontRes.status}`);
  }
  return fontRes.arrayBuffer();
}
