import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    fontFamily: {
      sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui']
    },
    extend: {
      spacing: {
        '2.5': '0.875rem'
      },
      screens: {
        '3xl': '2000px'
      }
    }
  },
  plugins: []
};
export default config;
