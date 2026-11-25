// Course color palettes and light/dark mode.

export interface Palette { name: string; colors: string[] }

/** Each course gets the next color in the palette; the left edge uses a darker shade. */
export const PALETTES: Palette[] = [
  { name: 'Pastel', colors: ['#a6d99a', '#f3ef8f', '#ebb15f', '#e86c66', '#a3bccb', '#c7a8de', '#8fd1c8', '#f2a7c3'] },
  { name: 'Ocean', colors: ['#8ec5e8', '#9fd8cf', '#b7c7f0', '#7fb3d5', '#c4e3f3', '#a5b8e0', '#88d3c2', '#bcd9e6'] },
  { name: 'Sunset', colors: ['#f6b48f', '#f7d488', '#f28f8f', '#e9a6c9', '#d7a6e8', '#f5c6a5', '#f0a07a', '#e6b8b8'] },
  { name: 'Forest', colors: ['#a8d5a2', '#cfe3a1', '#9cc9b4', '#d9d59b', '#b4c99a', '#8fbf9f', '#c7dcb0', '#a9c6a0'] },
]

/** Darken a hex color by `amount` (0–1) for block edges. */
export function darken(hex: string, amount = 0.35): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.round(c * (1 - amount)).toString(16).padStart(2, '0')
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`
}

// Per-browser preferences. Storage can be unavailable (private mode), so failures are ignored.
export function loadPref(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
export function savePref(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

export type Mode = 'light' | 'dark'

export function initialMode(): Mode {
  const saved = loadPref('hs-mode')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyMode(mode: Mode): void {
  document.documentElement.dataset.theme = mode
  savePref('hs-mode', mode)
}
