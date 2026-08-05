import { Easing, Platform, TextStyle, ViewStyle } from 'react-native';

export interface AppTheme {
  id: string;
  name: string;
  description: string;
  isPremium: boolean;
  colors: {
    backgroundPrimary: string;
    backgroundSecondary: string;
    surfacePrimary: string;
    surfaceSecondary: string;
    surfacePaper: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accentPrimary: string;
    accentSecondary: string;
    accentMetallic: string;
    success: string;
    danger: string;
    border: string;
    borderStrong: string;
    shadow: string;
    glow: string;
  };
  progressStyle: 'sticker-sheet' | 'wax-seals' | 'flower-garden' | 'constellation' | 'minimal-stamps';
  texturePreset: 'paper' | 'night' | 'linen' | 'minimal';
  stickerPackId?: string;
  motionPreset: 'soft' | 'dreamy' | 'minimal';
}

export const softKeepsakeTheme: AppTheme = {
  id: 'soft-feminine-premium',
  name: 'Soft Keepsake',
  description: 'Warm paper, blush tones, rose-gold details, and collectible nightly stickers.',
  isPremium: false,
  colors: {
    backgroundPrimary: '#F8EFE7',
    backgroundSecondary: '#FFF9F4',
    surfacePrimary: '#FFFDF9',
    surfaceSecondary: '#F4E6DE',
    surfacePaper: '#F9F0E8',
    textPrimary: '#4A2635',
    textSecondary: '#765263',
    textMuted: '#9A7482',
    accentPrimary: '#BE6F7C',
    accentSecondary: '#EFBCC3',
    accentMetallic: '#B88635',
    success: '#6F8E78',
    danger: '#A84F61',
    border: 'rgba(102,67,80,0.13)',
    borderStrong: 'rgba(102,67,80,0.24)',
    shadow: '#52303E',
    glow: 'rgba(216,140,153,0.34)',
  },
  progressStyle: 'sticker-sheet',
  texturePreset: 'paper',
  stickerPackId: 'keepsake-classics',
  motionPreset: 'soft',
};

const theme = softKeepsakeTheme.colors;

// Semantic aliases keep the domain components theme-agnostic and make future
// visual packs a single-token swap instead of a component rewrite.
//
// The `*Text` variants are the accent colours corrected to clear 4.5:1 against
// both the page background (#F8EFE7) and card surfaces (#FFFDF9). Use the base
// token for fills, strokes and artwork; use the `*Text` token for anything a
// person has to read.
export const colors = {
  ink: theme.backgroundPrimary,
  inkBlue: theme.backgroundSecondary,
  inkRaised: theme.surfacePrimary,
  inkSoft: theme.surfaceSecondary,
  bone: theme.textPrimary,
  boneDim: theme.textSecondary,
  boneFaint: '#896371',
  brass: theme.accentMetallic,
  brassText: '#8D6729',
  ember: theme.danger,
  rose: theme.accentPrimary,
  roseText: '#AF4F5F',
  roseDeep: '#B45968',
  blush: theme.accentSecondary,
  moss: theme.success,
  mossText: '#5A7462',
  paper: theme.surfacePaper,
  paperInk: '#3E2331',
  paperDim: '#6E4B5B',
  line: theme.border,
  lineStrong: theme.borderStrong,
  shadow: theme.shadow,
  white: '#FFFDF9',
  watercolor: 'rgba(239,188,195,0.22)',
  tape: 'rgba(211,151,151,0.42)',
} as const;

/** Gradient stop pairs. The lightest stop of every text-bearing gradient is
 *  contrast-checked against `colors.white`. */
export const gradients = {
  primary: ['#B45968', '#9C4054'] as const,
  ember: ['#A84F61', '#8E3B4E'] as const,
  page: ['#FFFAF6', '#F8EFE7', '#F4E4DC'] as const,
  paperPage: ['#FFFDF9', '#F9F0E8', '#F5E3DC'] as const,
  cardSheen: ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0)'] as const,
  highlight: ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)'] as const,
  seal: ['#C97F8C', '#A54759'] as const,
};

export const windowRamp = [
  ['#6C4052', '#956174'],
  ['#BE6F7C', '#D99AA4'],
  ['#D88C99', '#F0C1C6'],
  ['#B88635', '#E4C27A'],
  ['#8D6D7B', '#C5A7B2'],
  ['#A87972', '#D9AEA6'],
  ['#7C8F7D', '#B8C7B7'],
] as const;

/** The hour ramp in chronological order — this is what a legend must render. */
export const hourRamp = [
  { label: '6 PM', from: 18, to: 20, color: windowRamp[3] },
  { label: '8 PM', from: 20, to: 22, color: windowRamp[1] },
  { label: '10 PM', from: 22, to: 24, color: windowRamp[0] },
  { label: '12 AM', from: 0, to: 1, color: windowRamp[2] },
  { label: '1 AM', from: 1, to: 3, color: windowRamp[4] },
  { label: '3 AM', from: 3, to: 5, color: windowRamp[5] },
  { label: '5 AM', from: 5, to: 18, color: windowRamp[6] },
] as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

/** Minimum comfortable touch target. */
export const HIT_TARGET = 44;

const systemSans = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }) ?? 'sans-serif';

export const typography = {
  serif: 'Fraunces_400Regular',
  serifItalic: 'Fraunces_400Regular_Italic',
  serifMedium: 'Fraunces_500Medium',
  serifSemiBold: 'Fraunces_600SemiBold',
  sans: systemSans,
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

/** Real weights for the system sans stack. Custom families (Fraunces, DM Mono)
 *  carry their weight in the family name instead — see `typography`. */
export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;

/** Motion tokens from the design system (§11.1). Every animation in the app
 *  should pull its duration and curve from here rather than inventing one. */
export const motion = {
  fast: 140,
  normal: 240,
  slow: 420,
  ceremonial: 900,
  stagger: 65,
  easeSoft: Easing.bezier(0.22, 1, 0.36, 1),
  easeSpring: Easing.bezier(0.34, 1.56, 0.64, 1),
  easeGentle: Easing.bezier(0.16, 1, 0.3, 1),
  easeInOut: Easing.bezier(0.65, 0, 0.35, 1),
} as const;

export const shadows: Record<string, ViewStyle> = {
  soft: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 20,
    elevation: 4,
  },
  floating: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.19,
    shadowRadius: 28,
    elevation: 8,
  },
  lifted: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.22,
    shadowRadius: 38,
    elevation: 12,
  },
  glow: {
    shadowColor: colors.rose,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 22,
    elevation: 6,
  },
};

export const textStyles: Record<string, TextStyle> = {
  eyebrow: {
    color: colors.roseText,
    fontFamily: typography.monoMedium,
    fontSize: 12,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.bone,
    fontFamily: typography.serifSemiBold,
    fontSize: 43,
    lineHeight: 49,
    letterSpacing: -1,
  },
  display: {
    color: colors.bone,
    fontFamily: typography.serifSemiBold,
    fontSize: 52,
    lineHeight: 59,
    letterSpacing: -1.4,
  },
  heading: {
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 25,
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  body: {
    color: colors.bone,
    fontFamily: typography.sans,
    fontWeight: weight.regular,
    fontSize: 17,
    lineHeight: 27,
  },
  bodySmall: {
    color: colors.boneDim,
    fontFamily: typography.sans,
    fontWeight: weight.regular,
    fontSize: 15,
    lineHeight: 23,
  },
  label: {
    color: colors.boneDim,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    color: colors.boneDim,
    fontFamily: typography.sans,
    fontWeight: weight.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  quote: {
    color: colors.paperInk,
    fontFamily: typography.serifItalic,
    fontSize: 21,
    lineHeight: 31,
  },
  mono: {
    color: colors.bone,
    fontFamily: typography.mono,
    fontSize: 13,
    lineHeight: 19,
  },
};

const defaultHue = windowRamp[6];

export function hueForHour(hour: number) {
  const match = hourRamp.find((band) => (band.from <= band.to
    ? hour >= band.from && hour < band.to
    : hour >= band.from || hour < band.to));
  return match ? match.color : defaultHue;
}
