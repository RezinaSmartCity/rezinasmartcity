// ============================================================================
// Rezina Civic — Supabase Edge Function: send-email
// Trimite email prin SMTP folosind configurația din tabelul settings
//
// Deploy:
//   supabase functions deploy send-email --no-verify-jwt
//
// Sau din Supabase Dashboard → Edge Functions → New Function
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SmtpClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Citim configurația SMTP din tabelul settings
    const { data: rows, error: dbErr } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from', 'smtp_secure']);

    if (dbErr) throw new Error(`DB error: ${dbErr.message}`);

    const cfg: Record<string, string> = {};
    rows?.forEach((r: { key: string; value: string }) => { cfg[r.key] = r.value; });

    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_password) {
      return new Response(
        JSON.stringify({ error: 'SMTP neconfigurat. Adăugați setările SMTP în panoul Admin.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { to, subject, body } = await req.json();

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ error: 'Câmpurile to, subject, body sunt obligatorii.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const port = parseInt(cfg.smtp_port || '587', 10);
    const secure = cfg.smtp_secure === 'true' || port === 465;

    const client = new SmtpClient();
    await client.connectTLS({
      hostname: cfg.smtp_host,
      port,
      username: cfg.smtp_user,
      password: cfg.smtp_password,
    });

    await client.send({
      from: cfg.smtp_from || cfg.smtp_user,
      to,
      subject,
      content: body,
    });

    await client.close();

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('send-email error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Eroare necunoscută' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
