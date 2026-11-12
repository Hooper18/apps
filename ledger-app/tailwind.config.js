/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#e53935',
          light: '#ff6f60',
          dark: '#ab000d',
        },
        // 灰阶对齐 iOS 系统色：50 = systemGroupedBackground / systemGray6，
        // 300 = 三级标签（箭头、占位），400 起是能当正文读的次级文字
        // （在白底上对比度 ≥ 4.5:1，HIG Accessibility 的要求），900 = label。
        gray: {
          50: '#F2F2F7',
          100: '#EBEBF0',
          200: '#E3E3E8',
          300: '#C7C7CC',
          400: '#76767B',
          500: '#636366',
          600: '#48484A',
          700: '#3A3A3C',
          800: '#1C1C1E',
          900: '#000000',
        },
        // 语义色取 iOS systemRed / systemGreen / systemBlue；600 是各自的
        // 高对比变体，用在需要当文字读的地方。
        red: {
          50: '#FFF1F0',
          100: '#FFE1DE',
          400: '#FF6961',
          500: '#FF3B30',
          600: '#D70015',
        },
        green: {
          50: '#EAF8EE',
          100: '#D5F2DD',
          400: '#5DD67B',
          500: '#34C759',
          600: '#248A3D',
          700: '#1D7A34',
        },
        blue: {
          50: '#EBF4FF',
          100: '#D6E9FF',
          400: '#409CFF',
          500: '#007AFF',
          600: '#0062CC',
        },
      },
      // 字号映射到 HIG 的 iOS 文本样式（Large 档）：
      // xs = Caption 1、sm = Subhead、base = Body / Headline、lg = Title 3、xl = Title 2。
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['15px', { lineHeight: '20px' }],
        base: ['17px', { lineHeight: '22px' }],
        lg: ['20px', { lineHeight: '25px' }],
        xl: ['22px', { lineHeight: '28px' }],
      },
      borderRadius: {
        lg: '10px',
        xl: '14px',
        '2xl': '20px',
        '3xl': '28px',
      },
      boxShadow: {
        // 只给浮在内容上方的导航层用，模拟玻璃材质的抬起感。
        glass: '0 0 0 0.5px rgba(0, 0, 0, 0.06), 0 6px 20px rgba(0, 0, 0, 0.08)',
      },
      screens: {
        'xs': '375px',
        // 屏幕够高（iPhone 全面屏）时把记账键盘按键撑到 44pt 以上。
        'tall': { raw: '(min-height: 780px)' },
      },
    },
  },
  plugins: [],
}
