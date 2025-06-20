/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/**/*.{html,js,ts,jsx,tsx}", "./src/**/*.ts", "./src/components/*.ts", "./src/*.ts", "./public/**/*.html"],
    theme: {
        extend: {
            colors: {
                "vs-bg": "#1e1e1e",
                "vs-text": "#d4d4d4",
                "vs-muted": "#8c8c8c",
                "vs-accent": "#569cd6",
                "vs-user": "#6a9955",
                "vs-assistant": "#ce9178",
                "vs-warning": "#f48771",
                "vs-function": "#dcdcaa",
                "vs-type": "#4ec9b0",
                "vs-border": "#3e3e42",
                "vs-border-light": "#5a5a5e",
                "vs-bg-secondary": "#2d2d30",
                "vs-nav": "#3e3e42",
                "vs-nav-hover": "#4a4a4e",
                "vs-nav-active": "#f48771",
                "vs-highlight": "#8b6914",
            },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-in-out',
                'slide-up': 'slideUp 0.3s ease-out',
                'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
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
                pulseGlow: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.5' },
                },
            },
        },
    },
    plugins: [],
};