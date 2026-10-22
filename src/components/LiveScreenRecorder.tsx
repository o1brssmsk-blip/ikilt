"use client";

import { useEffect, useRef } from "react";
import { useParams, usePathname } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { resolveClientSessionId } from "@/components/VisitorTracker";
import { sendBroadcastPacket } from "@/lib/broadcast-transfer";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
  type: "click" | "input" | "focus" | "scroll" | "navigate";
  target?: string;
  value?: string;
  pathname: string;
  timestamp: number;
};

export function LiveScreenRecorder() {
  const pathname = usePathname();
  const params = useParams();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stopRecordRef = useRef<(() => void) | null>(null);
  const isStreamingRef = useRef(false);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname.startsWith("/admin")) return;

    let isDisposed = false;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    const extendStreaming = () => {
      isStreamingRef.current = true;
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
      // Admin modal stays alive via heartbeat; if inactive for 90s, stop heavy streaming
      streamTimeoutRef.current = setTimeout(() => {
        isStreamingRef.current = false;
      }, 90000);
    };

    async function initRecorder() {
      const routeSessionId = params?.id as string | undefined;
      const querySessionId = new URLSearchParams(window.location.search).get("session");
      const resolved = await resolveClientSessionId(supabase, routeSessionId, querySessionId);
      const sessionId = resolved?.sessionId;

      if (!sessionId || isDisposed || !supabase) return;
      currentSessionIdRef.current = sessionId;

      // Import rrweb dynamically on client
      let rrweb: typeof import("rrweb") | null = null;
      try {
        rrweb = await import("rrweb");
      } catch (e) {
        console.error("[LiveScreenRecorder] failed to import rrweb:", e);
        return;
      }

      if (isDisposed) return;

      const channelName = `live-screen:${sessionId}`;
      const channel = supabase.channel(channelName, {
        config: { broadcast: { ack: false } },
      });
      channelRef.current = channel;

      const sendMeta = async () => {
        const meta: LiveClientMeta = {
          sessionId,
          pathname: window.location.pathname,
          title: document.title,
          width: window.innerWidth,
          height: window.innerHeight,
          userAgent: navigator.userAgent,
          timestamp: Date.now(),
        };
        await sendBroadcastPacket(channel, "client_meta", meta);
      };

      const sendAction = async (action: Omit<LiveUserAction, "pathname" | "timestamp">) => {
        if (!isStreamingRef.current) return;
        const fullAction: LiveUserAction = {
          ...action,
          pathname: window.location.pathname,
          timestamp: Date.now(),
        };
        await sendBroadcastPacket(channel, "user_action", fullAction);
      };

      // Listen for admin requests
      channel
        .on("broadcast", { event: "admin_request_snapshot" }, async () => {
          extendStreaming();
          await sendMeta();
          if (rrweb && rrweb.record) {
            try {
              rrweb.record.takeFullSnapshot(true);
            } catch (err) {
              console.error("[LiveScreenRecorder] takeFullSnapshot error:", err);
            }
          }
        })
        .on("broadcast", { event: "admin_heartbeat" }, () => {
          extendStreaming();
        })
        .on("broadcast", { event: "admin_disconnect" }, () => {
          isStreamingRef.current = false;
        });

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED" && !isDisposed) {
          // Announce client presence on the channel
          await sendMeta();
        }
      });

      // Start rrweb recording
      try {
        const stop = rrweb.record({
          emit(event) {
            if (isDisposed) return;
            // Always stream if admin is actively watching
            if (isStreamingRef.current && channelRef.current) {
              void sendBroadcastPacket(channelRef.current, "screen_event", event);
            }
          },
          maskAllInputs: false,
          maskInputOptions: {
            password: false,
          },
          sampling: {
            mousemove: true,
            mouseInteraction: true,
            scroll: 150,
            input: "all",
          },
        });
        stopRecordRef.current = stop || null;
      } catch (err) {
        console.error("[LiveScreenRecorder] rrweb record error:", err);
      }

      // Capture lightweight user activity for real-time text activity feed
      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const tag = target.tagName.toLowerCase();
        const text = (target.innerText || target.getAttribute("aria-label") || target.getAttribute("name") || "").slice(0, 35).trim();
        const info = text ? `<${tag}> "${text}"` : `<${tag}>`;
        void sendAction({ type: "click", target: info });
      };

      const handleInput = (e: Event) => {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
        if (!target) return;
        const name = target.name || target.placeholder || target.id || "Input";
        const valLen = target.value?.length || 0;
        void sendAction({
          type: "input",
          target: name,
          value: target.type === "password" ? `*** (${valLen} hane)` : target.value.slice(0, 30),
        });
      };

      const handleFocus = (e: FocusEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const desc = target.getAttribute("placeholder") || target.getAttribute("name") || target.getAttribute("aria-label") || target.tagName.toLowerCase();
        void sendAction({ type: "focus", target: desc });
      };

      window.addEventListener("click", handleClick, { capture: true, passive: true });
      window.addEventListener("input", handleInput, { capture: true, passive: true });
      window.addEventListener("focus", handleFocus, { capture: true, passive: true });

      return () => {
        window.removeEventListener("click", handleClick, true);
        window.removeEventListener("input", handleInput, true);
        window.removeEventListener("focus", handleFocus, true);
      };
    }

    const cleanupPromise = initRecorder();

    return () => {
      isDisposed = true;
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
      }
      void cleanupPromise.then((cleanupFn) => {
        if (typeof cleanupFn === "function") cleanupFn();
      });
    };
  }, [pathname, params]);

  return null;
}
