import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        surface: '#0A0E17',
        surfaceRaised: '#111827',
        surfaceCard: '#161F30',
        surfaceHover: '#1C2740',
        border: '#1E293B',
        borderHover: '#334155',
        text: '#E2E8F0',
        textMuted: '#94A3B8',
        textDim: '#64748B',
        accent: '#06B6D4',
        accentLight: '#22D3EE',
        accentDim: '#0891B2',
        accentGlow: 'rgba(6, 182, 212, 0.15)',
        signal: '#10B981',
        signalLight: '#34D399',
        warning: '#F59E0B',
        warningLight: '#FBBF24',
        danger: '#EF4444',
        dangerLight: '#F87171',
        statusLow: '#F59E0B',
        statusRunning: '#10B981',
        statusHigh: '#EF4444',
      },
      fontFamily: {
        display: ['"Space Grotesk"', ...defaultTheme.fontFamily.sans],
        body: ['"Inter"', ...defaultTheme.fontFamily.sans],
        mono: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono],
        label: ['"Inter"', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  darkMode: 'class',
  plugins: [],
}
