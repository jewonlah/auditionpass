# 크롤러 에이전트 — Python + GitHub Actions

## 역할
오디션 공고 자동 수집. 하루 1회 (KST 새벽 3시) GitHub Actions로 실행.

## 디렉토리 구조
```
crawler/
├── CLAUDE.md
├── main.py                 # 크롤러 진입점
├── scrapers/
│   ├── __init__.py
│   ├── base.py             # 기본 스크레이퍼 클래스
│   ├── cnccasting.py       # 씨엔씨캐스팅
│   └── castingposter.py    # 캐스팅포스터
├── utils/
│   ├── supabase_client.py  # Supabase 연동
│   └── email_extractor.py  # 이메일 추출 유틸
├── requirements.txt
└── .github/
    └── workflows/
        └── crawler.yml     # GitHub Actions Cron
```

## 설치 및 의존성
```txt
# requirements.txt
playwright==1.40.0
beautifulsoup4==4.12.2
requests==2.31.0
supabase==2.3.0
python-dotenv==1.0.0
```

## 기본 스크레이퍼 클래스
```python
# scrapers/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from typing import Optional

@dataclass
class AuditionData:
    title: str
    company: Optional[str]
    genre: str  # '배우' | '모델' | '기타'
    deadline: Optional[date]
    apply_email: Optional[str]
    description: Optional[str]
    requirements: Optional[str]
    source_url: str
    source_name: str

class BaseScraper(ABC):
    def __init__(self):
        self.source_name = ""

    @abstractmethod
    def scrape(self) -> list[AuditionData]:
        """공고 목록을 수집하고 반환"""
        pass

    def extract_email(self, text: str) -> Optional[str]:
        """텍스트에서 이메일 주소 추출"""
        import re
        pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        match = re.search(pattern, text)
        return match.group() if match else None

    def parse_deadline(self, text: str) -> Optional[date]:
        """마감일 텍스트를 date로 파싱"""
        import re
        from datetime import date

        # 패턴: 2025.03.31 / 2025-03-31 / 25.03.31
        patterns = [
            r'(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})',
            r'(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})',
        ]

        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                groups = match.groups()
                year = int(groups[0]) + (2000 if len(groups[0]) == 2 else 0)
                return date(year, int(groups[1]), int(groups[2]))

        return None
```

## 씨엔씨캐스팅 스크레이퍼
```python
# scrapers/cnccasting.py
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
from .base import BaseScraper, AuditionData
from typing import Optional
import time

class CNCCastingScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.source_name = "씨엔씨캐스팅"
        self.base_url = "https://www.cnccasting.com"

    def scrape(self) -> list[AuditionData]:
        results = []

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            # 배우 오디션 목록
            page.goto(f"{self.base_url}/audition/list?genre=actor")
            page.wait_for_load_state('networkidle')

            html = page.content()
            soup = BeautifulSoup(html, 'html.parser')

            # 공고 카드 파싱 (실제 HTML 구조에 맞게 수정 필요)
            cards = soup.select('.audition-item')

            for card in cards:
                try:
                    title = card.select_one('.title').get_text(strip=True)
                    company = card.select_one('.company')
                    company_text = company.get_text(strip=True) if company else None
                    deadline_el = card.select_one('.deadline')
                    deadline_text = deadline_el.get_text(strip=True) if deadline_el else ''
                    link = card.select_one('a')
                    source_url = self.base_url + link['href'] if link else ''

                    # 상세 페이지에서 이메일 추출
                    apply_email = None
                    if source_url:
                        page.goto(source_url)
                        page.wait_for_load_state('networkidle')
                        detail_html = page.content()
                        apply_email = self.extract_email(detail_html)
                        time.sleep(1)  # 과도한 요청 방지

                    results.append(AuditionData(
                        title=title,
                        company=company_text,
                        genre='배우',
                        deadline=self.parse_deadline(deadline_text),
                        apply_email=apply_email,
                        description=None,
                        requirements=None,
                        source_url=source_url,
                        source_name=self.source_name,
                    ))
                except Exception as e:
                    print(f"[씨엔씨캐스팅] 파싱 오류: {e}")
                    continue

            browser.close()

        return results
```

## Supabase 저장 유틸
```python
# utils/supabase_client.py
import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

supabase = create_client(
    os.environ['SUPABASE_URL'],
    os.environ['SUPABASE_SERVICE_ROLE_KEY']
)

def upsert_auditions(auditions: list) -> int:
    """수집된 오디션을 DB에 저장 (중복 URL은 업데이트)"""
    saved = 0

    for audition in auditions:
        if not audition.apply_email:
            # 이메일 없으면 저장 의미 없음
            continue

        data = {
            'title': audition.title,
            'company': audition.company,
            'genre': audition.genre,
            'deadline': audition.deadline.isoformat() if audition.deadline else None,
            'apply_email': audition.apply_email,
            'description': audition.description,
            'requirements': audition.requirements,
            'source_url': audition.source_url,
            'source_name': audition.source_name,
        }

        result = supabase.table('auditions').upsert(
            data,
            on_conflict='source_url'
        ).execute()

        if result.data:
            saved += 1

    return saved
```

## 메인 실행 파일
```python
# main.py
from scrapers.cnccasting import CNCCastingScraper
from scrapers.castingposter import CastingPosterScraper
from utils.supabase_client import upsert_auditions

def main():
    print("[크롤러] 시작")

    scrapers = [
        CNCCastingScraper(),
        CastingPosterScraper(),
    ]

    total_saved = 0

    for scraper in scrapers:
        print(f"[{scraper.source_name}] 수집 시작")
        try:
            auditions = scraper.scrape()
            print(f"[{scraper.source_name}] {len(auditions)}건 수집")

            saved = upsert_auditions(auditions)
            print(f"[{scraper.source_name}] {saved}건 저장 완료")
            total_saved += saved

        except Exception as e:
            print(f"[{scraper.source_name}] 오류: {e}")
            continue

    print(f"[크롤러] 완료 — 총 {total_saved}건 저장")

if __name__ == '__main__':
    main()
```

## GitHub Actions Cron 설정
```yaml
# .github/workflows/crawler.yml
name: Daily Audition Crawler

on:
  schedule:
    - cron: '0 18 * * *'  # UTC 18:00 = KST 03:00
  workflow_dispatch:       # 수동 실행 가능

jobs:
  crawl:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Python 설정
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: 의존성 설치
        run: |
          pip install -r crawler/requirements.txt
          playwright install chromium

      - name: 크롤러 실행
        working-directory: crawler
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: python main.py
```

## GitHub Actions Secrets 설정 필요
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 작업 지시 예시
```
crawler/CLAUDE.md를 참조해서:
1. CastingPosterScraper를 구현해줘
2. 씨엔씨캐스팅 실제 HTML 구조를 확인하고 파서를 수정해줘
3. GitHub Actions 워크플로우 파일을 완성해줘
```
