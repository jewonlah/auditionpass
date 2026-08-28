"use client";

import { useEffect } from "react";

/**
 * 유입 경로 수집 (2026-08-28 신설).
 *
 * 그전까지 가입자가 어디서 왔는지 알 방법이 없었다. auth 의 provider 는 "로그인 수단"이지
 * 유입 경로가 아니고, Vercel Analytics 는 전체 방문 기준이라 **개별 가입자와 연결되지 않는다**.
 *
 * 방식: 첫 방문의 referrer·UTM 을 sessionStorage 가 아닌 localStorage 에 한 번만 적어둔다
 * (가입은 대개 첫 방문에 안 일어나므로 세션을 넘겨 살아남아야 한다). 가입 시 이 값을
 * user_metadata.signup_source 로 올려 /admin/users 에서 보인다.
 *
 * 개인정보: 저장하는 건 유입 도메인과 UTM 파라미터뿐이고 개인 식별정보가 아니다.
 * 쿠키를 쓰지 않아 동의 배너 대상도 아니다. 첫 값만 유지한다(마지막 클릭이 아니라 최초 유입 기준).
 */

const KEY = "ap_attribution_v1";

export interface Attribution {
  source: string;
  referrer: string | null;
  utm: Record<string, string>;
  landing: string;
  at: string;
}

/** 저장된 최초 유입 정보. 없으면 null. 가입 처리에서 읽어 쓴다. */
export function readAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

function classify(referrer: string | null, utm: Record<string, string>): string {
  if (utm.utm_source) {
    return [utm.utm_source, utm.utm_medium].filter(Boolean).join("/");
  }
  if (!referrer) return "direct";
  let host = "";
  try {
    host = new URL(referrer).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
  if (/^(m\.)?search\.naver\.com$|^search\.naver\.com$/.test(host)) return "naver/search";
  if (host.endsWith("naver.com")) return "naver";
  if (host.includes("google.")) return "google/search";
  if (host.includes("daum.net") || host.includes("kakao.com")) return "daum-kakao";
  if (host.includes("bing.com")) return "bing/search";
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("threads.")) return "threads";
  if (host.includes("youtube.com")) return "youtube";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("x.com") || host.includes("twitter.com")) return "x";
  if (host.includes("facebook.com")) return "facebook";
  if (host.includes("chatgpt.com") || host.includes("openai.com")) return "chatgpt";
  if (host.includes("perplexity.ai")) return "perplexity";
  if (host.includes("claude.ai") || host.includes("anthropic.com")) return "claude";
  if (host.includes("auditionpass")) return "internal";
  return host;
}

export function AttributionTracker() {
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return; // 최초 유입만 기록한다

      const params = new URLSearchParams(window.location.search);
      const utm: Record<string, string> = {};
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
        const v = params.get(k);
        if (v) utm[k] = v.slice(0, 60);
      }

      const referrer = document.referrer || null;
      // 자기 사이트에서 넘어온 것은 유입이 아니다
      if (referrer && !Object.keys(utm).length) {
        try {
          if (new URL(referrer).host === window.location.host) return;
        } catch {
          /* 파싱 실패는 무시하고 그대로 기록 */
        }
      }

      const data: Attribution = {
        source: classify(referrer, utm),
        referrer: referrer ? referrer.slice(0, 200) : null,
        utm,
        landing: window.location.pathname.slice(0, 120),
        at: new Date().toISOString(),
      };
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // localStorage 차단(시크릿 모드 등) — 수집을 포기할 뿐 화면에는 영향 없다
    }
  }, []);

  return null;
}
