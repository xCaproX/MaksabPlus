import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resolveSafeRedirectOrigin(rawOrigin: string | null): string | null {
  if (!rawOrigin) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    return null;
  }

  const isLocalDev =
    parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  if (parsed.protocol !== 'https:' && !isLocalDev) return null;

  const configured = [Deno.env.get('ALLOWED_ORIGINS'), Deno.env.get('SITE_URL')]
    .filter((v): v is string => Boolean(v && v.trim()))
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    const allowedOrigins = new Set(
      configured
        .map((item) => {
          try {
            return new URL(item).origin;
          } catch {
            return '';
          }
        })
        .filter(Boolean),
    );
    return allowedOrigins.has(parsed.origin) ? parsed.origin : null;
  }

  return parsed.origin;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return 'request_failed';
}

function normalizeAuthError(error: unknown): Error {
  const msg = extractErrorMessage(error);
  const lower = msg.toLowerCase();
  if (
    lower.includes('already been registered') ||
    lower.includes('already registered') ||
    lower.includes('already exists') ||
    lower.includes('duplicate')
  ) {
    return new Error('email_already_registered');
  }
  return new Error(msg);
}

async function provisionAuthUser(
  admin: ReturnType<typeof createClient>,
  params: {
    email: string;
    fullName: string;
    authMode: 'password' | 'invite';
    password?: string;
    safeOrigin: string | null;
  },
): Promise<string> {
  if (params.authMode === 'password') {
    const { data, error } = await admin.auth.admin.createUser({
      email: params.email,
      password: params.password ?? '',
      email_confirm: true,
      user_metadata: { full_name: params.fullName },
    });
    if (error || !data?.user) {
      throw normalizeAuthError(error ?? new Error('create_user_failed'));
    }
    return data.user.id;
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(params.email, {
    ...(params.safeOrigin ? { redirectTo: `${params.safeOrigin}/set-password` } : {}),
    data: { full_name: params.fullName },
  });
  if (error || !data?.user) {
    throw normalizeAuthError(error ?? new Error('invite_failed'));
  }
  return data.user.id;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'server_not_configured' }, 500);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'not_authenticated' }, 401);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json({ error: 'not_authenticated' }, 401);

  const { data: isPlatformAdmin, error: adminCheckError } = await caller.rpc('is_platform_admin');
  if (adminCheckError || !isPlatformAdmin) return json({ error: 'permission_denied' }, 403);

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const safeOrigin = resolveSafeRedirectOrigin(request.headers.get('origin'));

  try {
    if (body.action === 'create') {
      const companyName = typeof body.company_name === 'string' ? body.company_name.trim() : '';
      const adminNotes = typeof body.admin_notes === 'string' ? body.admin_notes.trim() : '';
      const ownerFullName = typeof body.owner_full_name === 'string' ? body.owner_full_name.trim() : '';
      const ownerEmail = typeof body.owner_email === 'string' ? body.owner_email.trim().toLowerCase() : '';
      const authMode = body.auth_mode === 'invite' || body.auth_mode === 'password' ? body.auth_mode : '';
      const ownerPassword = typeof body.owner_password === 'string' ? body.owner_password.trim() : '';

      if (!companyName) return json({ error: 'company_name_required' }, 400);
      if (!ownerFullName) return json({ error: 'owner_name_required' }, 400);
      if (!ownerEmail || !ownerEmail.includes('@')) return json({ error: 'invalid_email' }, 400);
      if (!authMode) return json({ error: 'invalid_auth_mode' }, 400);
      if (authMode === 'password' && ownerPassword.length < 8) {
        return json({ error: 'password_too_short' }, 400);
      }

      const userId = await provisionAuthUser(admin, {
        email: ownerEmail,
        fullName: ownerFullName,
        authMode,
        password: ownerPassword,
        safeOrigin,
      });

      const { data: companyId, error: provisionError } = await admin.rpc('platform_provision_company_records', {
        p_company_name: companyName,
        p_admin_notes: adminNotes,
        p_owner_user_id: userId,
        p_owner_full_name: ownerFullName,
      });

      if (provisionError || !companyId) {
        await admin.auth.admin.deleteUser(userId);
        throw provisionError ?? new Error('company_provision_failed');
      }

      return json({ ok: true, company_id: companyId, user_id: userId });
    }

    if (body.action === 'add_user') {
      const companyId = typeof body.company_id === 'string' ? body.company_id.trim() : '';
      const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const accessRole = body.access_role === undefined ? 'owner' : body.access_role;
      const authMode = body.auth_mode === 'invite' || body.auth_mode === 'password' ? body.auth_mode : '';
      const password = typeof body.password === 'string' ? body.password.trim() : '';

      if (!companyId) return json({ error: 'company_not_found' }, 400);
      if (!fullName) return json({ error: 'full_name_required' }, 400);
      if (!email || !email.includes('@')) return json({ error: 'invalid_email' }, 400);
      if (accessRole !== 'owner' && accessRole !== 'employee') {
        return json({ error: 'invalid_access_role' }, 400);
      }
      if (!authMode) return json({ error: 'invalid_auth_mode' }, 400);
      if (authMode === 'password' && password.length < 8) {
        return json({ error: 'password_too_short' }, 400);
      }

      const { data: companyRow, error: companyLookupError } = await admin
        .from('companies')
        .select('id')
        .eq('id', companyId)
        .maybeSingle();
      if (companyLookupError) throw companyLookupError;
      if (!companyRow) return json({ error: 'company_not_found' }, 404);

      const userId = await provisionAuthUser(admin, {
        email,
        fullName,
        authMode,
        password,
        safeOrigin,
      });

      const { error: addError } = await admin.rpc('platform_add_company_user_record', {
        p_company_id: companyId,
        p_user_id: userId,
        p_full_name: fullName,
        p_access_role: accessRole,
      });

      if (addError) {
        await admin.auth.admin.deleteUser(userId);
        throw addError;
      }

      return json({ ok: true, user_id: userId });
    }

    if (body.action === 'delete') {
      const companyId = typeof body.company_id === 'string' ? body.company_id.trim() : '';
      const confirmName = typeof body.confirm_name === 'string' ? body.confirm_name.trim() : '';

      if (!companyId) return json({ error: 'company_not_found' }, 400);
      if (!confirmName) return json({ error: 'confirm_name_mismatch' }, 400);

      const { data: companyRow, error: companyLookupError } = await admin
        .from('companies')
        .select('id, name')
        .eq('id', companyId)
        .maybeSingle();
      if (companyLookupError) throw companyLookupError;
      if (!companyRow) return json({ error: 'company_not_found' }, 404);

      if (confirmName !== String(companyRow.name ?? '').trim()) {
        return json({ error: 'confirm_name_mismatch' }, 400);
      }

      const { data: userIdsData, error: deleteError } = await admin.rpc('platform_delete_company_data', {
        p_company_id: companyId,
      });
      if (deleteError) throw deleteError;

      const userIds = Array.isArray(userIdsData)
        ? userIdsData.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];

      const failedUserIds: string[] = [];
      for (const uid of userIds) {
        const { error: authDelError } = await admin.auth.admin.deleteUser(uid);
        if (authDelError) failedUserIds.push(uid);
      }

      return json({
        ok: true,
        deleted_user_count: userIds.length - failedUserIds.length,
        failed_user_ids: failedUserIds,
      });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    return json({ error: extractErrorMessage(error) }, 400);
  }
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
