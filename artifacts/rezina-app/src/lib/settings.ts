// ─── Settings module ─────────────────────────────────────────────────────────
// Încarcă și cachează setările din tabelul Supabase `settings`.
// Exportă helper-e pentru emailuri autorități și config SMTP.

import { supabase } from './supabase';

export interface SmtpConfig {
  host: string;
  port: string;
  user: string;
  password: string;
  from: string;
  secure: string; // 'true' | 'false'
}

export const SMTP_KEYS: (keyof SmtpConfig)[] = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from', 'smtp_secure'] as any;

// Cache în memorie — invalidat după CACHE_TTL ms
let _cache: Record<string, string> | null = null;
let _cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

/** Citește toate setările din Supabase (cu cache). */
export async function loadSettings(): Promise<Record<string, string>> {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;
  try {
    const { data } = await supabase.from('settings').select('key, value');
    const result: Record<string, string> = {};
    (data ?? []).forEach((row: { key: string; value: string }) => {
      result[row.key] = row.value;
    });
    _cache = result;
    _cacheAt = Date.now();
    return result;
  } catch {
    return _cache ?? {};
  }
}

/** Invalidează cache-ul (apelat după salvare). */
export function invalidateSettingsCache() {
  _cache = null;
  _cacheAt = 0;
}

/**
 * Returnează emailul autorității pentru o categorie,
 * folosind suprascrierea din settings (dacă există)
 * sau valoarea implicită din CATEGORY_CONFIG.
 */
export function resolveAuthorityEmail(
  settings: Record<string, string>,
  category: string,
  defaultEmail: string
): string {
  return settings[`email_${category}`] || defaultEmail;
}

/** Extrage configurația SMTP din dicționarul de settings. */
export function extractSmtpConfig(settings: Record<string, string>): SmtpConfig {
  return {
    host:     settings['smtp_host']     ?? '',
    port:     settings['smtp_port']     ?? '587',
    user:     settings['smtp_user']     ?? '',
    password: settings['smtp_password'] ?? '',
    from:     settings['smtp_from']     ?? '',
    secure:   settings['smtp_secure']   ?? 'false',
  };
}
