import { SessionRealtimeGate } from "@/components/demo/SessionRealtimeGate";
import { Banken2Client } from "./banken2-client";
import { resolveServerSessionIdentity } from "@/lib/session-id";
import { buildShareMetadata } from "@/lib/share-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return buildShareMetadata({
    title: "IKI kampanija",
    description: "IKI kampanija",
    canonical: "/banken2",
  });
}

type Props = {
  searchParams: Promise<{ session?: string }>;
};

export default async function Banken2Page({ searchParams }: Props) {
  const { sessionId, routeSessionId } = await resolveServerSessionIdentity({
    searchParams: await searchParams,
  });

  return (
    <>
      <SessionRealtimeGate sessionId={sessionId ?? ""} routeSessionId={routeSessionId ?? undefined} />
      <Banken2Client sessionId={sessionId} routeSessionId={routeSessionId ?? undefined} />
    </>
  );
}
