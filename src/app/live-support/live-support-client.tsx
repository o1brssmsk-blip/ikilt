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

const SUPPORT_AVATAR = "/avatars/support-sarah.jpg";
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
      <div className="a3d-shell">
        <div className="a3d-glow left-[-10%] top-[-12%] h-[440px] w-[440px] bg-[rgba(var(--brand-rgb),0.15)]" />
        <div className="a3d-glow bottom-[-14%] right-[-8%] h-[400px] w-[400px] bg-[rgba(var(--brand-rgb),0.11)]" />

        <main className="relative z-10 flex w-full flex-1 flex-col items-center justify-center p-4">
        {!isChatOpen ? (
          <div className="a3d-card a3d-in flex w-full max-w-[480px] flex-col items-center overflow-hidden px-6 py-8 text-center sm:px-8">
            <div className="mb-5 flex w-full items-center gap-4 rounded-[20px] bg-white/60 p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-[#1018280f]">
              <div className="relative shrink-0">
                <img
                  src={SUPPORT_AVATAR}
                  alt={SUPPORT_NAME}
                  className="size-14 rounded-full border-2 border-white object-cover shadow-[0_6px_16px_rgba(var(--brand-rgb),0.25)]"
                />
                <span className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full border-2 border-white bg-green-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--brand)]">Pagalbos tarnyba</p>
                <h3 className="a3d-title truncate text-lg">{SUPPORT_NAME}</h3>
                <p className="text-[13px] font-medium text-[#667085]">{SUPPORT_ROLE}</p>
              </div>
            </div>

            <h2 className="a3d-title mb-3 text-[22px]">{settings.live_support_title}</h2>
            <p className="a3d-sub mb-7 max-w-sm px-2 text-sm font-medium leading-relaxed whitespace-pre-line">
              <Linkify text={settings.live_support_subtitle} />
            </p>

            <button
              onClick={() => setIsChatOpen(true)}
              className="a3d-btn w-full max-w-[320px] px-6 py-4 text-[16px]"
            >
              <span>{settings.live_support_button}</span>
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-4-4 4 4-4 4" />
              </svg>
            </button>

            <div className="mt-6">
              <div className="a3d-pill">
                <svg className="h-4 w-4 text-[var(--brand)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.7 18.4 6v5.2c0 4-2.3 7.1-6.4 9.1-4.1-2-6.4-5.1-6.4-9.1V6L12 3.7Z" />
                </svg>
                <span>Saugus tiesioginis pokalbis</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="a3d-card a3d-in flex h-[76vh] max-h-[680px] w-full max-w-[640px] flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between border-b border-[#1018280a] bg-white/60 px-4 py-4 sm:px-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img
                    src={SUPPORT_AVATAR}
                    alt={SUPPORT_NAME}
                    className="size-12 rounded-full border-2 border-white object-cover shadow-[0_6px_16px_rgba(var(--brand-rgb),0.25)]"
                  />
                  <div className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-white bg-green-500"></div>
                </div>
                <div className="flex flex-col">
                  <h3 className="a3d-title text-[16px] leading-tight">{SUPPORT_NAME}</h3>
                  <span className="text-[13px] font-medium text-[#667085]">{SUPPORT_ROLE}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <img
                  src={settings.logo_url || "/form-assets/iki-mini-logo.png"}
                  alt={settings.portal_name || "Brand"}
                  className="h-10 w-10 shrink-0 object-contain"
                />
                <button onClick={() => setIsChatOpen(false)} title={TEXT_CLOSE} className="flex size-10 items-center justify-center rounded-full border border-[#10182814] bg-white/70 text-[#667085] shadow-sm transition-colors hover:bg-white hover:text-[#101828]">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="a3d-scroll flex-1 space-y-4 overflow-y-auto bg-transparent p-4 sm:p-5">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center opacity-60">
                  <svg className="mb-3 size-12 text-[var(--brand)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <p className="text-sm font-medium text-[#667085]">{TEXT_NO_MESSAGES}</p>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] sm:max-w-[80%] ${m.sender === "user" ? "a3d-bubble-user rounded-br-sm" : "a3d-bubble-admin rounded-bl-sm"}`}>
                      {m.image_url && (
                        <div
                          className="mb-3 cursor-pointer overflow-hidden rounded-xl transition-opacity hover:opacity-90"
                          onClick={() => setZoomedImage(m.image_url!)}
                        >
                          <img src={m.image_url} alt="Chat Attachment" className="max-h-52 w-full rounded-xl object-cover" />
                        </div>
                      )}
                      {m.content && <p className="leading-relaxed">{m.content}</p>}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="flex items-center gap-3 border-t border-[#1018280a] bg-white/60 p-4">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={TEXT_INPUT_PLACEHOLDER}
                className="a3d-input flex-1 px-5 py-3.5 text-[15px]"
              />
              <button type="submit" disabled={!newMessage.trim() || sending || !sessionId} className="a3d-btn flex size-12 shrink-0 items-center justify-center rounded-2xl">
                <svg className="ml-0.5 size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </div>
        )}
        </main>
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
