// Clipiro design tokens — source: @clipiro/ui (.theme-emerald), used by every mobile screen.
export const colors = {
  bg: '#050908', bgDeep: '#020504',
  surface1: '#080d0b', surface2: '#0b1210', surface3: '#101815',
  panel: '#0b1210', panelRaised: '#101815',
  fg: '#f5f7f4', fgMuted: '#9aa49f', fgSubtle: '#7e8a85',
  line: 'rgba(255,255,255,0.08)', lineStrong: 'rgba(255,255,255,0.14)',
  primary: '#c8ff55', primaryHover: '#d6ff7a', primaryPress: '#b4ef3c', onPrimary: '#071006',
  emerald: '#00a968', emeraldBright: '#20d68a',
  tint: 'rgba(32,214,138,0.10)', tintBorder: 'rgba(32,214,138,0.28)',
  success: '#20d68a', warning: '#f5b544', error: '#ff6b6b', info: '#4ea8ff',
} as const;

export const radius = { field: 12, tile: 16, card: 24, sheet: 24, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

export const font = {
  family: { sans: 'Geist', mono: 'GeistMono' },
  size: { min: 11, caption: 12, body: 15, title: 20, h1: 26, display: 34 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' },
} as const;

export const layout = {
  minTouch: 44,          // every tappable element
  screenPadding: 16,
  tabBar: { height: 68, inset: 16, radius: 999 },
  designWidth: 412,      // designs are drawn at 412 x 915
} as const;

export const shadow = {
  card: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
} as const;
