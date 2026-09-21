import { describe, expect, it } from 'vitest'
import { can, ROLE_PERMISSIONS } from '@/lib/auth/rbac'

describe('RBAC', () => {
  it('gives the super admin everything', () => {
    expect(can('SUPER_ADMIN', 'users.manage')).toBe(true)
    expect(can('SUPER_ADMIN', 'regulatory.verify')).toBe(true)
  })

  it('withholds regulatory verification and user management from a plain admin', () => {
    expect(can('ADMIN', 'regulatory.verify')).toBe(false)
    expect(can('ADMIN', 'users.manage')).toBe(false)
    expect(can('ADMIN', 'products.publish')).toBe(true)
  })

  it('keeps warehouse staff out of pricing and publishing', () => {
    expect(can('WAREHOUSE', 'products.edit')).toBe(false)
    expect(can('WAREHOUSE', 'products.publish')).toBe(false)
    expect(can('WAREHOUSE', 'inventory.edit')).toBe(true)
  })

  it('keeps customer service out of the catalogue and suppliers', () => {
    expect(can('CUSTOMER_SERVICE', 'products.edit')).toBe(false)
    expect(can('CUSTOMER_SERVICE', 'suppliers.view')).toBe(false)
    expect(can('CUSTOMER_SERVICE', 'orders.edit')).toBe(true)
  })

  it('keeps the content manager away from orders and settings', () => {
    expect(can('CONTENT_MANAGER', 'orders.view')).toBe(false)
    expect(can('CONTENT_MANAGER', 'settings.manage')).toBe(false)
    expect(can('CONTENT_MANAGER', 'content.manage')).toBe(true)
  })

  it('defines permissions for every role', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      expect(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS].length).toBeGreaterThan(0)
    }
  })
})
