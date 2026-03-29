/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body: ['Rajdhani', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
      colors: {
        void: '#050810',
        hull: '#0d1117',
        panel: '#111827',
        border: '#1f2937',
        muted: '#374151',
        dim: '#6b7280',
        text: '#e2e8f0',
        bright: '#f8fafc',
        gold: '#f59e0b',
        'gold-dim': '#78350f',
        plasma: '#06b6d4',
        'plasma-dim': '#164e63',
        danger: '#ef4444',
        success: '#10b981',
        warning: '#f59e0b',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
