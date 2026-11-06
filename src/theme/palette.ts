/** Shared visual language. Keep both system themes readable and consistent. */
// Dark theme: layered surfaces (background → surface → surfaceElevated) and a single violet accent.
export const palette = {
  light: {
    background: '#FFFFFF', surface: '#F4F4F7', surfaceElevated: '#EAEAF0', card: '#F4F4F7',
    text: '#14151B', textSecondary: '#5E6272', textTertiary: '#8A8E9E', border: '#DCDCE4',
    primary: '#6847E6', primaryStart: '#7C5CFF', primaryEnd: '#6847E6',
    accent: '#6847E6', success: '#1F8F6C', warning: '#A86B12', premium: '#A86B12', danger: '#D23F4A', error: '#D23F4A',
    tabBar: '#F4F4F7', tabBarInactive: '#5E6272', buttonBg: '#7C5CFF', buttonText: '#FFFFFF', overlay: 'rgba(0,0,0,0.6)',
  },
  dark: {
    background: '#0F1016', surface: '#1C1E27', surfaceElevated: '#2A2D3A', card: '#1C1E27',
    text: '#FFFFFF', textSecondary: '#A3A6B5', textTertiary: '#6E7286', border: '#2A2D3A',
    primary: '#9B84FF', primaryStart: '#9B84FF', primaryEnd: '#7C5CFF',
    accent: '#9B84FF', success: '#3FD0A4', warning: '#FFC94A', premium: '#FFC94A', danger: '#FF5A5F', error: '#FF5A5F',
    tabBar: '#16171F', tabBarInactive: '#8A8E9E', buttonBg: '#7C5CFF', buttonText: '#FFFFFF', overlay: 'rgba(0,0,0,0.6)',
  },
};
