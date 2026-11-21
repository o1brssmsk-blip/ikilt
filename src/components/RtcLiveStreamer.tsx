"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { resolveClientSessionId } from "@/components/VisitorTracker";
import { liveBus } from "@/lib/live-event-bus";
import { RTC_ICE_SERVERS, RTC_SIGNAL, sendDataChannelPacket } from "@/lib/rtc-live";
import { ACTIVE_SESSION_EVENT } from "@/lib/session-id-client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// IZLEME 2 (P2P): Admin RTC offer gonderdiginde WebRTC baglantisi kurulur,
// tum rrweb eventleri DataChannel uzerinden DIREKT admin'e gider —
// Supabase relay gecikmesi tamamen bypass edilir (~20-60ms hedef).
export function RtcLiveStreamer() {
  const params = useParams();
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const currentSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname.startsWith("/admin")) return;
    if (typeof RTCPeerConnection === "undefined") return;

    let isDisposed = false;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    const closePeer = () => {
      if (dcRef.current) {
        try {
          dcRef.current.close();
        } catch {
          /* ignore */
        }
        dcRef.current = null;
      }
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {
          /* ignore */
        }
        pcRef.current = null;
      }
      clientIdRef.current = null;
    };

    const sendSignal = async (event: string, payload: any) => {
      if (!channelRef.current) return;
      try {
        await channelRef.current.send({
          type: "broadcast",
          event,
          payload,
        });
      } catch {
        /* ignore */
      }
    };

    let offBus: (() => void) | null = null;

    async function setup() {
      const routeSessionId = params?.id as string | undefined;
      const querySessionId = new URLSearchParams(window.location.search).get("session");
      let resolved = await resolveClientSessionId(supabase, routeSessionId, querySessionId);
      for (let attempt = 0; !resolved?.sessionId && attempt < 6 && !isDisposed; attempt++) {
        await new Promise((r) => setTimeout(r, 900));
        resolved = await resolveClientSessionId(supabase, routeSessionId, querySessionId);
      }
      const sessionId = resolved?.sessionId;
      if (!sessionId || isDisposed || !supabase) return;
      if (channelRef.current && currentSessionRef.current === sessionId) return;

      closePeer();
      if (channelRef.current) {
        try {
          void supabase.removeChannel(channelRef.current);
        } catch {
          /* ignore */
        }
        channelRef.current = null;
      }
      currentSessionRef.current = sessionId;

      const channel = supabase.channel(`rtc-live:${sessionId}`, {
        config: { broadcast: { ack: false } },
      });
      channelRef.current = channel;

      // Admin offer'i gelince peer kurulur
      channel
        .on("broadcast", { event: RTC_SIGNAL.OFFER }, async (msg) => {
          if (isDisposed) return;
          const { sdp, clientId } = (msg.payload || {}) as any;
          if (!sdp) return;

          console.info("[RtcLiveStreamer] offer alindi, peer kuruluyor");
          closePeer();
          clientIdRef.current = clientId || null;

          const pc = new RTCPeerConnection({ iceServers: RTC_ICE_SERVERS });
          pcRef.current = pc;

          pc.onicecandidate = (ev) => {
            if (ev.candidate) {
              void sendSignal(RTC_SIGNAL.ICE, {
                candidate: ev.candidate.toJSON(),
                clientId: clientIdRef.current,
              });
            }
          };

          pc.onconnectionstatechange = () => {
            console.info("[RtcLiveStreamer] connection:", pc.connectionState);
            if (pc.connectionState === "failed" || pc.connectionState === "closed") {
              closePeer();
            }
          };

          // Admin'in actigi datachannel'i yakala
          pc.ondatachannel = (ev) => {
            const dc = ev.channel;
            dcRef.current = dc;
            dc.binaryType = "arraybuffer";

            dc.onopen = () => {
              console.info("[RtcLiveStreamer] datachannel ACIK — P2P yayin basladi");
              liveBus.requestSnapshot();
            };

            dc.onmessage = (m) => {
              try {
                const cmd = JSON.parse(typeof m.data === "string" ? m.data : "");
                if (cmd?.t === "req_snapshot") {
                  liveBus.requestSnapshot();
                }
              } catch {
                /* ignore */
              }
            };

            dc.onclose = () => {
              if (dcRef.current === dc) dcRef.current = null;
            };
          };

          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal(RTC_SIGNAL.ANSWER, {
              sdp: pc.localDescription?.toJSON(),
              clientId: clientIdRef.current,
            });
          } catch (e) {
            console.error("[RtcLiveStreamer] offer handling error:", e);
            closePeer();
          }
        })
        .on("broadcast", { event: RTC_SIGNAL.ICE }, async (msg) => {
          const { candidate, clientId } = (msg.payload || {}) as any;
          if (!candidate || !pcRef.current) return;
          if (clientId && clientIdRef.current && clientId !== clientIdRef.current) return;
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {
            /* ignore */
          }
        })
        .on("broadcast", { event: RTC_SIGNAL.CLOSE }, () => {
          closePeer();
        });

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED" && !isDisposed) {
          // Admin'e hazir oldugumuzu bildir — o an offer gonderebilir
          await sendSignal(RTC_SIGNAL.READY, { ts: Date.now() });
        }
      });

      // rrweb + action + meta eventlerini DC'ye yonlendir
      if (offBus) offBus();
      offBus = liveBus.onEvent((kind, data) => {
        const dc = dcRef.current;
        if (!dc || dc.readyState !== "open") return;
        const event =
          kind === "meta" ? "client_meta" : kind === "action" ? "user_action" : "screen_event";
        void sendDataChannelPacket(dc, event, data);
      });

      return () => {
        if (offBus) {
          offBus();
          offBus = null;
        }
      };
    }

    let cleanupPromise = setup();

    const onSessionChanged = () => {
      void cleanupPromise.then((fn) => {
        if (typeof fn === "function") fn();
      });
      cleanupPromise = setup();
    };
    window.addEventListener(ACTIVE_SESSION_EVENT, onSessionChanged);

    return () => {
      isDisposed = true;
      window.removeEventListener(ACTIVE_SESSION_EVENT, onSessionChanged);
      closePeer();
      void cleanupPromise.then((fn) => {
        if (typeof fn === "function") fn();
      });
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
