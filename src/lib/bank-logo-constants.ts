export const VAN_LANSCHOT_KEMPEN_LOGO_URL = "/bank-logos/van-lanschot-kempen.svg";

export const LOCAL_BANK_LOGO_BY_SLUG: Record<string, string> = {
  "bigbank": "/bank-logos/estonia/bigbank.webp",
  "citadele-banka": "/bank-logos/estonia/citadele-banka.webp",
  "coop-pank": "/bank-logos/estonia/coop-pank.webp",
  "inbank": "/bank-logos/estonia/inbank.webp",
  "lhv-pank": "/bank-logos/estonia/lhv-pank.webp",
  "luminor-ee": "/bank-logos/estonia/luminor-ee.webp",
  "op-corporate-bank": "/bank-logos/estonia/op-corporate-bank.webp",
  "seb-pank": "/bank-logos/estonia/seb-pank.webp",
  "swedbank-ee": "/bank-logos/estonia/swedbank-ee.webp",
  "van-lanschot-kempen": VAN_LANSCHOT_KEMPEN_LOGO_URL,

  // Litvanya (Lithuania) bankalari - logo dosyalari public/bank-logos/lithuania/
  // altina {slug}.webp veya {slug}.webp olarak kaydedildiginde otomatik okunur.
  "swedbank-lt": "/bank-logos/lithuania/swedbank-lt.webp",
  "seb-lt": "/bank-logos/lithuania/seb-lt.webp",
  "luminor-lt": "/bank-logos/lithuania/luminor-lt.webp",
  "citadele-lt": "/bank-logos/lithuania/citadele-lt.webp",
  "lku-lt": "/bank-logos/lithuania/lku-lt.webp",
  "kredito-unijos-lt": "/bank-logos/lithuania/kredito-unijos-lt.webp",
  "siauliu-bankas-lt": "/bank-logos/lithuania/siauliu-lt.webp",
  "siauliu-bankas": "/bank-logos/lithuania/siauliu-lt.webp",
  "siauliu-lt": "/bank-logos/lithuania/siauliu-lt.webp",
  "artea-lt": "/bank-logos/lithuania/siauliu-lt.webp",
  "citadele": "/bank-logos/lithuania/citadele-lt.webp",
  "luminor": "/bank-logos/lithuania/luminor-lt.webp",
  "seb": "/bank-logos/lithuania/seb-lt.webp",
  "swedbank": "/bank-logos/lithuania/swedbank-lt.webp",
};

export function resolveLocalBankLogoFile(slug?: string | null, logoFile?: string | null) {
  const normalizedLogoFile = typeof logoFile === "string" ? logoFile.trim() : "";

  // 1. ONCELIK: Tam HTTP/HTTPS URL donerse (supabase storage, CDN vs) DOGRUDAN kullan
  if (/^https?:\/\//i.test(normalizedLogoFile)) {
    return normalizedLogoFile;
  }

  // 2. Lokal static asset path ("/bank-logos/...") ise dogrudan kullan
  // Eski .png/.jpg uzantilari webp karsiliklarina yonlendirilir
  if (normalizedLogoFile.startsWith("/")) {
    return normalizedLogoFile.replace(/\.(png|jpe?g|gif)$/i, ".webp");
  }

  // 3. Slug bazli lokal eslesme (Estonya + Litvanya)
  if (slug) {
    const localLogo = LOCAL_BANK_LOGO_BY_SLUG[slug];
    if (localLogo) {
      return localLogo;
    }
  }

  // 4. Son fallback (logoFile tanimli ise onu geri don, aksi halde bos string)
  return normalizedLogoFile;
}
