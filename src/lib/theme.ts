/**
 * Convert a hex color (#RRGGBB) to HSL string "H S% L%" for CSS custom properties.
 */
export function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0% 0%';

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Apply theme colors to the document root as CSS custom properties.
 */
export function applyThemeColors(primary: string, secondary: string, accent: string) {
  const root = document.documentElement;
  const next = {
    primary: hexToHsl(primary),
    secondary: hexToHsl(secondary),
    accent: hexToHsl(accent),
  };
  if (
    root.style.getPropertyValue('--color-primary') === next.primary &&
    root.style.getPropertyValue('--color-secondary') === next.secondary &&
    root.style.getPropertyValue('--color-accent') === next.accent
  ) {
    return;
  }
  root.style.setProperty('--color-primary', next.primary);
  root.style.setProperty('--color-secondary', next.secondary);
  root.style.setProperty('--color-accent', next.accent);

  // Derive accent-hover (slightly darker)
  const accentHsl = hexToHsl(accent);
  const parts = accentHsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (parts) {
    const hoverL = Math.max(0, parseInt(parts[3]) - 7);
    root.style.setProperty('--color-accent-hover', `${parts[1]} ${parts[2]}% ${hoverL}%`);
  }
}

/**
 * Remove runtime theme overrides, reverting to CSS defaults.
 */
export function clearThemeColors() {
  const root = document.documentElement;
  root.style.removeProperty('--color-primary');
  root.style.removeProperty('--color-secondary');
  root.style.removeProperty('--color-accent');
  root.style.removeProperty('--color-accent-hover');
}

export const DEFAULT_THEME = {
  primaryColor: '#0F172A' as string,
  secondaryColor: '#64748B' as string,
  accentColor: '#D4A017' as string,
};
