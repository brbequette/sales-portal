"use client"

import React, { useState, useEffect } from "react"
import { FiX, FiCheck, FiRefreshCw, FiSun, FiSliders, FiEye, FiSave } from "react-icons/fi"

export interface ThemeColors {
  primary: string
  primaryHover: string
  background: string
  surface: string
  surface2: string
  foreground: string
  muted: string
  border: string
  success: string
  warning: string
  danger: string
  info: string
}

export const DEFAULT_THEME: ThemeColors = {
  primary: "#f97316",
  primaryHover: "#ea580c",
  background: "#000000",
  surface: "#0a0a0a",
  surface2: "#141414",
  foreground: "#f4f4f5",
  muted: "#a1a1aa",
  border: "rgba(255, 255, 255, 0.08)",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
}

export const PRESET_THEMES: { name: string; colors: ThemeColors }[] = [
  {
    name: "Titan Obsidian (Default)",
    colors: DEFAULT_THEME,
  },
  {
    name: "Emerald Cyberpunk",
    colors: {
      ...DEFAULT_THEME,
      primary: "#10b981",
      primaryHover: "#059669",
      background: "#040d0a",
      surface: "#091712",
      surface2: "#11261f",
    },
  },
  {
    name: "Midnight Sapphire",
    colors: {
      ...DEFAULT_THEME,
      primary: "#3b82f6",
      primaryHover: "#2563eb",
      background: "#060b17",
      surface: "#0d1527",
      surface2: "#18243b",
    },
  },
  {
    name: "Amethyst Violet",
    colors: {
      ...DEFAULT_THEME,
      primary: "#a855f7",
      primaryHover: "#9333ea",
      background: "#0c0517",
      surface: "#140924",
      surface2: "#211136",
    },
  },
  {
    name: "Crimson Titan",
    colors: {
      ...DEFAULT_THEME,
      primary: "#ef4444",
      primaryHover: "#dc2626",
      background: "#0f0404",
      surface: "#1a0808",
      surface2: "#291010",
    },
  },
  {
    name: "Golden Amber",
    colors: {
      ...DEFAULT_THEME,
      primary: "#f59e0b",
      primaryHover: "#d97706",
      background: "#0f0c05",
      surface: "#1a150a",
      surface2: "#292112",
    },
  },
]

export function applyThemeToCss(colors: ThemeColors) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.style.setProperty("--primary", colors.primary)
  root.style.setProperty("--primary-hover", colors.primaryHover)
  root.style.setProperty("--background", colors.background)
  root.style.setProperty("--surface", colors.surface)
  root.style.setProperty("--surface-2", colors.surface2)
  root.style.setProperty("--foreground", colors.foreground)
  root.style.setProperty("--muted", colors.muted)
  root.style.setProperty("--success", colors.success)
  root.style.setProperty("--warning", colors.warning)
  root.style.setProperty("--danger", colors.danger)
  root.style.setProperty("--info", colors.info)
}

export function loadSavedTheme(): ThemeColors {
  if (typeof window === "undefined") return DEFAULT_THEME
  try {
    const saved = localStorage.getItem("titan_theme_settings")
    if (saved) {
      return { ...DEFAULT_THEME, ...JSON.parse(saved) }
    }
  } catch {}
  return DEFAULT_THEME
}

export function ThemeSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [colors, setColors] = useState<ThemeColors>(DEFAULT_THEME)
  const [savedSuccess, setSavedSuccess] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const active = loadSavedTheme()
      setColors(active)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleColorChange = (key: keyof ThemeColors, value: string) => {
    const updated = { ...colors, [key]: value }
    setColors(updated)
    applyThemeToCss(updated)
  }

  const handleApplyPreset = (presetColors: ThemeColors) => {
    setColors(presetColors)
    applyThemeToCss(presetColors)
  }

  const handleSave = () => {
    try {
      localStorage.setItem("titan_theme_settings", JSON.stringify(colors))
      applyThemeToCss(colors)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2000)
    } catch (e) {
      console.error("Failed to save theme settings", e)
    }
  }

  const handleReset = () => {
    setColors(DEFAULT_THEME)
    applyThemeToCss(DEFAULT_THEME)
    localStorage.removeItem("titan_theme_settings")
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0f1013] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 border border-[var(--primary)]/30 flex items-center justify-center text-[var(--primary)] shadow-lg">
              <FiSliders size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wide">Theme & CSS Color Settings</h2>
              <p className="text-xs text-neutral-400">Customize global CSS colors, surfaces, and theme presets</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 scrollbar-none">
          {/* Theme Presets */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-2">
              <FiSun size={14} className="text-amber-400" /> Color Palette Presets
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {PRESET_THEMES.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handleApplyPreset(preset.colors)}
                  className="group flex flex-col p-3 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20 transition-all text-left cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-4 h-4 rounded-full border border-white/20 shadow-sm" style={{ background: preset.colors.primary }} />
                    <span className="w-4 h-4 rounded-full border border-white/20 shadow-sm" style={{ background: preset.colors.background }} />
                    <span className="w-4 h-4 rounded-full border border-white/20 shadow-sm" style={{ background: preset.colors.surface2 }} />
                  </div>
                  <span className="text-xs font-semibold text-white group-hover:text-[var(--primary)] transition-colors truncate">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Detailed Color Pickers */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-2">
              <FiEye size={14} className="text-sky-400" /> CSS Variable Customization
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Primary Color */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                <div>
                  <div className="text-xs font-bold text-white">Primary Brand</div>
                  <div className="text-[10px] text-neutral-500 font-mono">--primary</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.primary}
                    onChange={(e) => handleColorChange("primary", e.target.value)}
                    className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={colors.primary}
                    onChange={(e) => handleColorChange("primary", e.target.value)}
                    className="w-20 px-2 py-1 text-xs font-mono bg-black/40 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Primary Hover Color */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                <div>
                  <div className="text-xs font-bold text-white">Primary Hover</div>
                  <div className="text-[10px] text-neutral-500 font-mono">--primary-hover</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.primaryHover}
                    onChange={(e) => handleColorChange("primaryHover", e.target.value)}
                    className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={colors.primaryHover}
                    onChange={(e) => handleColorChange("primaryHover", e.target.value)}
                    className="w-20 px-2 py-1 text-xs font-mono bg-black/40 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Background Color */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                <div>
                  <div className="text-xs font-bold text-white">App Background</div>
                  <div className="text-[10px] text-neutral-500 font-mono">--background</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.background}
                    onChange={(e) => handleColorChange("background", e.target.value)}
                    className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={colors.background}
                    onChange={(e) => handleColorChange("background", e.target.value)}
                    className="w-20 px-2 py-1 text-xs font-mono bg-black/40 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Surface Color */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                <div>
                  <div className="text-xs font-bold text-white">Card Surface</div>
                  <div className="text-[10px] text-neutral-500 font-mono">--surface</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.surface}
                    onChange={(e) => handleColorChange("surface", e.target.value)}
                    className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={colors.surface}
                    onChange={(e) => handleColorChange("surface", e.target.value)}
                    className="w-20 px-2 py-1 text-xs font-mono bg-black/40 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Success Color */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                <div>
                  <div className="text-xs font-bold text-white">Success Accent</div>
                  <div className="text-[10px] text-neutral-500 font-mono">--success</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.success}
                    onChange={(e) => handleColorChange("success", e.target.value)}
                    className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={colors.success}
                    onChange={(e) => handleColorChange("success", e.target.value)}
                    className="w-20 px-2 py-1 text-xs font-mono bg-black/40 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Danger Color */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                <div>
                  <div className="text-xs font-bold text-white">Danger Accent</div>
                  <div className="text-[10px] text-neutral-500 font-mono">--danger</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.danger}
                    onChange={(e) => handleColorChange("danger", e.target.value)}
                    className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={colors.danger}
                    onChange={(e) => handleColorChange("danger", e.target.value)}
                    className="w-20 px-2 py-1 text-xs font-mono bg-black/40 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between bg-white/[0.02]">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 hover:border-white/20 text-xs font-semibold text-neutral-400 hover:text-white transition-all cursor-pointer"
          >
            <FiRefreshCw size={14} /> Reset Defaults
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-all shadow-lg shadow-[var(--primary)]/20 cursor-pointer"
            >
              {savedSuccess ? <FiCheck size={16} /> : <FiSave size={16} />}
              {savedSuccess ? "Saved!" : "Save & Apply Theme"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
