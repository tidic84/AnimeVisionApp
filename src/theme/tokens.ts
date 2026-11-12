import { Easing } from 'react-native';

/** 4/8 dp grid; 16 is the screen gutter. */
export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 40 } as const;

/** Screen gutter: generous on wide screens (Windows, tablets), 16 on phones. `wide` matches the sidebar breakpoint. */
export const layout = { wide: 1024, gutter: 16, gutterWide: 32 } as const;
export const gutterFor = (width: number) => width >= layout.wide ? layout.gutterWide : layout.gutter;

/** Size / line-height pairs. Text keeps the system font. */
export const typography = {
  hero: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.5 },
  section: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  headline: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  display: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
} as const;

export const motion = {
  easing: {
    standard: Easing.bezier(0.5, 0, 0.25, 1),
    decelerate: Easing.bezier(0.23, 1, 0.32, 1),
    accelerate: Easing.bezier(0.3, 0, 1, 1),
  },
  duration: { micro: 100, short: 200, medium: 300, long: 450, shimmer: 1200 },
} as const;
