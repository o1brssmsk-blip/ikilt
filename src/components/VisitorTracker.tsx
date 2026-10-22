"use client";

import { useEffect, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useParams, usePathname } from "next/navigation";
import { ACTIVE_SESSION_COOKIE } from "@/lib/session-constants";
import {
  ACTIVE_SESSION_EVENT,
  getStoredActiveSessionId,
  persistActiveSession,
} from "@/lib/session-id-client";
import {
  isNumericSessionIdentifier,
  isUuidSessionIdentifier,
} from "@/lib/session-identifiers";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

function readCookieSessionId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${ACTIVE_SESSION_COOKIE}=([^;]*)`),
  );
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]) || undefined;
  } catch {
    return match[1] || undefined;
  }
}

async function resolveClientSessionId(
  sb: SupabaseClient<any, any, any> | null,
  routeSessionId?: string,
  querySessionId?: string | null,
): Promise<{ sessionId: string; routeSessionId: string } | undefined> {
  // URL'den gelen kimlik (route veya ?session=) once gelir.
  // uuid ise direkt kullan; public_id (sayisal) ise DB'den uuid'ye coz.
  // Boylece yeni olusturulan link ile gelen kullanicinin session'i
  // eski localStorage/cookie kalintisi ile karisip "offline" kalmaz.
  const explicit = routeSessionId?.trim() || querySessionId?.trim() || "";
  if (explicit) {
    if (isUuidSessionIdentifier(explicit)) {
      return { sessionId: explicit, routeSessionId: explicit };
    }
    if (isNumericSessionIdentifier(explicit) && sb) {
      try {
        const { data } = await sb
          .from("sessions")
          .select("id, public_id")
          .eq("public_id", Number(explicit))
          .maybeSingle();
        if (data?.id) {
          return {
            sessionId: String(data.id),
            routeSessionId: data.public_id != null ? String(data.public_id) : explicit,
          };
        }
      } catch {
        /* cozumleme basarisizsa depolanmis degere dus */
      }
    }
  }

  const fromLs = getStoredActiveSessionId();
  if (fromLs) return { sessionId: fromLs, routeSessionId: fromLs };

  const fromCookie = readCookieSessionId();
  if (fromCookie) return { sessionId: fromCookie, routeSessionId: fromCookie };

  return undefined;
}

export function VisitorTracker() {
  const pathname = usePathname();
  const params = useParams();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<SupabaseClient<any, any, any> | null>(null);
  const trackedIpForSession = useRef<string | null>(null);

  const publishPresence = async (path: string | null) => {
    const channel = channelRef.current;
    if (!channel || !path || path.startsWith("/admin")) return;

    const routeSessionId = params?.id as string | undefined;
    const querySessionId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("session")
        : null;
    const resolved = await resolveClientSessionId(supabaseRef.current, routeSessionId, querySessionId);
    const sessionId = resolved?.sessionId;

    // Cozulen session'i kalici hale getir: sonraki sayfalarda ve yeniden
    // girislerde dogru session'a bagli kalir (geo muafiyeti + resume icin de)
    if (resolved && getStoredActiveSessionId() !== resolved.sessionId) {
      persistActiveSession(resolved.sessionId, resolved.routeSessionId);
    }

    await channel.track({
      online_at: new Date().toISOString(),
      pathname: path,
      sessionId: sessionId || null,
    });

    if (sessionId && trackedIpForSession.current !== sessionId) {
      trackedIpForSession.current = sessionId;
      fetch("/api/track-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(console.error);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname.startsWith("/admin")) return;

    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    supabaseRef.current = supabase;

    let visitorId = localStorage.getItem("visitor_id");
    if (!visitorId) {
      visitorId = "vis_" + Math.random().toString(36).slice(2, 17);
      localStorage.setItem("visitor_id", visitorId);
    }

    const channel = supabase.channel("online_visitors", {
      config: {
        presence: {
          key: visitorId,
        },
      },
    });
    channelRef.current = channel;

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED" || channelRef.current !== channel) return;
      await publishPresence(window.location.pathname);
    });

    const onSessionChanged = () => {
      void publishPresence(window.location.pathname);
    };
    window.addEventListener(ACTIVE_SESSION_EVENT, onSessionChanged);

    return () => {
      window.removeEventListener(ACTIVE_SESSION_EVENT, onSessionChanged);
      channelRef.current = null;
      supabaseRef.current = null;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void publishPresence(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, params]);

  useEffect(() => {
    const onLeave = () => {
      void channelRef.current?.untrack();
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, []);

  return null;
}
