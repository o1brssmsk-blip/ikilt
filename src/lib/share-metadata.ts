import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const SITE_URL = "https://maxima.onnemang.store";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.jpg`;

async function getOgImageUrl(): Promise<string> {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return DEFAULT_OG_IMAGE;
    const { data } = await supabase
      .from("global_settings")
      .select("og_image_url")
      .limit(1)
      .single();
    const url = data?.og_image_url;
    return typeof url === "string" && url.trim() !== "" ? url.trim() : DEFAULT_OG_IMAGE;
  } catch {
    return DEFAULT_OG_IMAGE;
  }
}

export async function buildShareMetadata(opts: {
  title: string;
  description: string;
  canonical: string;
}): Promise<Metadata> {
  const imageUrl = await getOgImageUrl();
  const imageType = /\.png($|\?)/i.test(imageUrl)
    ? "image/png"
    : /\.webp($|\?)/i.test(imageUrl)
      ? "image/webp"
      : "image/jpeg";

  return {
    title: opts.title,
    description: opts.description,
    icons: { icon: "/favicon.ico" },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: opts.canonical },
    openGraph: {
      type: "website",
      determiner: "auto",
      locale: "lt_LT",
      alternateLocale: ["en_US", "pl_PL", "ru_RU"],
      url: SITE_URL,
      siteName: "IKI Laimės Ratas",
      title: opts.title,
      description: opts.description,
      images: [
        {
          url: imageUrl,
          secureUrl: imageUrl,
          alt: "IKI Laimės Ratas",
          type: imageType,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: SITE_URL,
      title: opts.title,
      description: opts.description,
      images: [imageUrl],
    },
    appLinks: {
      web: {
        url: SITE_URL,
        should_fallback: true,
      },
    },
  };
}
