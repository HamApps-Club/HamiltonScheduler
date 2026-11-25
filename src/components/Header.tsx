import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PALETTES, type Mode } from '../lib/theme'
import { ChatIcon, LogoMark, LogoutIcon, MoonIcon, PaletteIcon, SunIcon } from './Icons'

const FEEDBACK_URL = 'mailto:hamappsdevs@gmail.com?subject=Hamilton%20Scheduler%20feedback'

interface Props {
  mode: Mode
  onToggleMode: () => void
  paletteIndex: number
  onPalette: (i: number) => void
}

export default function Header({ mode, onToggleMode, paletteIndex, onPalette }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  return (
    <header className="hdr">
      <div className="brand"><LogoMark /><span>Hamilton Scheduler</span></div>
      <nav className="hdr-actions">
        <button className="hdr-btn icon-only" onClick={onToggleMode} aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {mode === 'dark' ? <MoonIcon /> : <SunIcon />}
        </button>
        <div className="menu-wrap theme-wrap" ref={menuRef}>
          <button className="hdr-btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
            <PaletteIcon /> Theme
          </button>
          {menuOpen && (
            <div className="menu theme-menu" role="menu" aria-label="Themes">
              {PALETTES.map((p, i) => (
                <button key={p.name} role="menuitemradio" aria-checked={i === paletteIndex}
                  className={i === paletteIndex ? 'theme-card active' : 'theme-card'}
                  onClick={() => { onPalette(i); setMenuOpen(false) }}>
                  <span className="theme-stripes" aria-hidden="true">
                    {[...(p.swatch ?? []), ...p.colors].map((c, j) => <i key={j} style={{ background: c }} />)}
                  </span>
                  <span className="theme-name">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <a className="hdr-btn" href={FEEDBACK_URL}><ChatIcon /> Feedback</a>
        <button className="hdr-btn" onClick={() => supabase.auth.signOut()}><LogoutIcon /> Logout</button>
      </nav>
    </header>
  )
}
