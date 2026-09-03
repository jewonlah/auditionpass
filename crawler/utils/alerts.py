"""
소스 사망 경보 발송 (30 마스터플랜 2-4 마무리, 2026-09-03).

main.py가 crawl_log.dead_sources()로 "사망"(예전엔 저장했는데 최근 3일 0건) 소스를 찾아도
logger.error 한 줄로 끝나면 아무도 안 본다. 이 모듈이 Resend로 실제 메일을 보내 사람에게 닿게 한다.

- 발송 조건: env RESEND_API_KEY + ALERT_EMAIL 둘 다 있어야 함. 없으면 조용히 스킵(로그만, 크롤러는 계속).
- 발신 도메인: frontend/src/lib/email/resend.ts의 FROM_EMAIL과 같은 auditionpass.co.kr 도메인
  (SPF/DKIM/DMARC 인증이 그 도메인에 걸려 있다 — CLAUDE.email.md).
- 중복 억제: 소스별 24시간 내 재발송 금지 (crawler/logs/alert_state.json).
- 미개통(never)은 참고용으로만 본문에 넣는다 — 발송 트리거는 사망(dead)뿐.
- 실패해도 예외를 밖으로 내지 않는다(경보 때문에 크롤러 본작업이 멈추면 안 됨).

주의: CI(GitHub Actions)는 러너가 매번 폐기되어 alert_state.json이 남지 않는다 — 억제는
머신 단위·로컬 스케줄러(run_local.ps1)에서만 성립한다. GH 실행은 하루 1회라 억제가 안
먹어도 최대 1통이 더 나가는 정도다(적대적 리뷰 2026-09).
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from utils import crawl_log

logger = logging.getLogger(__name__)

_DEFAULT_STATE_PATH = Path(__file__).resolve().parent.parent / "logs" / "alert_state.json"
_SUPPRESS_HOURS = 24
_STATE_PRUNE_DAYS = 30  # 이보다 오래된 state 항목은 정리(파일이 무한히 자라지 않게)
_KST = timezone(timedelta(hours=9))
_ADMIN_URL = "https://www.auditionpass.co.kr/admin/sources"


def _redact(msg: str, secret: str | None) -> str:
    """예외 메시지에 시크릿이 그대로 섞여 나오는 걸 막는다(헤더 구성 중 ValueError 등으로
    Authorization 값이 str(e)에 노출될 수 있다)."""
    if secret and secret in msg:
        return msg.replace(secret, "***")
    return msg


def _load_state(path: Path) -> dict:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning(f"[경보] alert_state 읽기 실패: {str(e)[:100]}")
    return {}


def _save_state(path: Path, state: dict) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    except Exception as e:
        # 메일은 이미 발송됐다 — 상태 저장 실패는 다음 실행에서 중복 발송을 부를 뿐이라
        # 크롤러를 막을 정도는 아니지만, 조용히 warning으로 묻으면 재발을 못 잡으니 error로 올린다.
        logger.error(f"[경보] alert_state 저장 실패: {str(e)[:100]}")


def _prune_state(state: dict, now: datetime) -> dict:
    """_STATE_PRUNE_DAYS보다 오래됐거나 파싱 안 되는 항목은 버린다."""
    out: dict = {}
    for name, ts in state.items():
        try:
            dt = datetime.fromisoformat(ts)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if now - dt <= timedelta(days=_STATE_PRUNE_DAYS):
            out[name] = ts
    return out


def _eligible(dead: list[str], state: dict, now: datetime) -> list[str]:
    """24시간 내 이미 발송한 소스는 뺀다.

    naive datetime(타임존 없음)이면 UTC로 간주한다 — 아니면 tz-aware(now)와 빼기에서
    TypeError가 나서 억제 판단 자체가 무력화된다. 파싱 자체가 실패하면 warning을 남기고
    억제하지 않는다(fail-open — 침묵보다 중복 발송이 낫다).
    """
    out = []
    for name in dead:
        last = state.get(name)
        if last is None:
            out.append(name)
            continue
        try:
            last_dt = datetime.fromisoformat(last)
        except Exception as e:
            logger.warning(f"[경보] alert_state 시각 파싱 실패({name}): {str(e)[:100]} — 억제하지 않고 발송 대상에 포함")
            out.append(name)
            continue
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        if now - last_dt < timedelta(hours=_SUPPRESS_HOURS):
            continue
        out.append(name)
    return out


def _build_body(dead: list[str], never: list[str]) -> str:
    stats = crawl_log.source_snapshot(dead)
    lines = [
        f"오디션패스 크롤러가 소스 사망 의심 {len(dead)}건을 감지했습니다.",
        "(예전엔 저장했는데 최근 3일 동안 신규 저장이 0건인 소스)",
        "",
    ]
    for name in dead:
        st = stats.get(name, {})
        last = st.get("last_saved_date") or "기록 없음"
        recent = st.get("recent_collected", 0)
        lines.append(f"- {name}: 마지막 저장일 {last} / 최근 3일 수집 {recent}건")
    if never:
        lines.append("")
        lines.append("[참고] 최근 30일간 저장 0건(미개통·비수기, 경보 대상 아님):")
        lines.append(", ".join(never))
    lines.append("")
    lines.append(f"확인: {_ADMIN_URL}")
    return "\n".join(lines)


def notify_dead_sources(dead: list, never: list, *, state_path: Path | None = None) -> bool:
    """사망 소스 경보 메일 발송. 실패해도 예외를 밖으로 내지 않고 False를 반환한다."""
    api_key = None
    try:
        api_key = os.environ.get("RESEND_API_KEY")
        recipients_raw = os.environ.get("ALERT_EMAIL")
        if not api_key or not recipients_raw:
            logger.info("[경보] RESEND_API_KEY 또는 ALERT_EMAIL 미설정 — 소스 사망 메일 스킵")
            return False
        if not dead:
            return False

        path = state_path or _DEFAULT_STATE_PATH
        now = datetime.now(_KST)
        state = _load_state(path)
        eligible = _eligible(dead, state, now)
        if not eligible:
            logger.info("[경보] 사망 소스 전부 24시간 내 재발송 억제 — 스킵")
            return False

        recipients = [r.strip() for r in recipients_raw.split(",") if r.strip()]
        # os.environ.get(k, default)는 키가 있고 값이 빈 문자열이면 기본값 대신 ""를 돌려준다
        # (.env.example의 `ALERT_FROM=`처럼 키만 있고 값이 없는 경우) — Resend 422로 메일이
        # 영영 안 나가는 사고였다(적대적 리뷰 2026-09).
        from_addr = os.environ.get("ALERT_FROM") or "alerts@auditionpass.co.kr"
        body = _build_body(eligible, never)

        resp = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "from": from_addr,
                "to": recipients,
                "subject": f"[오디션패스] 소스 사망 의심 {len(eligible)}건",
                "text": body,
            },
            timeout=10,
        )
        if resp.status_code >= 400:
            logger.warning(f"[경보] 메일 발송 실패({resp.status_code}): {str(resp.text)[:200]}")
            return False

        for name in eligible:
            state[name] = now.isoformat()
        state = _prune_state(state, now)
        _save_state(path, state)
        logger.info(f"[경보] 소스 사망 메일 발송 완료 ({len(eligible)}건): {', '.join(eligible)}")
        return True
    except Exception as e:
        logger.warning(f"[경보] 메일 발송 예외: {_redact(str(e)[:200], api_key)}")
        return False
