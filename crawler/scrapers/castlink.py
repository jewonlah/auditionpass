"""
캐스트링크 (castlink.co.kr) 크롤러 — 내부 데이터 직접 파싱으로 재작성 (플랜 30 §2 2-5)

옛 구현은 Playwright로 목록 카드를 긁었고, 진단에서 "구조적 결함 — 상세 접근 불가,
apply_email 0%, 합성 URL로 중복 누적"으로 **소스 제외 후보**였다.
2-5의 지시는 "내부 API 탐색(실패 시 소스 제외)"이었고, 탐색 결과 **성공**했다.

실제 구조 (2026-08-27 실측):
- Next.js App Router. 목록 페이지가 `self.__next_f.push([1,"…"])` 청크로 RSC 페이로드를
  실어 보내고, 그 안에 `"auditions":[…]` 배열이 **통째로** 들어 있다(874건).
- 각 항목: `id`(UUID) · `title` · `application_deadline`(정확한 마감 타임스탬프) ·
  `genres.name` · `distribution_channel_name`(tvN 등) · `gender` · `age_min/max` · `group_roles`.
- 상세 URL은 `/ko/service/auditions/{id}` (200 확인).

이 방식이 옛 구현보다 나은 점:
1. **안정적인 source_url** — UUID 기반. 합성 URL로 같은 공고가 중복 누적되던 문제가 사라진다.
2. **마감일이 정확** — 본문에서 날짜를 추측하지 않는다(2-3에서 촬영일을 마감으로 저장하던 함정 회피).
3. Playwright 불필요 — 요청 1회로 전량. 브라우저 기동 비용도 사라진다.

지원 방법: 캐스트링크는 플랫폼 내부 지원이라 접수 이메일이 없다 → `apply_email=None`
(원클릭 대상이 아닌 external 공고). 이건 결함이 아니라 그 사이트의 성격이다.
"""

import re
import json
import codecs
import logging
import requests
from datetime import datetime
from .base import BaseScraper, AuditionData

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
}

_CHUNK_RE = re.compile(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', re.S)
_UNDEFINED_RE = re.compile(r'"\$undefined"|\$undefined')
_BACKSLASH = chr(92)


class CastlinkScraper(BaseScraper):
    source_name = "캐스트링크"
    base_url = "https://castlink.co.kr"
    list_url = "https://castlink.co.kr/ko/service/auditions"

    def scrape(self) -> list[AuditionData]:
        try:
            resp = requests.get(self.list_url, headers=_HEADERS, timeout=40)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.error(f"[{self.source_name}] 목록 요청 실패: {e}")
            return []

        rows = self._extract_auditions(resp.text)
        if not rows:
            # RSC 구조가 바뀌면 여기서 0건이 된다 — 조용히 넘어가지 않고 경고를 남긴다.
            logger.error(f"[{self.source_name}] RSC 페이로드에서 공고 배열을 찾지 못함 — 구조 변경 의심")
            return []

        results: list[AuditionData] = []
        for row in rows:
            try:
                audition = self._build(row)
            except Exception as e:
                logger.warning(f"[{self.source_name}] 항목 변환 오류 {row.get('id')}: {e}")
                continue
            if audition:
                results.append(audition)

        logger.info(f"[{self.source_name}] {len(rows)}건 중 {len(results)}건 변환")
        return results

    @staticmethod
    def _extract_auditions(html: str) -> list[dict]:
        """RSC 청크를 이어붙여 `"auditions":[…]` 배열을 꺼낸다."""
        raw = "".join(_CHUNK_RE.findall(html))
        if not raw:
            return []
        try:
            text = codecs.decode(raw, "unicode_escape").encode("latin1", "ignore").decode("utf-8", "ignore")
        except Exception:
            return []

        key = text.find('"auditions":[')
        if key < 0:
            return []
        start = text.index("[", key)

        # 문자열 안의 대괄호를 세지 않도록 직접 스캔한다(정규식으로는 중첩을 못 센다)
        depth = 0
        in_str = False
        escaped = False
        end = None
        for i in range(start, len(text)):
            c = text[i]
            if escaped:
                escaped = False
                continue
            if c == _BACKSLASH:
                escaped = True
                continue
            if c == '"':
                in_str = not in_str
                continue
            if in_str:
                continue
            if c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end is None:
            return []

        try:
            return json.loads(_UNDEFINED_RE.sub("null", text[start:end]))
        except json.JSONDecodeError:
            return []

    def _build(self, row: dict) -> AuditionData | None:
        uid = row.get("id")
        title = (row.get("title") or "").strip()
        if not uid or not title or self.is_noise_title(title):
            return None

        genre_name = (row.get("genres") or {}).get("name") or ""
        channel = row.get("distribution_channel_name") or ""
        roles = [r.get("role") for r in (row.get("group_roles") or []) if r.get("role")]

        deadline = None
        raw_dl = row.get("application_deadline")
        if raw_dl:
            try:
                deadline = datetime.fromisoformat(raw_dl.replace(" ", "T")).date()
            except ValueError:
                deadline = self.parse_deadline_smart(raw_dl)

        parts = [p for p in (channel, genre_name) if p]
        if roles:
            parts.append("배역: " + ", ".join(roles[:8]))
        gender = {"male": "남성", "female": "여성"}.get(row.get("gender") or "")
        if gender:
            parts.append(f"성별: {gender}")
        if row.get("age_min") and row.get("age_max"):
            parts.append(f"나이: {row['age_min']}~{row['age_max']}세")

        return AuditionData(
            title=title[:150],
            company=channel or None,
            genre=self.classify_genre(f"{title} {genre_name} {' '.join(roles)}"),
            deadline=deadline,
            apply_email=None,  # 플랫폼 내부 지원 — 접수 메일이 없다(external 공고)
            description=" · ".join(parts)[:2000] or None,
            requirements=", ".join(roles)[:500] if roles else None,
            source_url=f"{self.base_url}/ko/service/auditions/{uid}",
            source_name=self.source_name,
        )
