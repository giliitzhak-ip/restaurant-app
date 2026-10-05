/**
 * תקשורת מול שכבת הזהות בשרת.
 * האסימון נשמר במכשיר ונשלח בכותרת Authorization.
 */

import { apiUrl } from './config';

const TOKEN_KEY = 'auth-token';

export type AccessLevel = 'full' | 'read_only' | 'blocked';
export type UserRole = 'owner' | 'exterminator' | 'field';
export type OrgStatus = 'pending' | 'approved' | 'suspended' | 'rejected';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isSuperAdmin: boolean;
  licenseNumber: string;
  orgId: string | null;
}

export interface Organization {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  status: OrgStatus;
  plan: string;
  paidUntil: string | null;
  createdAt: string;
}

export interface AdminOrganization extends Organization {
  notes: string;
  decidedAt: string | null;
  access: AccessLevel;
  counts: { users: number; journals: number; customers: number };
}

export interface Access {
  level: AccessLevel;
  reason: string;
}

export interface SessionInfo {
  user: AuthUser;
  organization: Organization | null;
  access: Access;
}

export class ApiError extends Error {
  errors: string[];
  status: number;
  constructor(status: number, errors: string[]) {
    super(errors[0] ?? 'אירעה שגיאה.');
    this.status = status;
    this.errors = errors.length ? errors : ['אירעה שגיאה. יש לנסות שוב.'];
  }
}

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* אחסון חסום – ההתחברות תקפה לסשן הנוכחי בלבד */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readToken();
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, ['אין חיבור לשרת. יש לבדוק את החיבור לאינטרנט.']);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;  // תשובה ללא גוף JSON – נטפל לפי קוד הסטטוס
  }

  const data = (body ?? {}) as { ok?: boolean; errors?: string[] };
  if (!res.ok || data.ok === false) {
    throw new ApiError(res.status, data.errors ?? []);
  }
  return data as T;
}

export interface RegisterInput {
  businessName: string;
  contactName: string;
  email: string;
  phone?: string;
  licenseNumber?: string;
  password: string;
}

export const authApi = {
  register: (input: RegisterInput) =>
    request<{ ok: true; status: string; message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (email: string, password: string) =>
    request<{ ok: true; token: string } & SessionInfo>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ ok: true } & SessionInfo>('/api/auth/me'),

  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  listEmployees: () => request<{ ok: true; users: AuthUser[] }>('/api/auth/users'),

  createEmployee: (input: { name: string; email: string; role: UserRole; password: string; licenseNumber?: string }) =>
    request<{ ok: true; user: AuthUser }>('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateEmployee: (id: string, patch: { status?: 'active' | 'disabled'; role?: UserRole }) =>
    request<{ ok: true; user: AuthUser }>(`/api/auth/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  listOrganizations: () =>
    request<{ ok: true; organizations: AdminOrganization[] }>('/api/admin/organizations'),

  decideOrganization: (
    id: string,
    patch: { status?: OrgStatus; plan?: string; paidUntil?: string | null; notes?: string },
  ) =>
    request<{ ok: true; organization: AdminOrganization }>(
      `/api/admin/organizations/${encodeURIComponent(id)}`,
      { method: 'POST', body: JSON.stringify(patch) },
    ),
};
