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
      <div className="flex min-h-[100dvh] items-start justify-center p-3 pt-[16vh] sm:p-6 sm:pt-[26vh]">
        {!isChatOpen ? (
          <div className="w-full max-w-[650px] rounded-[24px] bg-[var(--brand-panel)] border border-[var(--brand)] shadow-[0_0_40px_rgba(var(--brand-rgb),0.3)] p-6 sm:p-10 relative z-10 fade-in text-center flex flex-col items-center">
            <div className="mb-6 size-20 sm:size-24 rounded-full bg-white/5 ring-4 ring-white/5 flex items-center justify-center">
              <svg className="size-10 sm:size-12 text-[var(--brand)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">{settings.live_support_title}</h2>
            <p className="text-sm sm:text-base text-gray-300 mb-8 sm:mb-10 max-w-sm leading-relaxed px-2 whitespace-pre-line font-medium">
              <Linkify text={settings.live_support_subtitle} />
            </p>
            
            <button 
              onClick={() => setIsChatOpen(true)}
              className="animate-pulse w-full max-w-xs flex flex-col items-center text-white font-bold text-lg cursor-pointer bg-gradient-to-r from-[var(--brand)] to-[var(--brand-dark)] px-8 py-4 rounded-xl shadow-[0_0_15px_rgba(var(--brand-rgb),0.4)] transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <span>{settings.live_support_button}</span>
              <svg className="size-6 sm:size-8 mt-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex w-full max-w-[650px] h-[75vh] max-h-[650px] flex-col overflow-hidden rounded-[24px] bg-[var(--brand-panel)] border border-[var(--brand)] shadow-[0_0_40px_rgba(var(--brand-rgb),0.3)] animate-in zoom-in-95 duration-300 relative z-10">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--brand)]/30 bg-white/5">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img 
                    src={SUPPORT_AVATAR}
                    alt="Support" 
                    className="size-12 rounded-full object-cover border-2 border-[var(--brand)] shadow-sm"
                  />
                  <div className="absolute bottom-0 right-0 size-3.5 rounded-full bg-green-500 border-2 border-[var(--brand-panel)]"></div>
                </div>
                <div className="flex flex-col">
                  <h3 className="font-bold text-white text-[16px] leading-tight">{SUPPORT_NAME}</h3>
                  <span className="text-[13px] text-gray-400">{SUPPORT_ROLE}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setIsChatOpen(false)} title={TEXT_CLOSE} className="flex size-10 items-center justify-center rounded-full bg-white/10 text-gray-300 hover:text-white hover:bg-white/20 transition-colors shadow-sm border border-white/5">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-transparent custom-scrollbar">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
                  <svg className="size-12 text-[var(--brand)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <p className="text-sm text-gray-300">{TEXT_NO_MESSAGES}</p>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-5 py-3.5 text-[15px] shadow-sm ${m.sender === "user" ? "bg-gradient-to-r from-[var(--brand)] to-[var(--brand-dark)] text-white rounded-br-sm shadow-[0_0_15px_rgba(var(--brand-rgb),0.3)]" : "bg-white/10 text-white rounded-bl-sm border border-white/10 backdrop-blur-md"}`}>
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
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="flex items-center gap-3 p-4 bg-white/5 backdrop-blur-md border-t border-[var(--brand)]/30">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={TEXT_INPUT_PLACEHOLDER}
                className="flex-1 bg-white/10 rounded-xl px-5 py-4 text-[15px] text-white outline-none placeholder:text-gray-400 border border-transparent focus:border-[var(--brand)]/50 focus:bg-white/15 transition-all shadow-sm"
              />
              <button type="submit" disabled={!newMessage.trim() || sending || !sessionId} className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-dark)] text-white transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:grayscale shadow-[0_0_15px_rgba(var(--brand-rgb),0.4)]">
                <svg className="size-6 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
