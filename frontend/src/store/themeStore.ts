import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'retro'

const THEMES: Theme[] = ['light', 'dark', 'retro']

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark' as Theme,
      setTheme: (theme: Theme) => {
        set({ theme })
        applyTheme(theme)
      },
      toggleTheme: () => {
        set((state) => {
          const currentIndex = THEMES.indexOf(state.theme)
          const nextIndex = (currentIndex + 1) % THEMES.length
          const newTheme = THEMES[nextIndex]
          applyTheme(newTheme)
          return { theme: newTheme }
        })
      },
    }),
    {
      name: 'meshtastic-theme',
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            applyTheme(state.theme)
          }
        }
      },
    }
  )
)

function applyTheme(theme: Theme) {
  const root = document.documentElement

  // Remove all theme classes first
  root.classList.remove('dark', 'retro')

  // CRT Power-on effect for retro theme
  if (theme === 'retro') {
    // Create CRT boot overlay
    let crtOverlay = document.getElementById('crt-boot-overlay')
    if (!crtOverlay) {
      crtOverlay = document.createElement('div')
      crtOverlay.id = 'crt-boot-overlay'
      document.body.appendChild(crtOverlay)
    }

    crtOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: #000;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    `

    // Add boot text with glitch effects
    crtOverlay.innerHTML = `
      <div class="crt-noise"></div>
      <div class="crt-scanline"></div>
      <div class="crt-vignette"></div>
      <div class="crt-boot-content crt-tear" style="
        color: #00ff00;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        text-shadow: 0 0 10px #00ff00;
        text-align: left;
        padding: 20px;
        position: relative;
        z-index: 10;
      ">
        <div style="opacity: 0; animation: bootLine 0.15s 0.2s forwards;">BIOS v1.73 HAM RADIO EDITION</div>
        <div style="opacity: 0; animation: bootLine 0.15s 0.5s forwards;">Memory Test: 640K OK</div>
        <div style="opacity: 0; animation: bootLine 0.15s 0.9s forwards;">Detecting hardware...</div>
        <div style="opacity: 0; animation: bootLine 0.15s 1.3s forwards;">  - MESHTASTIC NODE [OK]</div>
        <div style="opacity: 0; animation: bootLine 0.15s 1.6s forwards;">  - RF MODULE [OK]</div>
        <div style="opacity: 0; animation: bootLine 0.15s 1.9s forwards;">  - GPS RECEIVER [OK]</div>
        <div style="opacity: 0; animation: bootLine 0.15s 2.3s forwards;">Loading MeshRadar...</div>
        <div style="opacity: 0; animation: bootLine 0.15s 2.7s forwards; color: #ffaa00;">73 de OPERATOR</div>
      </div>
    `

    // Add boot animation style with glitch effects
    const style = document.createElement('style')
    style.id = 'crt-boot-style'
    style.textContent = `
      @keyframes bootLine {
        from { opacity: 0; transform: translateX(-5px); }
        to { opacity: 1; transform: translateX(0); }
      }

      @keyframes glitchText {
        0%, 100% {
          transform: translateX(0);
          text-shadow: 0 0 10px #00ff00;
        }
        10% {
          transform: translateX(-3px) skewX(-2deg);
          text-shadow: -3px 0 #ff0000, 3px 0 #00ffff, 0 0 10px #00ff00;
        }
        20% {
          transform: translateX(2px) skewX(1deg);
          text-shadow: 2px 0 #ff0000, -2px 0 #00ffff, 0 0 10px #00ff00;
        }
        30% {
          transform: translateX(0);
          text-shadow: 0 0 10px #00ff00;
        }
        40% {
          transform: translateX(-2px);
          text-shadow: -2px 0 #ff0000, 2px 0 #00ffff, 0 0 10px #00ff00;
        }
        50% {
          transform: translateX(0);
          text-shadow: 0 0 10px #00ff00;
        }
        60% {
          transform: translateX(4px) skewX(3deg);
          text-shadow: 4px 0 #ff0000, -4px 0 #00ffff, 0 0 10px #00ff00;
        }
        70% {
          transform: translateX(-1px);
          text-shadow: 0 0 10px #00ff00;
        }
        80% {
          transform: translateX(0);
          text-shadow: 0 0 10px #00ff00;
        }
        90% {
          transform: translateX(-3px) skewX(-1deg);
          text-shadow: -3px 0 #ff0000, 3px 0 #00ffff, 0 0 10px #00ff00;
        }
      }

      @keyframes scanlineMove {
        0% { transform: translateY(-100%); }
        100% { transform: translateY(100vh); }
      }

      @keyframes flicker {
        0%, 100% { opacity: 1; }
        5% { opacity: 0.8; }
        10% { opacity: 1; }
        15% { opacity: 0.6; }
        20% { opacity: 1; }
        50% { opacity: 0.9; }
        55% { opacity: 1; }
        70% { opacity: 0.7; }
        75% { opacity: 1; }
      }

      @keyframes horizontalTear {
        0%, 100% { clip-path: inset(0 0 0 0); transform: translateX(0); }
        15% { clip-path: inset(20% 0 70% 0); transform: translateX(-8px); }
        16% { clip-path: inset(0 0 0 0); transform: translateX(0); }
        40% { clip-path: inset(60% 0 30% 0); transform: translateX(5px); }
        41% { clip-path: inset(0 0 0 0); transform: translateX(0); }
        70% { clip-path: inset(40% 0 50% 0); transform: translateX(-10px); }
        71% { clip-path: inset(0 0 0 0); transform: translateX(0); }
      }

      .crt-boot-content {
        animation: glitchText 0.5s infinite, flicker 0.3s infinite;
      }

      .crt-scanline {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: rgba(0, 255, 0, 0.15);
        animation: scanlineMove 2s linear infinite;
        pointer-events: none;
      }

      .crt-noise {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E");
        pointer-events: none;
        animation: flicker 0.15s infinite;
      }

      .crt-vignette {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%);
        pointer-events: none;
      }

      .crt-tear {
        animation: horizontalTear 3s infinite;
      }
    `
    document.head.appendChild(style)

    // Apply retro class after delay
    setTimeout(() => {
      root.classList.add('retro')
    }, 100)

    // Fade out boot screen
    setTimeout(() => {
      if (crtOverlay) {
        crtOverlay.style.transition = 'opacity 0.5s ease'
        crtOverlay.style.opacity = '0'
      }
    }, 3500)

    // Remove boot screen
    setTimeout(() => {
      crtOverlay?.remove()
      document.getElementById('crt-boot-style')?.remove()
    }, 4000)

  } else {
    // Standard flash effect for other themes
    let overlay = document.getElementById('theme-transition-overlay')
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = 'theme-transition-overlay'
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0);
        pointer-events: none;
        z-index: 9999;
      `
      document.body.appendChild(overlay)
    }

    overlay.style.transition = 'none'
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.08)'

    if (theme === 'dark') {
      root.classList.add('dark')
    }

    setTimeout(() => {
      overlay!.style.transition = 'background-color 0.3s ease'
      overlay!.style.backgroundColor = 'rgba(0, 0, 0, 0)'
    }, 30)

    setTimeout(() => {
      overlay!.style.transition = 'none'
    }, 330)
  }
}
