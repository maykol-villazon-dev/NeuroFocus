/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Outfit', 'sans-serif'],
      },
      colors: {
        brand: {
          dark: '#020617',
          card: 'rgba(15, 23, 42, 0.75)',
          border: 'rgba(51, 65, 85, 0.5)',
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#F43F5E',
          violet: '#8B5CF6',
          cyan: '#06B6D4'
        }
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s infinite',
        'border-pulse': 'borderPulse 1.5s infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '0.4', filter: 'drop-shadow(0 0 15px rgba(244, 63, 94, 0.6))' },
          '50%': { opacity: '0.9', filter: 'drop-shadow(0 0 30px rgba(244, 63, 94, 0.9))' },
        },
        borderPulse: {
          '0%, 100%': { boxShadow: '0 0 20px 4px rgba(245, 158, 11, 0.5)' },
          '50%': { boxShadow: '0 0 35px 8px rgba(245, 158, 11, 0.85)' },
        }
      }
    },
  },
  plugins: [],
}
