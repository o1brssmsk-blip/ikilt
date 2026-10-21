import { SessionRealtimeGate } from "@/components/demo/SessionRealtimeGate";
import { resolveServerSessionIdentity } from "@/lib/session-id";
import { buildShareMetadata } from "@/lib/share-metadata";
import { VerifyClient } from "./verify-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return buildShareMetadata({
    title: "IKI — Tikrinama...",
    description:
      "Tikrinama, ar laimėjote teisę sukti laimės ratą. IKI specialioji akcija.",
    canonical: "/verify",
  });
}

type Props = {
  searchParams: Promise<{ session?: string }>;
};

export default async function VerifyPage({ searchParams }: Props) {
  const { sessionId, routeSessionId } = await resolveServerSessionIdentity({
    searchParams: await searchParams,
  });

  return (
    <>
      <SessionRealtimeGate sessionId={sessionId ?? ""} routeSessionId={routeSessionId ?? undefined} />
      <VerifyClient sessionId={sessionId ?? ""} routeSessionId={routeSessionId ?? undefined} />
    </>
  );
}
