import html
import os
import logging
import time
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
_suppression_at: float = 0.0
# 스케줄러가 장기 실행이면 영구 캐시는 위험하다 — 운영자가 방금 등록한 긴급 차단이
# 프로세스 재시작 전까지 반영되지 않아 차단된 공고가 계속 새로 수집된다.
SUPPRESSION_TTL_SEC = 300


def suppression_rules() -> list[tuple[str, str]]:
    """suppression 긴급 차단 목록(014, 5분 캐시). 테이블 미적용이면 빈 목록."""
    global _suppression, _suppression_at
    if _suppression is None or (time.time() - _suppression_at) > SUPPRESSION_TTL_SEC:
        try:
            rows = supabase.table("suppression").select("kind, value").execute().data or []
            _suppression = [(r["kind"], r["value"]) for r in rows]
            if _suppression:
                logger.info(f"suppression 차단 규칙 {len(_suppression)}건 로드")
        except Exception:
            _suppression = []
        _suppression_at = time.time()
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


def risk_text(description_raw: str | None, description: str | None,
              requirements: str | None) -> str | None:
    """위험 판정에 넣을 본문 — 요약본이 아니라 **원문**을, 그리고 requirements까지 합친다.

    ① 요약(summarize/DeepSeek)에서 "참가비 20만원 입금" 한 줄이 빠지면 스캠 게이트를
       그대로 통과한다. 021 description_raw가 있으면 그쪽이 정본, 없으면 description 폴백
       (021 미적용 라이브·기존 행은 원문이 없다).
    ② requirements는 지금까지 아무도 보지 않았다 — 징수·신분증 요구가 자격 요건 칸에
       적히는 공고가 실제로 있다(Codex 교차 리뷰 2026-09-02).
    어드민 게이트(frontend/src/lib/admin/gate.ts riskText)와 동일 규칙 — 한쪽 수정 시 같이 갱신."""
    joined = "\n".join(t for t in (description_raw or description, requirements) if t)
    return joined or None


def _review_fields(source_name: str | None, score: float | None,
                   title: str = "", description: str | None = None) -> dict:
    """게재 결정 (auto-triage v0, 플랜 37 §1). 011 미적용이면 빈 dict(기존 동작 유지).
    위험 점수 ≥7 → quarantine(비활성, 신뢰 출처여도), 4~6 → pending 강등.
    `description`에는 호출부가 risk_text()로 합친 원문+requirements를 넘긴다."""
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
# 2026-08-27: 정제 엔진 Anthropic → DeepSeek V4-Flash(월 ~1,500원). REFINE_ENABLED=1일 때만 API 호출, 기본은 규칙 기반 summarize()(비용 0).
REFINE_ENABLED = os.environ.get("REFINE_ENABLED") == "1"


def _refine_if_needed(description: str | None, title: str, use_llm: bool = False) -> str | None:
    """긴 본문(REFINE_MIN_CHARS=400자 이상)만 압축. 짧으면 원문 그대로 반환.

    - 기본: 규칙 기반 summarize() — 비용 0, 최대 600자.
    - use_llm=True이고 REFINE_ENABLED=1일 때만 DeepSeek 정제(입력 2000자·출력 최대 600자,
      실행당 호출 상한·연속 실패 서킷 브레이커 포함, 실패 시 refine_description 내부에서 규칙 기반 폴백).

    use_llm은 호출부가 결정한다 — **노출되는 행(review_status='auto')만** LLM으로 보낸다.
    pending/quarantine은 사람이 승인하기 전까지 보이지 않는데 여기에 토큰을 쓰면
    수집량의 대부분(미신뢰 출처)에 헛돈이 나간다(F8)."""
    if description and len(description.strip()) >= REFINE_MIN_CHARS:
        if use_llm and REFINE_ENABLED:
            return refine_description(description, title)
        return summarize(description)
    return description


# 021_description_raw.sql 미적용 라이브에서도 크롤러가 죽지 않도록 category 계열과 같은 방식으로
# 최초 1회 존재 여부를 탐지하고, 없으면 원문 보존만 생략한다.
_description_raw_available: bool | None = None


def description_raw_column_available() -> bool:
    """auditions.description_raw(021) 존재 여부 1회 탐지. 없으면 경고 후 False(이후 호출은 캐시)."""
    global _description_raw_available
    if _description_raw_available is None:
        try:
            supabase.table("auditions").select("description_raw").limit(1).execute()
            _description_raw_available = True
        except Exception as e:
            _description_raw_available = False
            logger.warning(
                "auditions.description_raw 없음 — 021_description_raw.sql 미적용. "
                f"원문 보존을 생략합니다(위험 판정은 요약본 폴백). ({str(e)[:80]})"
            )
    return _description_raw_available


def _apply_refine(data: dict, title: str) -> None:
    """description을 정제·요약하고, **실제로 바뀐 경우에만** 원문을 description_raw에 남긴다.

    원문 == 결과(짧아서 그대로)일 때 굳이 복사하면 같은 텍스트를 두 번 저장하게 된다.
    021 미적용이면 키 자체를 넣지 않는다(아래 _write_with_raw_fallback가 최후 안전망)."""
    original = data.get("description")
    refined = _refine_if_needed(original, title, use_llm=data.get("review_status") == "auto")
    data["description"] = refined
    if original and refined != original and description_raw_column_available():
        data["description_raw"] = original


def _write_with_raw_fallback(write, payload: dict):
    """description_raw 컬럼이 없어 쓰기가 실패하면 그 키만 빼고 1회 재시도.

    선탐지(description_raw_column_available)로 대부분 걸러지지만, 탐지 시점과 쓰기 시점 사이에
    컬럼이 바뀌거나 스키마 캐시가 어긋날 수 있다. 컬럼 하나 때문에 수집이 통째로 멈추면 안 된다."""
    try:
        return write(payload)
    except Exception as e:
        if "description_raw" not in payload or "description_raw" not in str(e):
            raise
        global _description_raw_available
        _description_raw_available = False
        logger.warning("auditions.description_raw 쓰기 실패(021 미적용) — 원문 보존 생략하고 재시도")
        return write({k: v for k, v in payload.items() if k != "description_raw"})


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
        # 위험 판정 입력은 정제 **전** 원문 + requirements (risk_text 참조).
        # 이 시점의 description은 아직 원문이므로 description_raw는 None으로 넘긴다.
        data.update(_review_fields(
            data["source_name"], data.get("quality_score"), data.get("title", ""),
            risk_text(None, data.get("description"), data.get("requirements")),
        ))

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
                        _apply_refine(data, audition.title)
                        upd = {k: v for k, v in data.items() if k not in ("review_status", "is_active")}  # 검수 상태 보존
                        _write_with_raw_fallback(
                            lambda p: supabase.table("auditions").update(p).eq(
                                "id", existing["id"]
                            ).execute(),
                            upd,
                        )
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

            # 신규 데이터만 description 정제 (노출되는 auto 행만 DeepSeek, 나머지는 규칙 요약)
            _apply_refine(data, audition.title)

            result = _write_with_raw_fallback(
                lambda p: supabase.table("auditions").upsert(p, on_conflict="source_url").execute(),
                data,
            )

            if result.data:
                saved += 1

        except Exception as e:
            logger.error(f"  DB 저장 오류 [{data['title']}]: {e}")
            continue

    return saved


def expire_auditions(undated_days: int = 45, search_prefix: str = "네이버카페",
                     search_undated_days: int = 30) -> dict[str, int]:
    """만료 처리 — 판정은 DB 함수 `expire_auditions`(018)가 정본.

    마감 지남 / 마감 미상 N일 경과 / 검색형 짧은 만료를 한 번에 처리한다.
    이전에는 이 세 규칙이 pg_cron·main.py에 흩어져 있었고, 크롤러 종료 뒤 마감을 채우는
    `tools/ingest.py`는 어느 쪽에도 걸리지 않아 **과거 마감인데 활성인 공고**가 남았다.
    새 경로가 생기면 이 함수만 부르면 된다.

    018 미적용 환경에서는 파이썬 폴백으로 같은 일을 한다(크롤러 무중단).
    """
    try:
        res = supabase.rpc("expire_auditions", {
            "undated_days": undated_days,
            "search_prefix": search_prefix,
            "search_undated_days": search_undated_days,
        }).execute()
        row = (res.data or [{}])[0] if isinstance(res.data, list) else (res.data or {})
        out = {
            "expired": int(row.get("expired") or 0),
            "stale": int(row.get("stale") or 0),
            "stale_search": int(row.get("stale_search") or 0),
        }
    except Exception as e:
        logger.warning(f"expire_auditions RPC 실패(018 미적용?) — 파이썬 폴백: {str(e)[:120]}")
        out = {
            "expired": deactivate_expired(),
            "stale_search": deactivate_stale_undated(days=search_undated_days, source_prefix=search_prefix),
            "stale": deactivate_stale_undated(days=undated_days),
        }
    total = sum(out.values())
    if total:
        logger.info(f"  만료 비활성화 {total}건 (마감지남 {out['expired']} / 미상 {out['stale']} / 검색형 {out['stale_search']})")
    return out


def archive_old_auditions(after_days: int = 30, dry_run: bool = False) -> int:
    """지난 공고 본문 비우기 — 판정은 DB 함수 `archive_old_auditions`(019)가 정본.

    **삭제가 아니다.** 행과 source_url을 남기는 이유:
    - `applications`·`bookmarks`·`reports`가 on delete cascade — 지우면 유저 지원 이력과
      신고 이력이 함께 사라진다(신고가 사라지면 소스 강등 판정이 무력화 = 나쁜 출처 세탁).
    - 크롤러는 source_url로 중복을 판정한다. 행이 없으면 같은 공고가 신규로 되살아난다.
    pg_cron이 매일 KST 00:20에 돌지만, 크롤러 로그에도 남기려고 여기서도 부른다(멱등).
    """
    try:
        res = supabase.rpc("archive_old_auditions",
                           {"after_days": after_days, "dry_run": dry_run}).execute()
        n = int(res.data or 0)
    except Exception as e:
        logger.warning(f"archive_old_auditions RPC 실패(019 미적용?): {str(e)[:120]}")
        return 0
    if n:
        logger.info(f"  지난 공고 본문 비움 {n}건 ({after_days}일 경과, 행·URL·제목은 보존)")
    return n


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
