"""
캐스팅114 (casting114.com) 크롤러
JSON API 기반 — requests
API: /msa-cast/v1/bbs/cast_atwant/getItemList
"""

import json
import logging
import requests
from .base import BaseScraper, AuditionData

logger = logging.getLogger(__name__)

_API_URL = (
    "https://casting114.com/msa-cast/v1/bbs/cast_atwant/getItemList"
    "?dmnId=casting114.com&cpnId=casting114&limit=200"
)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


class Casting114Scraper(BaseScraper):
    source_name = "캐스팅114"
    base_url = "https://casting114.com"

    def scrape(self) -> list[AuditionData]:
        results: list[AuditionData] = []

        try:
            resp = requests.get(_API_URL, timeout=30, headers=_HEADERS)
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError) as e:
            logger.error(f"[{self.source_name}] API 요��� 실패: {e}")
            return results

        items = data.get("itemList", [])
        logger.info(f"[{self.source_name}] API에서 {len(items)}개 항목 수신")

        for item in items:
            try:
                audition = self._parse_item(item)
                if audition:
                    results.append(audition)
            except Exception as e:
                logger.warning(f"[{self.source_name}] 항목 파싱 오류: {e}")
                continue

        return results

    def _parse_item(self, item: dict) -> AuditionData | None:
        # item_body는 JSON 문자열
        body_str = item.get("item_body", "{}")
        try:
            body = json.loads(body_str) if isinstance(body_str, str) else body_str
        except (json.JSONDecodeError, TypeError):
            body = {}

        title = body.get("subject") or item.get("item_title", "")
        if not title or len(title) < 3:
            return None
        if self.is_noise_title(title):
            return None

        company = body.get("producer") or None

        # 마감일
        deadline_str = body.get("dueDate") or item.get("ref_str6", "")
        deadline = self.parse_deadline(deadline_str)

        # 이메일
        apply_email = body.get("email") or None
        if apply_email and "@" not in apply_email:
            apply_email = None

        # 장르 분류
        cat_code = body.get("actorCatCode", "")
        genre = self._map_genre(cat_code, title)

        # 설명 조합
        desc_parts = []
        if body.get("workTitle"):
            desc_parts.append(f"작품명: {body['workTitle']}")
        if body.get("role"):
            desc_parts.append(f"배역: {body['role']}")
        if body.get("pay"):
            desc_parts.append(f"출연료: {body['pay']}")
        if body.get("period"):
            desc_parts.append(f"��간: {body['period']}")
        if body.get("content"):
            # HTML 태그 제거
            import re
            content = re.sub(r"<[^>]+>", "", body["content"])
            content = content.strip()[:1000]
            desc_parts.append(content)

        phone = body.get("phone") or None
        description = self.build_description(
            "\n".join(desc_parts) if desc_parts else "",
            phone,
            None,
        )

        # source_url
        item_seq = item.get("item_seq", "")
        source_url = f"{self.base_url}/views/cast_atwant/list.html#item-{item_seq}"

        # 외부 링크가 있으면 그것을 source_url로 사용
        convey_href = body.get("conveyHref", "")
        if convey_href and convey_href.startswith("http"):
            source_url = convey_href

        return AuditionData(
            title=title,
            company=company,
            genre=genre,
            deadline=deadline,
            apply_email=apply_email,
            description=description,
            requirements=None,
            source_url=source_url,
            source_name=self.source_name,
        )

    def _map_genre(self, cat_code: str, title: str) -> str:
        actor_codes = {"play", "musical", "movie", "drama"}
        model_codes = {"cf"}
        if cat_code in actor_codes:
            return "배우"
        if cat_code in model_codes:
            return "모델"
        return self.classify_genre(title)
