/**
 * Runs before the React bundle so the first paint uses the last known store theme.
 * Keep hexToHsl in sync with src/lib/theme.ts.
 */
(function () {
  var KEY = 'shopreturngifts-theme-snapshot';

  function hexToHsl(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '0 0% 0%';
    var r = parseInt(result[1], 16) / 255;
    var g = parseInt(result[2], 16) / 255;
    var b = parseInt(result[3], 16) / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }
    return Math.round(h * 360) + ' ' + Math.round(s * 100) + '% ' + Math.round(l * 100) + '%';
  }

  function applyThemeColors(primary, secondary, accent) {
    var root = document.documentElement;
    root.style.setProperty('--color-primary', hexToHsl(primary));
    root.style.setProperty('--color-secondary', hexToHsl(secondary));
    root.style.setProperty('--color-accent', hexToHsl(accent));
    var parts = hexToHsl(accent).match(/(\d+)\s+(\d+)%\s+(\d+)%/);
    if (parts) {
      var hoverL = Math.max(0, parseInt(parts[3], 10) - 7);
      root.style.setProperty('--color-accent-hover', parts[1] + ' ' + parts[2] + '% ' + hoverL + '%');
    }
  }

  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return;
    var t = JSON.parse(raw);
    if (t.primaryColor && t.secondaryColor && t.accentColor) {
      applyThemeColors(t.primaryColor, t.secondaryColor, t.accentColor);
    }
    if (t.storeName && String(t.storeName).trim()) {
      document.title = String(t.storeName).trim();
    }
  } catch (_e) {
    /* ignore */
  }
})();
