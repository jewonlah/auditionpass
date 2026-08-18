"""
Supabase Storage 이미지 업로더
— 생성된 이미지를 Supabase Storage에 업로드하여 공개 URL 확보
— Instagram/Threads API는 공개 접근 가능한 이미지 URL을 요구
"""

import os
import logging
from pathlib import Path
from supabase import create_client

logger = logging.getLogger(__name__)

BUCKET_NAME = "sns-images"


def _get_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 필요")
    return create_client(url, key)


def ensure_bucket(client):
    """버킷이 없으면 생성 (공개 읽기 허용)"""
    try:
        client.storage.get_bucket(BUCKET_NAME)
    except Exception:
        client.storage.create_bucket(
            BUCKET_NAME,
            options={"public": True},
        )
        logger.info(f"버킷 생성 완료: {BUCKET_NAME}")


def upload_image(image_path: Path) -> str:
    """
    이미지를 Supabase Storage에 업로드하고 공개 URL을 반환.
    같은 파일명이 존재하면 덮어쓴다.
    """
    client = _get_client()
    ensure_bucket(client)

    file_name = image_path.name
    storage_path = f"posts/{file_name}"

    with open(image_path, "rb") as f:
        file_bytes = f.read()

    # 기존 파일 삭제 후 업로드 (upsert)
    try:
        client.storage.from_(BUCKET_NAME).remove([storage_path])
    except Exception:
        pass

    client.storage.from_(BUCKET_NAME).upload(
        storage_path,
        file_bytes,
        file_options={"content-type": "image/png"},
    )

    public_url = client.storage.from_(BUCKET_NAME).get_public_url(storage_path)
    logger.info(f"업로드 완료: {file_name} → {public_url}")
    return public_url
