"""
캐스팅챗고 (castingchatgo.com) 크롤러
API 기반 — requests
API: https://api.castingchatgo.com/api/v1/jobs
"""

import logging
import requests
from .base import BaseScraper, AuditionData

logger = logging.getLogger(__name__)

_API_URL = "https://api.castingchatgo.com/api/v1/jobs"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Origin": "https://www.castingchatgo.com",
    "Referer": "https://www.castingchatgo.com/",
}


class CastingchatgoScraper(BaseScraper):
    source_name = "캐스팅챗고"
    base_url = "https://www.castingchatgo.com"

    def scrape(self) -> list[AuditionData]:
        results: list[AuditionData] = []

        try:
            resp = requests.get(
                _API_URL,
                params={"status": "OPEN"},
                timeout=30,
                headers=_HEADERS,
            )
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError) as e:
            logger.error(f"[{self.source_name}] API 요청 실패: {e}")
            return results

        # API가 리스트 또는 { items: [...] } 형태일 수 있음
        items = data if isinstance(data, list) else data.get("items", data.get("jobs", []))
        if not isinstance(items, list):
            logger.warning(f"[{self.source_name}] 예상치 못한 응답 형식")
            return results

        logger.info(f"[{self.source_name}] API에서 {len(items)}개 ��목 수신")

        for item in items:
            try:
                audition = self._parse_item(item)
                if audition:
                    results.append(audition)
            except Exception as e:
                logger.warning(f"[{self.source_name}] ���목 파싱 오류: {e}")
                continue

        return results

    def _parse_item(self, item: dict) -> AuditionData | None:
        title = item.get("title", "")
        if not title or len(title) < 3:
            return None
        if self.is_noise_title(title):
            return None

        company = item.get("companyName") or None

        # 마감일
        deadline_str = item.get("deadline", "")
        deadline = self.parse_deadline(deadline_str)

        # 이메일
        apply_email = item.get("contactEmail") or None
        if apply_email and "@" not in apply_email:
            apply_email = None

        # 장르
        category = item.get("category", "")
        genre = self._map_genre(category, title)

        # 설명 조합
        desc_parts = []
        if item.get("description"):
            desc_parts.append(item["description"][:1000])
        if item.get("salary"):
            desc_parts.append(f"급여: {item['salary']}")
        if item.get("location"):
            desc_parts.append(f"장소: {item['location']}")
        if item.get("requirements"):
            reqs = item["requirements"]
            if isinstance(reqs, list):
                desc_parts.append("자격: " + ", ".join(reqs))
        description = "\n".join(desc_parts) if desc_parts else None

        # source_url
        job_id = item.get("id", "")
        source_url = f"{self.base_url}/jobs/{job_id}" if job_id else f"{self.base_url}/jobs"

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

    def _map_genre(self, category: str, title: str) -> str:
        actor_cats = {"배우"}
        model_cats = {"광고모델", "쇼모델", "영상모델", "사진모델", "라이브모델", "방송모델/출연자"}
        if category in actor_cats:
            return "배우"
        if category in model_cats:
            return "모델"
        return self.classify_genre(category + " " + title)
