import { Page } from '@playwright/test';

type Role = 'customer' | 'admin';

interface SessionOptions {
  role?: Role;
  userId?: string;
  name?: string;
  email?: string;
}

export async function seedSession(page: Page, options: SessionOptions = {}) {
  const role = options.role || 'customer';
  const authState = {
    state: {
      user: {
        userId: options.userId || `${role}-user-1`,
        email: options.email || `${role}@shopreturngifts.test`,
        name: options.name || (role === 'admin' ? 'Admin User' : 'Customer User'),
        phone: '+14805550100',
        role,
        userType: 'B2C',
        isActive: true,
        address: {
          line1: '123 Main St',
          line2: '',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
          country: 'US',
        },
        createdAt: '2026-03-26T12:00:00Z',
        updatedAt: '2026-03-26T12:00:00Z',
      },
      token: 'mock-token',
      isAuthenticated: true,
      isAdmin: role === 'admin',
    },
    version: 0,
  };

  await page.addInitScript((persisted) => {
    window.localStorage.setItem('shopreturngifts-auth', JSON.stringify(persisted));
  }, authState);
}
