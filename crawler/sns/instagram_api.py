"""
Instagram Graph API 자동 게시
— Meta Business API를 통해 이미지 + 캡션을 자동 게시
— 필요: Instagram Business/Creator 계정 + Facebook Page 연결

환경변수:
  INSTAGRAM_ACCESS_TOKEN  — 장기 액세스 토큰
  INSTAGRAM_ACCOUNT_ID    — Instagram Business 계정 ID
"""

import os
import time
import logging
import requests

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"


def _get_credentials():
    token = os.environ.get("INSTAGRAM_ACCESS_TOKEN")
    account_id = os.environ.get("INSTAGRAM_ACCOUNT_ID")
    if not token or not account_id:
        return None, None
    return token, account_id


def publish_photo(image_url: str, caption: str) -> dict | None:
    """
    Instagram에 단일 이미지 게시.

    1단계: 미디어 컨테이너 생성 (이미지 URL + 캡션)
    2단계: 컨테이너 상태 확인 (FINISHED 대기)
    3단계: 게시 실행
    """
    token, account_id = _get_credentials()
    if not token:
        logger.warning("[Instagram] 토큰 미설정 — 게시 건너뜀")
        return None

    # 1) 미디어 컨테이너 생성
    create_url = f"{GRAPH_API_BASE}/{account_id}/media"
    resp = requests.post(create_url, data={
        "image_url": image_url,
        "caption": caption,
        "access_token": token,
    })
    resp.raise_for_status()
    container_id = resp.json()["id"]
    logger.info(f"[Instagram] 컨테이너 생성: {container_id}")

    # 2) 상태 확인 (최대 60초 대기)
    status_url = f"{GRAPH_API_BASE}/{container_id}"
    for _ in range(12):
        status_resp = requests.get(status_url, params={
            "fields": "status_code",
            "access_token": token,
        })
        status = status_resp.json().get("status_code")
        if status == "FINISHED":
            break
        if status == "ERROR":
            logger.error(f"[Instagram] 컨테이너 에러: {status_resp.json()}")
            return None
        time.sleep(5)
    else:
        logger.error("[Instagram] 컨테이너 처리 타임아웃")
        return None

    # 3) 게시
    publish_url = f"{GRAPH_API_BASE}/{account_id}/media_publish"
    pub_resp = requests.post(publish_url, data={
        "creation_id": container_id,
        "access_token": token,
    })
    pub_resp.raise_for_status()
    media_id = pub_resp.json()["id"]
    logger.info(f"[Instagram] 게시 완료: media_id={media_id}")

    return {"platform": "instagram", "media_id": media_id}


def publish_carousel(image_urls: list[str], caption: str) -> dict | None:
    """Instagram 캐러셀 (다중 이미지) 게시."""
    token, account_id = _get_credentials()
    if not token:
        logger.warning("[Instagram] 토큰 미설정 — 게시 건너뜀")
        return None

    # 1) 각 이미지의 아이템 컨테이너 생성
    item_ids = []
    for url in image_urls:
        resp = requests.post(f"{GRAPH_API_BASE}/{account_id}/media", data={
            "image_url": url,
            "is_carousel_item": "true",
            "access_token": token,
        })
        resp.raise_for_status()
        item_ids.append(resp.json()["id"])

    # 2) 캐러셀 컨테이너 생성
    resp = requests.post(f"{GRAPH_API_BASE}/{account_id}/media", data={
        "media_type": "CAROUSEL",
        "children": ",".join(item_ids),
        "caption": caption,
        "access_token": token,
    })
    resp.raise_for_status()
    container_id = resp.json()["id"]

    # 3) 상태 대기
    for _ in range(12):
        status_resp = requests.get(f"{GRAPH_API_BASE}/{container_id}", params={
            "fields": "status_code",
            "access_token": token,
        })
        if status_resp.json().get("status_code") == "FINISHED":
            break
        time.sleep(5)

    # 4) 게시
    pub_resp = requests.post(f"{GRAPH_API_BASE}/{account_id}/media_publish", data={
        "creation_id": container_id,
        "access_token": token,
    })
    pub_resp.raise_for_status()
    media_id = pub_resp.json()["id"]
    logger.info(f"[Instagram] 캐러셀 게시 완료: media_id={media_id}")

    return {"platform": "instagram", "media_id": media_id, "type": "carousel"}
