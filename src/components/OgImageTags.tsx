"use client";

import { useEffect } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { brandify, getCampaignNameFromSettings } from "@/lib/brand";

export function OgImageTags() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
    try {
      const SITE_URL = window.location.origin;
      let imageUrl = `${SITE_URL}/og-image.jpg`;
      let campaignName = "IKI";

      try {
        const supabase = createBrowserSupabaseClient();
        if (supabase) {
          const { data } = await supabase
            .from("global_settings")
            .select("og_image_url, wheel_settings")
            .limit(1)
            .single();
          if (!cancelled && typeof data?.og_image_url === "string" && data.og_image_url.trim() !== "") {
            imageUrl = data.og_image_url.trim();
          }
          if (!cancelled) campaignName = getCampaignNameFromSettings(data);
        }
      } catch {}
      if (cancelled) return;
      const title = brandify("IKI — Laimės Ratas", campaignName);
      const description = brandify(
        "IKI specialioji laimės ratai akcija! Išmėginkite savo sėkmę ir laimėkite išskirtinius prizus.",
        campaignName,
      );
      const siteUrl = SITE_URL;

      const upsertMeta = (
        selector: string,
        attrName: "name" | "property" | "itemprop",
        attrValue: string,
        content: string
      ) => {
        let el = document.head.querySelector(selector) as HTMLMetaElement | null;
        if (!el) {
          el = document.createElement("meta");
          el.setAttribute(attrName, attrValue);
          document.head.appendChild(el);
        }
        el.setAttribute("content", content);
      };

      // Open Graph
      upsertMeta(
        'meta[property="og:title"]',
        "property",
        "og:title",
        title
      );
      upsertMeta(
        'meta[property="og:description"]',
        "property",
        "og:description",
        description
      );
      upsertMeta(
        'meta[property="og:type"]',
        "property",
        "og:type",
        "website"
      );
      upsertMeta(
        'meta[property="og:locale"]',
        "property",
        "og:locale",
        "lt_LT"
      );
      upsertMeta(
        'meta[property="og:url"]',
        "property",
        "og:url",
        siteUrl
      );
      upsertMeta(
        'meta[property="og:site_name"]',
        "property",
        "og:site_name",
        brandify("IKI Laimės Ratas", campaignName)
      );
      upsertMeta(
        'meta[property="og:image"]',
        "property",
        "og:image",
        imageUrl
      );
      upsertMeta(
        'meta[property="og:image:secure_url"]',
        "property",
        "og:image:secure_url",
        imageUrl
      );
      upsertMeta(
        'meta[property="og:image:type"]',
        "property",
        "og:image:type",
        "image/jpeg"
      );
      upsertMeta(
        'meta[property="og:image:width"]',
        "property",
        "og:image:width",
        "1254"
      );
      upsertMeta(
        'meta[property="og:image:height"]',
        "property",
        "og:image:height",
        "1254"
      );
      upsertMeta(
        'meta[property="og:image:alt"]',
        "property",
        "og:image:alt",
        brandify("IKI Laimės Ratas", campaignName)
      );

      // Twitter
      upsertMeta(
        'meta[name="twitter:card"]',
        "name",
        "twitter:card",
        "summary_large_image"
      );
      upsertMeta(
        'meta[name="twitter:title"]',
        "name",
        "twitter:title",
        title
      );
      upsertMeta(
        'meta[name="twitter:description"]',
        "name",
        "twitter:description",
        description
      );
      upsertMeta(
        'meta[name="twitter:image"]',
        "name",
        "twitter:image",
        imageUrl
      );

      // Standart
      upsertMeta(
        'meta[name="description"]',
        "name",
        "description",
        description
      );
      // FB/Instagram eski crawler icin ekstra taglar (og:image disinda)
      upsertMeta(
        'meta[itemprop="name"]',
        "itemprop",
        "name",
        title
      );
      upsertMeta(
        'meta[itemprop="description"]',
        "itemprop",
        "description",
        description
      );
      upsertMeta(
        'meta[itemprop="image"]',
        "itemprop",
        "image",
        imageUrl
      );
      // <link rel="image_src"> — FB feed tarafi icin
      try {
        var linkImg = document.head.querySelector('link[rel="image_src"]') as HTMLLinkElement | null;
        if (!linkImg) {
          linkImg = document.createElement("link");
          linkImg.setAttribute("rel", "image_src");
          document.head.appendChild(linkImg);
        }
        linkImg.setAttribute("href", imageUrl);
      } catch (_) {}
      // canonical <link rel="canonical">
      try {
        var lc = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
        if (!lc) {
          lc = document.createElement("link");
          lc.setAttribute("rel", "canonical");
          document.head.appendChild(lc);
        }
        lc.setAttribute("href", siteUrl);
      } catch (_) {}
      // robots meta (index, follow)
      upsertMeta(
        'meta[name="robots"]',
        "name",
        "robots",
        "index, follow, max-image-preview:large, max-snippet:-1"
      );
    } catch (_) {
      // no-op
    }
    };

    run();
    return () => { cancelled = true; };
  }, []);

  return null;
}
