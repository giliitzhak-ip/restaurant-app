import { describe, expect, it } from 'vitest';
import { activeNavHref, NAV_ITEMS } from '@/components/shell/nav-config';

describe('navigation', () => {
  it('exposes all nine product areas', () => {
    expect(NAV_ITEMS.map((item) => item.key)).toEqual([
      'dashboard',
      'newProject',
      'characters',
      'studio',
      'scenes',
      'timeline',
      'projects',
      'renders',
      'settings',
    ]);
  });

  it('picks the most specific match', () => {
    expect(activeNavHref('/')).toBe('/');
    expect(activeNavHref('/projects')).toBe('/projects');
    expect(activeNavHref('/projects/new')).toBe('/projects/new');
    expect(activeNavHref('/projects/abc123')).toBe('/projects');
    expect(activeNavHref('/settings')).toBe('/settings');
    expect(activeNavHref('/settingsx')).toBeUndefined();
  });
});
