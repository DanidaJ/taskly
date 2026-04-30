/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Map primary to blue (Apple design system)
        primary: {
          50: '#E5F1FF',
          100: '#CCE4FF',
          200: '#99C9FF',
          300: '#66ADFF',
          400: '#3392FF',
          500: '#007AFF',
          600: '#0062CC',
          700: '#004999',
          800: '#003166',
          900: '#001833',
        },
        // Apple-inspired vibrant color palette
        blue: {
          50: '#E5F1FF',
          100: '#CCE4FF',
          200: '#99C9FF',
          300: '#66ADFF',
          400: '#3392FF',
          500: '#007AFF', // Apple Blue
          600: '#0062CC',
          700: '#004999',
          800: '#003166',
          900: '#001833',
        },
        purple: {
          50: '#F5EDFF',
          100: '#EBDCFF',
          200: '#D7B9FF',
          300: '#C396FF',
          400: '#AF73FF',
          500: '#9B50FF', // Apple Purple
          600: '#7C40CC',
          700: '#5D3099',
          800: '#3E2066',
          900: '#1F1033',
        },
        pink: {
          50: '#FFE5F5',
          100: '#FFCCEB',
          200: '#FF99D7',
          300: '#FF66C3',
          400: '#FF33AF',
          500: '#FF2D9B', // Apple Pink
          600: '#CC247C',
          700: '#991B5D',
          800: '#66123E',
          900: '#33091F',
        },
        green: {
          50: '#E5F9F0',
          100: '#CCF3E1',
          200: '#99E7C3',
          300: '#66DBA5',
          400: '#33CF87',
          500: '#34C759', // Apple Green
          600: '#2A9F47',
          700: '#1F7735',
          800: '#154F23',
          900: '#0A2812',
        },
        orange: {
          50: '#FFF3E5',
          100: '#FFE7CC',
          200: '#FFCF99',
          300: '#FFB766',
          400: '#FF9F33',
          500: '#FF9500', // Apple Orange
          600: '#CC7700',
          700: '#995900',
          800: '#663C00',
          900: '#331E00',
        },
        red: {
          50: '#FFE5E5',
          100: '#FFCCCC',
          200: '#FF9999',
          300: '#FF6666',
          400: '#FF3333',
          500: '#FF3B30', // Apple Red
          600: '#CC2F26',
          700: '#99231D',
          800: '#661813',
          900: '#330C0A',
        },
        teal: {
          50: '#E5F9FC',
          100: '#CCF3F9',
          200: '#99E7F3',
          300: '#66DBED',
          400: '#33CFE7',
          500: '#5AC8FA', // Apple Teal
          600: '#48A0C8',
          700: '#367896',
          800: '#245064',
          900: '#122832',
        },
        yellow: {
          50: '#FFFCE5',
          100: '#FFF9CC',
          200: '#FFF399',
          300: '#FFED66',
          400: '#FFE733',
          500: '#FFCC00', // Apple Yellow
          600: '#CCA300',
          700: '#997A00',
          800: '#665200',
          900: '#332900',
        },
        // Neutral colors with Apple's aesthetic
        gray: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
          950: '#0A0E14',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
        heading: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'gradient-blue': 'linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%)',
        'gradient-purple': 'linear-gradient(135deg, #9B50FF 0%, #FF2D9B 100%)',
        'gradient-green': 'linear-gradient(135deg, #34C759 0%, #5AC8FA 100%)',
        'gradient-orange': 'linear-gradient(135deg, #FF9500 0%, #FF3B30 100%)',
      },
      boxShadow: {
        'apple': '0 4px 16px rgba(0, 0, 0, 0.12)',
        'apple-lg': '0 8px 32px rgba(0, 0, 0, 0.16)',
        'apple-xl': '0 16px 48px rgba(0, 0, 0, 0.24)',
        'glow-blue': '0 0 20px rgba(0, 122, 255, 0.4)',
        'glow-purple': '0 0 20px rgba(155, 80, 255, 0.4)',
        'glow-pink': '0 0 20px rgba(255, 45, 155, 0.4)',
      },
      borderRadius: {
        'apple': '12px',
        'apple-lg': '16px',
        'apple-xl': '20px',
      },
      spacing: {
        '13': '2.75rem', // 44px - Apple macOS standard navbar height
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'slide-down': 'slideDown 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
    },
  },
  plugins: [],
}
