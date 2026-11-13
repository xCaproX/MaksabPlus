import { supabase } from './supabase';
import { errorMessage } from './errors';

export type AuthProvisionMode = 'password' | 'invite';
export type CompanyUserRole = 'owner' | 'employee';

export interface PlatformAdminIdentity {
  user_id: string;
  email: string;
  full_name: string;
}

export interface PlatformCompany {
  id: string;
  name: string;
  currency: string;
  is_active: boolean;
  suspension_reason: string;
  created_at: string;
  updated_at: string;
  users_count: number;
  active_users_count: number;
  invoices_count: number;
  last_activity_at: string | null;
  admin_notes: string;
}

export interface PlatformCompanyUser {
  user_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  access_role: CompanyUserRole;
  created_at: string;
  email_confirmed_at: string | null;
}

export interface DeleteCompanyResult {
  ok: boolean;
  deleted_user_count: number;
  failed_user_ids: string[];
}

export interface ActivationLinkResult {
  ok: boolean;
  delivery: 'email' | 'link';
  action_link?: string;
}

export interface DeleteCompanyUserResult {
  ok: boolean;
  auth_delete_failed: boolean;
}

async function invokeManageCompanies<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error: invokeError } = await supabase.functions.invoke('manage-companies', {
    body,
  });

  if (invokeError) {
    let rawError: unknown = invokeError;
    const context = (invokeError as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    if (context && typeof context.json === 'function') {
      try {
        const parsed = await context.json();
        if (parsed?.error) rawError = parsed.error;
      } catch {
        // Keep original invokeError when response body is not JSON
      }
    }
    throw new Error(errorMessage(rawError));
  }

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(errorMessage(data.error));
  }

  return data as T;
}

export async function fetchPlatformAdminIdentity(): Promise<PlatformAdminIdentity | null> {
  const { data, error } = await supabase.rpc('get_platform_admin_identity');
  if (error) throw new Error(errorMessage(error));
  const row = Array.isArray(data) ? data[0] : data;
  return (row as PlatformAdminIdentity | undefined) ?? null;
}

export async function listPlatformCompanies(): Promise<PlatformCompany[]> {
  const { data, error } = await supabase.rpc('platform_list_companies');
  if (error) throw new Error(errorMessage(error));
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    currency: String(row.currency ?? 'EGP'),
    is_active: Boolean(row.is_active),
    suspension_reason: String(row.suspension_reason ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    users_count: Number(row.users_count ?? 0),
    active_users_count: Number(row.active_users_count ?? 0),
    invoices_count: Number(row.invoices_count ?? 0),
    last_activity_at: row.last_activity_at ? String(row.last_activity_at) : null,
    admin_notes: String(row.admin_notes ?? ''),
  }));
}

export async function listPlatformCompanyUsers(companyId: string): Promise<PlatformCompanyUser[]> {
  const { data, error } = await supabase.rpc('platform_list_company_users', {
    p_company_id: companyId,
  });
  if (error) throw new Error(errorMessage(error));
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    user_id: String(row.user_id),
    email: String(row.email ?? ''),
    full_name: String(row.full_name ?? ''),
    is_active: Boolean(row.is_active),
    access_role: row.access_role === 'employee' ? 'employee' : 'owner',
    created_at: String(row.created_at),
    email_confirmed_at: row.email_confirmed_at ? String(row.email_confirmed_at) : null,
  }));
}

export async function createPlatformCompany(params: {
  companyName: string;
  adminNotes: string;
  ownerFullName: string;
  ownerEmail: string;
  authMode: AuthProvisionMode;
  ownerPassword?: string;
}): Promise<{ company_id: string; user_id: string }> {
  return invokeManageCompanies<{ company_id: string; user_id: string }>({
    action: 'create',
    company_name: params.companyName,
    admin_notes: params.adminNotes,
    owner_full_name: params.ownerFullName,
    owner_email: params.ownerEmail,
    auth_mode: params.authMode,
    ...(params.authMode === 'password' ? { owner_password: params.ownerPassword ?? '' } : {}),
  });
}

export async function updatePlatformCompany(params: {
  companyId: string;
  name: string;
  adminNotes: string;
  isActive: boolean;
  suspensionReason?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('platform_update_company', {
    p_company_id: params.companyId,
    p_name: params.name,
    p_admin_notes: params.adminNotes,
    p_is_active: params.isActive,
    p_suspension_reason: params.isActive ? '' : (params.suspensionReason ?? ''),
  });
  if (error) throw new Error(errorMessage(error));
}

export async function addPlatformCompanyUser(params: {
  companyId: string;
  fullName: string;
  email: string;
  accessRole: CompanyUserRole;
  authMode: AuthProvisionMode;
  password?: string;
}): Promise<void> {
  await invokeManageCompanies({
    action: 'add_user',
    company_id: params.companyId,
    full_name: params.fullName,
    email: params.email,
    access_role: params.accessRole,
    auth_mode: params.authMode,
    ...(params.authMode === 'password' ? { password: params.password ?? '' } : {}),
  });
}

export async function updatePlatformCompanyUser(params: {
  companyId: string;
  userId: string;
  fullName: string;
  email: string;
  accessRole: CompanyUserRole;
}): Promise<void> {
  await invokeManageCompanies({
    action: 'update_user',
    company_id: params.companyId,
    user_id: params.userId,
    full_name: params.fullName,
    email: params.email,
    access_role: params.accessRole,
  });
}

export async function requestPlatformUserActivation(params: {
  companyId: string;
  userId: string;
  delivery: 'email' | 'link';
}): Promise<ActivationLinkResult> {
  return invokeManageCompanies<ActivationLinkResult>({
    action: 'activation_link',
    company_id: params.companyId,
    user_id: params.userId,
    delivery: params.delivery,
  });
}

export async function deletePlatformCompanyUser(params: {
  companyId: string;
  userId: string;
  confirmIdentifier: string;
}): Promise<DeleteCompanyUserResult> {
  return invokeManageCompanies<DeleteCompanyUserResult>({
    action: 'delete_user',
    company_id: params.companyId,
    user_id: params.userId,
    confirm_identifier: params.confirmIdentifier,
  });
}

export async function setPlatformCompanyUserActive(params: {
  companyId: string;
  userId: string;
  isActive: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('platform_set_company_user_active', {
    p_company_id: params.companyId,
    p_user_id: params.userId,
    p_is_active: params.isActive,
  });
  if (error) throw new Error(errorMessage(error));
}

export async function setPlatformCompanyUserPassword(params: {
  companyId: string;
  userId: string;
  password: string;
}): Promise<void> {
  const { error } = await supabase.rpc('platform_set_company_user_password', {
    p_company_id: params.companyId,
    p_user_id: params.userId,
    p_password: params.password,
  });
  if (error) throw new Error(errorMessage(error));
}

export async function deletePlatformCompany(params: {
  companyId: string;
  confirmName: string;
}): Promise<DeleteCompanyResult> {
  return invokeManageCompanies<DeleteCompanyResult>({
    action: 'delete',
    company_id: params.companyId,
    confirm_name: params.confirmName,
  });
}
