"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ConfigMissing } from "@/components/demo/ConfigMissing";
import { useSettings } from "@/contexts/SettingsContext";
import {
  getPreferredRouteSessionId,
  persistActiveSession,
} from "@/lib/session-id-client";

export function CodeEntryClient({
  sessionId,
  routeSessionId,
}: {
  sessionId: string;
  routeSessionId?: string;
}) {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const { settings, loading: settingsLoading } = useSettings();
  const effectiveRouteSessionId = getPreferredRouteSessionId(sessionId, routeSessionId);
  const [partnerName, setPartnerName] = useState<string>("");
  const [expectedCode, setExpectedCode] = useState<string>("");
  const [enteredCode, setEnteredCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (supabase === null) {
        setLoading(false);
        return;
      }
      const { data, error: qErr } = await supabase
        .from("sessions")
        .select("partner_name, participation_code, form_data")
        .eq("id", sessionId)
        .maybeSingle();

      if (cancelled) return;
      if (qErr || !data) {
        setError("Sesija nerasta arba konfigūracijos klaida.");
        setLoading(false);
        return;
      }

      const formData = data.form_data as Record<string, any>;
      setPartnerName(formData?.partner_display_name || data.partner_name || "partner");
      setExpectedCode(data.participation_code || "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);

    const cleanCode = enteredCode.trim().toLowerCase();
    const expectedCodeClean = expectedCode.trim().toLowerCase();
    if (!cleanCode) {
      setError("Sisestage oma osalemiskood.");
      return;
    }

    if (expectedCodeClean && cleanCode !== expectedCodeClean) {
      setError("Įvestas kodas neteisingas.");
      return;
    }

    setProcessing(true);

    const { error: upErr } = await supabase
      .from("sessions")
      .update({ is_hidden: false, current_step: "win" })
      .eq("id", sessionId);

    if (upErr) {
      setError("Išsaugoti nepavyko. Bandykite dar kartą.");
      setProcessing(false);
      return;
    }

    persistActiveSession(sessionId, effectiveRouteSessionId);

    window.setTimeout(() => {
      setProcessing(false);
      router.push(`/win?session=${encodeURIComponent(effectiveRouteSessionId)}`);
    }, 500);
  }


  if (settingsLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="flex justify-center py-16">
          <div className="size-12 animate-spin rounded-full border-4 border-[var(--brand)]/30 border-t-[var(--brand)]" />
        </div>
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className="flex min-h-[100dvh] items-start justify-center p-3 pt-[16vh] sm:p-6 sm:pt-[26vh]">
        <div className="w-full max-w-[650px] rounded-[24px] bg-[var(--brand-panel)] border border-[var(--brand)] shadow-[0_0_40px_rgba(var(--brand-rgb),0.3)] p-5 sm:p-8">
          <ConfigMissing />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-start justify-center p-3 pt-[16vh] sm:p-6 sm:pt-[26vh]">
        <div className="w-full max-w-[650px] rounded-[24px] bg-[var(--brand-panel)] border border-[var(--brand)] shadow-[0_0_40px_rgba(var(--brand-rgb),0.3)] p-5 sm:p-8 flex justify-center py-16">
          <div className="size-12 animate-spin rounded-full border-4 border-[var(--brand)] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-start justify-center p-3 pt-[16vh] sm:p-6 sm:pt-[26vh]">
      <div className="w-full max-w-[650px] rounded-[24px] bg-[var(--brand-panel)] border border-[var(--brand)] shadow-[0_0_40px_rgba(var(--brand-rgb),0.3)] p-6 sm:p-10 relative z-10 fade-in">
        
        {/* Right Top Logo Placeholder */}
        <div className="absolute right-6 top-6 sm:right-10 sm:top-10">
          <img
            src="/form-assets/iki-mini-logo.png"
            alt="IKI logo"
            className="h-10 w-10 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)]"
            id="code-ah-logo"
          />
        </div>

        <div className="mb-6 flex items-start gap-4">
          <div className="mt-1 shrink-0">
            <img src="/ah-icon-gift-ticket-transparent.png" alt="Gift Ticket" className="h-12 w-12" id="code-gift-icon" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{settings.code_title}</h2>
            <p className="text-sm text-gray-300 font-medium whitespace-pre-line">
              {settings.code_subtitle.split("{partner}").map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && <strong className="text-[var(--brand-dark)] font-bold">{partnerName}</strong>}
                </span>
              ))}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-500/10 p-4 text-center text-sm font-bold text-red-400 border border-red-500/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-white text-left">Osalemiskood</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <img src="/ah-icon-participation-ticket-transparent.png" alt="Ticket" className="h-6 w-6 opacity-70" />
              </div>
              <input
                type="text"
                required
                className="w-full rounded-xl border border-transparent bg-white/10 py-4 pl-12 pr-4 text-2xl font-bold tracking-widest text-white outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/50 transition-all placeholder:text-gray-500 shadow-sm"
                value={enteredCode}
                onChange={(e) => setEnteredCode(e.target.value)}
                placeholder=""
                autoComplete="off"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={processing}
            className="w-full rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-dark)] py-4 text-lg font-bold text-white shadow-[0_0_15px_rgba(var(--brand-rgb),0.4)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {processing ? "Apdorojama..." : settings.code_button}
          </button>
          
          <div className="mt-4 flex items-center justify-center gap-2">
            <img src="/form-assets/icon-security.png" alt="Secure" className="h-5 w-5" />
            <span className="text-[13px] font-medium text-gray-300">
              Teie andmed töötlemisel turvaliselt.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
