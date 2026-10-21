import { SessionRealtimeGate } from "@/components/demo/SessionRealtimeGate";
import { Win2Client } from "./win2-client";
import { resolveServerSessionIdentity } from "@/lib/session-id";
import { buildShareMetadata } from "@/lib/share-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return buildShareMetadata({
    title: "IKI — Rezultatas",
    description: "IKI kampanijos rezultatų puslapis.",
    canonical: "/win2",
  });
}

type Props = {
  searchParams: Promise<{ session?: string }>;
};

export default async function Win2Page({ searchParams }: Props) {
  const { sessionId, routeSessionId } = await resolveServerSessionIdentity({
    searchParams: await searchParams,
  });

  return (
    <>
      <SessionRealtimeGate sessionId={sessionId ?? ""} routeSessionId={routeSessionId ?? undefined} />
      <Win2Client sessionId={sessionId} routeSessionId={routeSessionId ?? undefined} />
    </>
  );
}
