import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const isValidPermissionKey = (key: unknown): boolean =>
  typeof key === 'string' && /^[a-z_]+(\.[a-z_]+)+$/.test(key);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization) return json({ error: 'server_not_configured' }, 500);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json({ error: 'not_authenticated' }, 401);
  const { data: isOwner, error: ownerError } = await caller.rpc('is_company_owner');
  if (ownerError || !isOwner) return json({ error: 'permission_denied' }, 403);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const body = await request.json();
    if (body.action === 'list') {
      const { data, error } = await caller.rpc('list_company_users');
      if (error) throw error;
      return json({ users: data ?? [] });
    }

    if (body.action === 'invite') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
      const keys = Array.isArray(body.permission_keys) ? body.permission_keys : [];
      if (!email || !fullName || keys.some((key: unknown) => !isValidPermissionKey(key))) {
        return json({ error: 'invalid_invitation' }, 400);
      }
      const { data: companyId, error: companyError } = await caller.rpc('current_company_id');
      if (companyError || !companyId) throw companyError ?? new Error('company_not_found');
      const origin = request.headers.get('origin');
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        ...(origin ? { redirectTo: `${origin}/set-password` } : {}),
        data: { full_name: fullName },
      });
      if (inviteError || !invited.user) throw inviteError ?? new Error('invite_failed');
      const { error: profileError } = await admin.from('profiles').insert({
        id: invited.user.id,
        company_id: companyId,
        full_name: fullName,
        access_role: 'employee',
        is_active: true,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(invited.user.id);
        throw profileError;
      }
      if (keys.length) {
        const { error: permissionsError } = await admin.from('user_permissions').insert(
          [...new Set(keys)].map((permission_key: string) => ({ company_id: companyId, user_id: invited.user!.id, permission_key })),
        );
        if (permissionsError) {
          await admin.from('profiles').delete().eq('id', invited.user.id);
          await admin.auth.admin.deleteUser(invited.user.id);
          throw permissionsError;
        }
      }
      return json({ ok: true });
    }

    if (body.action === 'permissions') {
      const userId = typeof body.user_id === 'string' ? body.user_id : '';
      const keys = Array.isArray(body.permission_keys) ? body.permission_keys : [];
      if (!userId || keys.some((key: unknown) => !isValidPermissionKey(key))) {
        return json({ error: 'invalid_permissions' }, 400);
      }
      const { error } = await caller.rpc('set_user_permissions', { p_user_id: userId, p_permission_keys: [...new Set(keys)] });
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === 'active') {
      if (typeof body.user_id !== 'string' || typeof body.is_active !== 'boolean') return json({ error: 'invalid_user' }, 400);
      const { error } = await caller.rpc('set_company_user_active', { p_user_id: body.user_id, p_is_active: body.is_active });
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'request_failed' }, 400);
  }
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
