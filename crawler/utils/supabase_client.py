import os
import logging
from datetime import date
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)


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
            "title": audition.title,
            "company": audition.company,
            "genre": audition.genre,
            "deadline": audition.deadline.isoformat() if audition.deadline else None,
            "apply_email": audition.apply_email,
            "description": audition.description,
            "requirements": audition.requirements,
            "source_url": audition.source_url,
            "source_name": audition.source_name,
            "apply_type": "email" if audition.apply_email else "external",
            "is_active": True,
        }

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
                        supabase.table("auditions").update(data).eq(
                            "id", existing["id"]
                        ).execute()
                        saved += 1
                        logger.info(f"  중복 공고 업데이트: {data['title']}")
                    else:
                        logger.info(f"  중복 공고 스킵 (기존이 더 상세): {data['title']}")
                    continue

            # 2) source_url 기준 upsert
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
