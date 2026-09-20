"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";

/** GA is optional; the DB is the signup source of truth, not browser delivery. */
export function SignupAnalytics({ measurementId }: { measurementId: string }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !initialized || !user || typeof window.gtag !== "function") return;
    if (pathname === "/reset-password" || pathname.startsWith("/auth/")) return;
    if (attempted.current === user.id) return;
    attempted.current = user.id;
    // No cleanup cancellation: StrictMode must not discard a successfully claimed event.
    void fetch("/api/analytics/signup", { method: "POST", credentials: "same-origin" })
      .then(async response => {
        if (!response.ok) return;
        const { event } = await response.json();
        if (event?.name === "sign_up" && (event.method === "email" || event.method === "google")) {
          track("sign_up", { method: event.method });
        }
      })
      .catch(() => { /* Analytics must not interrupt the user flow. */ });
  }, [ready, initialized, user, pathname]);

  return <>
    <Script id="ga4-init" strategy="afterInteractive" onReady={() => setInitialized(true)}>
      {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(measurementId)});`}
    </Script>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" onReady={() => setReady(true)} />
  </>;
}
