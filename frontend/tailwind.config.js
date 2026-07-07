/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0f17',
        panel: '#111827',
        panelBorder: '#1f2937',
        accent: '#38bdf8',
        node: {
          goal: '#f472b6',
          technique: '#38bdf8',
          metric: '#facc15',
          finding: '#4ade80',
          source: '#a78bfa',
          run: '#fb923c',
          artifact: '#f87171',
          task: '#94a3b8',
        },
      },
    },
  },
  plugins: [],
};
