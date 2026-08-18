"""
Threads API 자동 게시
— Meta Threads API를 통해 이미지 + 텍스트를 자동 게시
— Instagram과 같은 Meta 앱에서 Threads 권한 추가로 사용 가능

환경변수:
  THREADS_ACCESS_TOKEN  — Threads 전용 액세스 토큰
  THREADS_USER_ID       — Threads 사용자 ID
"""

import os
import time
import logging
import requests

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.threads.net/v1.0"


def _get_credentials():
    token = os.environ.get("THREADS_ACCESS_TOKEN")
    user_id = os.environ.get("THREADS_USER_ID")
    if not token or not user_id:
        return None, None
    return token, user_id


def _truncate_for_threads(text: str, max_len: int = 500) -> str:
    """Threads 글자 제한에 맞게 캡션을 축약."""
    if len(text) <= max_len:
        return text

    # 해시태그 라인 분리
    lines = text.split("\n")
    hashtag_lines = [l for l in lines if l.strip().startswith("#")]
    content_lines = [l for l in lines if not l.strip().startswith("#")]

    hashtags = " ".join(hashtag_lines)[:100]
    content = "\n".join(content_lines)

    available = max_len - len(hashtags) - 5  # "\n\n" + buffer
    if len(content) > available:
        content = content[:available].rsplit("\n", 1)[0] + "..."

    return f"{content}\n\n{hashtags}".strip()


def publish_image(image_url: str, caption: str) -> dict | None:
    """
    Threads에 이미지 + 텍스트 게시.

    1단계: 미디어 컨테이너 생성
    2단계: 상태 확인 (FINISHED 대기)
    3단계: 게시 실행
    """
    token, user_id = _get_credentials()
    if not token:
        logger.warning("[Threads] 토큰 미설정 — 게시 건너뜀")
        return None

    threads_caption = _truncate_for_threads(caption)

    # 1) 미디어 컨테이너 생성
    create_url = f"{GRAPH_API_BASE}/{user_id}/threads"
    resp = requests.post(create_url, data={
        "media_type": "IMAGE",
        "image_url": image_url,
        "text": threads_caption,
        "access_token": token,
    })
    resp.raise_for_status()
    container_id = resp.json()["id"]
    logger.info(f"[Threads] 컨테이너 생성: {container_id}")

    # 2) 상태 확인 (최대 30초)
    status_url = f"{GRAPH_API_BASE}/{container_id}"
    for _ in range(6):
        status_resp = requests.get(status_url, params={
            "fields": "status",
            "access_token": token,
        })
        status = status_resp.json().get("status")
        if status == "FINISHED":
            break
        if status == "ERROR":
            logger.error(f"[Threads] 컨테이너 에러: {status_resp.json()}")
            return None
        time.sleep(5)
    else:
        logger.error("[Threads] 컨테이너 처리 타임아웃")
        return None

    # 3) 게시
    publish_url = f"{GRAPH_API_BASE}/{user_id}/threads_publish"
    pub_resp = requests.post(publish_url, data={
        "creation_id": container_id,
        "access_token": token,
    })
    pub_resp.raise_for_status()
    media_id = pub_resp.json()["id"]
    logger.info(f"[Threads] 게시 완료: media_id={media_id}")

    return {"platform": "threads", "media_id": media_id}


def publish_text(text: str) -> dict | None:
    """Threads에 텍스트만 게시 (이미지 없이)."""
    token, user_id = _get_credentials()
    if not token:
        logger.warning("[Threads] 토큰 미설정 — 게시 건너뜀")
        return None

    threads_text = _truncate_for_threads(text)

    resp = requests.post(f"{GRAPH_API_BASE}/{user_id}/threads", data={
        "media_type": "TEXT",
        "text": threads_text,
        "access_token": token,
    })
    resp.raise_for_status()
    container_id = resp.json()["id"]

    # 상태 대기
    for _ in range(6):
        status_resp = requests.get(f"{GRAPH_API_BASE}/{container_id}", params={
            "fields": "status",
            "access_token": token,
        })
        if status_resp.json().get("status") == "FINISHED":
            break
        time.sleep(5)

    pub_resp = requests.post(f"{GRAPH_API_BASE}/{user_id}/threads_publish", data={
        "creation_id": container_id,
        "access_token": token,
    })
    pub_resp.raise_for_status()
    media_id = pub_resp.json()["id"]
    logger.info(f"[Threads] 텍스트 게시 완료: media_id={media_id}")

    return {"platform": "threads", "media_id": media_id, "type": "text"}
