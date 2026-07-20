-- ============================================================================
-- Rezina Civic — Supabase Migration 002
-- Adaugă tabelul settings pentru configurare aplicație (emailuri, SMTP)
-- Run this SQL in Supabase Dashboard → SQL Editor
-- ============================================================================

create table if not exists settings (
  key        text        primary key,
  value      text        not null default '',
  updated_at timestamptz not null default now()
);

alter table settings enable row level security;

-- Oricine poate citi setările (emailuri autorități sunt publice)
create policy "public_read_settings"
  on settings for select using (true);

-- Oricine poate scrie (autentificarea e gestionată client-side prin parola admin)
create policy "public_write_settings"
  on settings for insert with check (true);

create policy "public_update_settings"
  on settings for update using (true) with check (true);

-- ─── Storage policies (dacă nu au fost adăugate cu 001_init.sql) ─────────────
-- Rulați manual în Supabase Dashboard → Storage → Policies dacă bucket-ul
-- report-images există deja fără policy-uri:

-- insert policy pentru upload:
-- create policy "public_upload_images"
--   on storage.objects for insert
--   with check (bucket_id = 'report-images');

-- select policy pentru citire:
-- create policy "public_read_images"
--   on storage.objects for select
--   using (bucket_id = 'report-images');
