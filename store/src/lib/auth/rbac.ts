import type { UserRole } from '@/generated/prisma/enums'

/** Every guarded capability in the admin. */
export type Permission =
  | 'dashboard.view'
  | 'products.view'
  | 'products.edit'
  | 'products.publish'
  | 'media.view'
  | 'media.upload'
  | 'media.delete'
  | 'inventory.view'
  | 'inventory.edit'
  | 'orders.view'
  | 'orders.edit'
  | 'customers.view'
  | 'customers.edit'
  | 'suppliers.view'
  | 'suppliers.edit'
  | 'suppliers.import'
  | 'promotions.manage'
  | 'reviews.moderate'
  | 'content.manage'
  | 'regulatory.view'
  | 'regulatory.verify'
  | 'settings.manage'
  | 'users.manage'
  | 'audit.view'

const ALL: Permission[] = [
  'dashboard.view', 'products.view', 'products.edit', 'products.publish',
  'media.view', 'media.upload', 'media.delete', 'inventory.view', 'inventory.edit',
  'orders.view', 'orders.edit', 'customers.view', 'customers.edit',
  'suppliers.view', 'suppliers.edit', 'suppliers.import', 'promotions.manage',
  'reviews.moderate', 'content.manage', 'regulatory.view', 'regulatory.verify',
  'settings.manage', 'users.manage', 'audit.view',
]

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL.filter((p) => p !== 'users.manage' && p !== 'regulatory.verify'),
  WAREHOUSE: ['dashboard.view', 'products.view', 'media.view', 'inventory.view', 'inventory.edit', 'orders.view', 'orders.edit'],
  CUSTOMER_SERVICE: ['dashboard.view', 'products.view', 'media.view', 'orders.view', 'orders.edit', 'customers.view', 'customers.edit', 'reviews.moderate'],
  CONTENT_MANAGER: ['dashboard.view', 'products.view', 'products.edit', 'media.view', 'media.upload', 'media.delete', 'content.manage', 'reviews.moderate'],
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'מנהל על',
  ADMIN: 'מנהל',
  WAREHOUSE: 'מחסן',
  CUSTOMER_SERVICE: 'שירות לקוחות',
  CONTENT_MANAGER: 'מנהל תוכן',
}

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}
