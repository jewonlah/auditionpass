import html
import os
import logging
from datetime import date, datetime, timezone
from supabase import create_client, Client
from dotenv import load_dotenv
from utils.refine_description import refine_description
from utils.summarize import summarize
from utils.quality import quality_score
from utils.classifier import classify_audition, to_legacy_genre

load_dotenv()

logger = logging.getLogger(__name__)

supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

# ============================================
# 분류기 연결 (30 마스터플랜 2-1)
# ============================================

# 007_category_system.sql 컬럼. 라이브 DB 미적용 상태(2026-08-21 실측)에서도 크롤러가
# 죽지 않도록 최초 1회 존재 여부를 탐지하고, 없으면 category 계열은 생략하고 genre만 저장한다.
CATEGORY_COLUMNS = ("category", "sub_category", "category_confidence", "classify_method")
_category_columns_available: bool | None = None

# 소스별 분류 통계 (main.py가 소스 단위로 읽고 리셋 — 2-4 crawl_logs 기록의 재료)
classify_stats: dict[str, int] = {"keyword": 0, "rule": 0, "ai": 0, "etc": 0, "low_confidence": 0, "pending": 0}


def category_columns_available() -> bool:
    """auditions에 007 컬럼이 있는지 1회 탐지. 없으면 경고 후 False(이후 호출은 캐시)."""
    global _category_columns_available
    if _category_columns_available is None:
        try:
            supabase.table("auditions").select(",".join(CATEGORY_COLUMNS)).limit(1).execute()
            _category_columns_available = True
        except Exception as e:
            _category_columns_available = False
            logger.error(
                "auditions에 category 컬럼이 없음 — 007_category_system.sql 미적용. "
                f"분류 결과는 genre만 반영하고 category 계열은 생략합니다. ({str(e)[:80]})"
            )
    return _category_columns_available


def pop_classify_stats() -> dict[str, int]:
    """누적 분류 통계를 반환하고 0으로 리셋."""
    snapshot = dict(classify_stats)
    for k in classify_stats:
        classify_stats[k] = 0
    return snapshot


def _classify_fields(audition) -> dict:
    """AuditionData → 저장용 분류 필드.
    - genre: 프론트 타입('배우'|'모델'|'기타')·필터 호환을 위해 레거시 3분류 유지(to_legacy_genre).
      분류기가 '기타'(etc)면 스크레이퍼 휴리스틱 genre를 존중한다.
    - category 계열 4컬럼: 007 적용 시에만 포함."""
    text = "\n".join(t for t in (audition.description, audition.requirements) if t)
    result = classify_audition(audition.title or "", text, audition.source_name or "")

    classify_stats[result.method] = classify_stats.get(result.method, 0) + 1
    if result.category_code == "etc":
        classify_stats["etc"] += 1
    elif result.confidence < 0.6:
        classify_stats["low_confidence"] += 1

    fields = {
        "genre": to_legacy_genre(result.category_code) if result.category_code != "etc" else audition.genre,
    }
    if category_columns_available():
        fields.update({
            "category": result.category,
            "sub_category": result.sub_category,
            "category_confidence": result.confidence,
            "classify_method": result.method,
        })
    if quality_column_available():
        fields["quality_score"] = quality_score(
            apply_email=audition.apply_email, deadline=audition.deadline, description=audition.description,
            source_name=audition.source_name, title=audition.title, category_confidence=result.confidence,
        )
    return fields


# ============================================
# 검수 큐 (플랜 E-2) — 게재 결정 규칙
#   score ≥ AUTO_MIN_SCORE 이고 출처가 trusted_sources에 있으면 auto(활성)
#   그 외(저품질 또는 신뢰되지 않은 신규 출처) → pending(비활성) → tools/review.py 로 승인/거절
# ============================================
AUTO_MIN_SCORE = 0.30
_review_available: bool | None = None
_trusted: set[str] | None = None


def review_available() -> bool:
    global _review_available
    if _review_available is None:
        try:
            supabase.table("auditions").select("review_status").limit(1).execute()
            supabase.table("trusted_sources").select("source_name").limit(1).execute()
            _review_available = True
        except Exception:
            _review_available = False
            logger.warning("review_status/trusted_sources 없음(011 미적용) — 검수 큐 생략, 전부 활성 저장")
    return _review_available


def trusted_sources() -> set[str]:
    """자동 게재 허용 출처(캐시). 출처명은 정확히 일치해야 한다('네이버카페:빛이 모이는 곳' 단위)."""
    global _trusted
    if _trusted is None:
        try:
            rows = supabase.table("trusted_sources").select("source_name").execute().data or []
            _trusted = {r["source_name"] for r in rows}
        except Exception:
            _trusted = set()
    return _trusted


_suppression: list[tuple[str, str]] | None = None


def suppression_rules() -> list[tuple[str, str]]:
    """suppression 긴급 차단 목록(014, 캐시). 테이블 미적용이면 빈 목록."""
    global _suppression
    if _suppression is None:
        try:
            rows = supabase.table("suppression").select("kind, value").execute().data or []
            _suppression = [(r["kind"], r["value"]) for r in rows]
            if _suppression:
                logger.info(f"suppression 차단 규칙 {len(_suppression)}건 로드")
        except Exception:
            _suppression = []
    return _suppression


def suppression_hit(apply_email: str | None, source_url: str | None,
                    source_name: str | None) -> str | None:
    """차단 규칙 매치 사유 or None (플랜 36 §4 — 히트 시 게재 금지·재활성화 금지).
    어드민 sweep(frontend/src/app/api/admin/suppression)과 동일 규칙 — 한쪽 수정 시 같이 갱신."""
    email = (apply_email or "").lower()
    url = (source_url or "").lower()
    name = source_name or ""
    head = name.split(":")[0].strip()
    for kind, value in suppression_rules():
        if kind == "email" and email == value:
            return f"email:{value}"
        if kind == "domain" and (email.endswith("@" + value) or value in url):
            return f"domain:{value}"
        if kind == "source" and (name == value or head == value):
            return f"source:{value}"
    return None


# 012_quarantine_status.sql 라이브 적용 완료(2026-08-25) — 격리는 운영자 거절(rejected)과 구분
QUARANTINE_STATUS = "quarantine"


def _review_fields(source_name: str | None, score: float | None,
                   title: str = "", description: str | None = None) -> dict:
    """게재 결정 (auto-triage v0, 플랜 37 §1). 011 미적용이면 빈 dict(기존 동작 유지).
    위험 점수 ≥7 → quarantine(비활성, 신뢰 출처여도), 4~6 → pending 강등."""
    if not review_available():
        return {}

    from utils.risk import risk_score
    r_score, r_reasons = risk_score(title, description)
    if r_score >= 7:
        classify_stats["quarantine"] = classify_stats.get("quarantine", 0) + 1
        logger.info(f"  격리(위험 {r_score}): {title[:40]} — {', '.join(r_reasons)}")
        return {"review_status": QUARANTINE_STATUS, "is_active": False}

    trusted = (source_name or "") in trusted_sources()
    ok = trusted and (score is None or score >= AUTO_MIN_SCORE) and r_score < 4
    if ok:
        return {"review_status": "auto", "is_active": True}
    classify_stats["pending"] = classify_stats.get("pending", 0) + 1
    return {"review_status": "pending", "is_active": False}


_quality_column_available: bool | None = None


def quality_column_available() -> bool:
    """auditions.quality_score(010) 존재 여부 1회 탐지."""
    global _quality_column_available
    if _quality_column_available is None:
        try:
            supabase.table("auditions").select("quality_score").limit(1).execute()
            _quality_column_available = True
        except Exception:
            _quality_column_available = False
            logger.warning("auditions.quality_score 없음(010 미적용) — 품질 점수 생략")
    return _quality_column_available


def _unescape(text: str | None) -> str | None:
    """HTML 엔티티(&lt; &amp; 등) 디코드 — 이중 이스케이프(&amp;lt;)까지 수렴할 때까지 반복.
    미적용 시 프론트에 '&lt;우리별&gt;'처럼 노출됨 (F10, DB 정정: database/maintenance/fix_html_entities.sql)"""
    if not text:
        return text
    prev = None
    while text != prev:
        prev = text
        text = html.unescape(text)
    return text.strip()


REFINE_MIN_CHARS = 400  # 이보다 짧으면 이미 요약 수준 — 검색 API 요약(네이버카페 ≈100~200자)은 정제 불필요
# 2026-08-22 사용자 지시: Anthropic API 사용 금지(비용 0). 기본은 규칙 기반 summarize(). REFINE_ENABLED=1일 때만 Claude.
REFINE_ENABLED = os.environ.get("REFINE_ENABLED") == "1"


def _refine_if_needed(description: str | None, title: str) -> str | None:
    """긴 본문만 요약(600자). 기본 규칙 기반(비용 0), REFINE_ENABLED=1이면 Claude 정제."""
    if description and len(description.strip()) >= REFINE_MIN_CHARS:
        if REFINE_ENABLED:
            return refine_description(description, title)
        return summarize(description)
    return description


def _is_more_detailed(new: dict, existing: dict) -> bool:
    """새 데이터가 기존 데이터보다 더 상세한지 판단"""
    detail_fields = ["description", "requirements", "apply_email", "company"]
    new_filled = sum(1 for f in detail_fields if new.get(f))
    old_filled = sum(1 for f in detail_fields if existing.get(f))
    return new_filled > old_filled


def upsert_auditions(auditions: list) -> int:
    """
    수집된 오디션을 DB에 저장.
    - source_url 기준 upsert (중복 URL 방지)
    - 제목+주최사+마감일 동일하면 같은 공고로 판단 → 더 상세한 데이터 유지
    """
    saved = 0

    for audition in auditions:
        # source_url 필수 — 없으면 저장 불가 (unique 컬럼)
        if not audition.source_url:
            logger.warning(f"  source_url 없음, 스킵: {audition.title[:40]}")
            continue

        data = {
            "title": _unescape(audition.title),
            "company": _unescape(audition.company),
            **_classify_fields(audition),  # genre(레거시 3분류) + category 4컬럼 (2-1)
            "deadline": audition.deadline.isoformat() if audition.deadline else None,
            "apply_email": audition.apply_email,
            "description": _unescape(audition.description),
            "requirements": _unescape(audition.requirements),
            "source_url": audition.source_url,
            "source_name": audition.source_name,
            "apply_type": "email" if audition.apply_email else "external",
            "is_active": True,
        }
        # suppression 히트 → 저장·재활성화 모두 스킵 (기존 행은 어드민 sweep이 이미 내렸고, 여기서 되살리지 않는다)
        hit = suppression_hit(data["apply_email"], data["source_url"], data["source_name"])
        if hit:
            logger.info(f"  suppression 차단({hit}), 스킵: {data['title'][:40]}")
            continue

        # 검수 큐: 저품질·미신뢰 출처는 pending(비활성). 기존 행 업데이트 경로에서는 상태를 건드리지 않는다(아래에서 제거)
        data.update(_review_fields(data["source_name"], data.get("quality_score"),
                                   data.get("title", ""), data.get("description")))

        try:
            # 1) 제목+주최사+마감일로 기존 중복 확인
            dup_query = supabase.table("auditions").select("*").eq(
                "title", data["title"]
            )
            if data["company"]:
                dup_query = dup_query.eq("company", data["company"])
            if data["deadline"]:
                dup_query = dup_query.eq("deadline", data["deadline"])

            dup_result = dup_query.execute()

            if dup_result.data:
                existing = dup_result.data[0]
                # source_url이 다르지만 같은 공고 → 더 상세한 데이터만 업데이트
                if existing["source_url"] != data["source_url"]:
                    if _is_more_detailed(data, existing):
                        data["description"] = _refine_if_needed(data["description"], audition.title)
                        upd = {k: v for k, v in data.items() if k not in ("review_status", "is_active")}  # 검수 상태 보존
                        supabase.table("auditions").update(upd).eq(
                            "id", existing["id"]
                        ).execute()
                        saved += 1
                        logger.info(f"  중복 공고 업데이트: {data['title']}")
                    else:
                        logger.info(f"  중복 공고 스킵 (기존이 더 상세): {data['title']}")
                    continue

            # 2) source_url 기준 — 기존에 있으면 스킵, 없으면 신규 저장
            existing_by_url = (
                supabase.table("auditions")
                .select("id")
                .eq("source_url", data["source_url"])
                .execute()
            )
            if existing_by_url.data:
                # 이미 존재 → 재발견 표시만 (crawled_at 갱신). 사이트에 아직 걸려 있는 공고가
                # deactivate_stale_undated의 N일 만료에 잘못 걸리지 않게 한다. 재활성화는 검수 거절/대기 행은 제외.
                touch = {"crawled_at": datetime.now(timezone.utc).isoformat()}
                if not review_available():
                    touch["is_active"] = True
                q = supabase.table("auditions").update(touch).eq("id", existing_by_url.data[0]["id"])
                q.execute()
                if review_available():
                    supabase.table("auditions").update({"is_active": True}).eq(
                        "id", existing_by_url.data[0]["id"]
                    ).in_("review_status", ["auto", "approved"]).execute()
                continue

            # 신규 데이터만 description 정제 (Claude API 호출)
            data["description"] = _refine_if_needed(data["description"], audition.title)

            result = (
                supabase.table("auditions")
                .upsert(data, on_conflict="source_url")
                .execute()
            )

            if result.data:
                saved += 1

        except Exception as e:
            logger.error(f"  DB 저장 오류 [{data['title']}]: {e}")
            continue

    return saved


def deactivate_stale_undated(days: int = 45, source_prefix: str | None = None) -> int:
    """마감일이 없는 공고를 마지막 수집(crawled_at) 후 N일 지나면 비활성화.
    - 2026-08-21 실측: 활성 1,854건 중 1,691건(89%)이 필메코·캐스트링크의 4개월 묵은 마감 미상 공고였다(좀비).
      마감일을 위조하지 않는 대신 노출 기간으로 만료시킨다. 재발견되면 upsert가 crawled_at을 갱신·재활성화한다.
    - source_prefix=None이면 전 소스. 네이버카페 등 검색형은 30일로 더 짧게 호출한다(31 §4)."""
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    q = (
        supabase.table("auditions")
        .update({"is_active": False})
        .eq("is_active", True)
        .is_("deadline", "null")
        .lt("crawled_at", cutoff)
    )
    if source_prefix:
        q = q.like("source_name", f"{source_prefix}%")
    result = q.execute()
    count = len(result.data) if result.data else 0
    if count > 0:
        logger.info(f"  마감일 미상 {source_prefix or '전체'} 공고 {count}건 비활성화 ({days}일 경과)")
    return count


def deactivate_expired() -> int:
    """마감일이 지난 공고를 비활성화"""
    today = date.today().isoformat()
    result = (
        supabase.table("auditions")
        .update({"is_active": False})
        .eq("is_active", True)
        .lt("deadline", today)
        .execute()
    )
    count = len(result.data) if result.data else 0
    if count > 0:
        logger.info(f"  마감 공고 {count}건 비활성화")
    return count
