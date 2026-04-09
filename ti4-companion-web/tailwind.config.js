/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        void:    '#07080d',
        hull:    '#0d1117',
        panel:   '#161b22',
        border:  '#21262d',
        muted:   '#30363d',
        dim:     '#6e7681',
        text:    '#c9d1d9',
        bright:  '#f0f6fc',
        gold:    '#d4a017',
        plasma:  '#58a6ff',
        danger:  '#f85149',
        warning: '#e3b341',
        success: '#3fb950',
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body:    ['Rajdhani', 'sans-serif'],
        mono:    ['Space Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
