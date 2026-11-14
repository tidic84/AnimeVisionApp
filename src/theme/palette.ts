/** Shared visual language. Keep both system themes readable and consistent. */
// Dark « Cinéma » theme: anthracite layers (background → surface → surfaceElevated) and a single violet accent.
// accentSoft: selected chips / sidebar item; hover: pointer feedback on Windows; scrim: text over artwork.
export const palette = {
  light: {
    background: '#FFFFFF', surface: '#F4F4F7', surfaceElevated: '#EAEAF0', card: '#F4F4F7',
    text: '#14151B', textSecondary: '#5E6272', textTertiary: '#8A8E9E', border: '#DCDCE4',
    primary: '#6847E6', primaryStart: '#7C5CFF', primaryEnd: '#6847E6',
    accent: '#6847E6', accentSoft: 'rgba(104,71,230,0.12)', hover: 'rgba(20,21,27,0.05)', scrim: 'rgba(0,0,0,0.55)',
    success: '#1F8F6C', warning: '#A86B12', premium: '#A86B12', danger: '#D23F4A', error: '#D23F4A',
    tabBar: '#F4F4F7', tabBarInactive: '#5E6272', buttonBg: '#7C5CFF', buttonText: '#FFFFFF', overlay: 'rgba(0,0,0,0.6)',
  },
  dark: {
    background: '#111117', surface: '#1A1B23', surfaceElevated: '#252631', card: '#1A1B23',
    text: '#F5F5F8', textSecondary: '#A7A9B8', textTertiary: '#71748A', border: '#2A2B37',
    primary: '#A08BFF', primaryStart: '#A08BFF', primaryEnd: '#7C5CFF',
    accent: '#A08BFF', accentSoft: 'rgba(160,139,255,0.16)', hover: 'rgba(255,255,255,0.06)', scrim: 'rgba(8,8,12,0.62)',
    success: '#3FD0A4', warning: '#FFC94A', premium: '#FFC94A', danger: '#FF5A5F', error: '#FF5A5F',
    tabBar: '#0C0C11', tabBarInactive: '#8A8DA0', buttonBg: '#7C5CFF', buttonText: '#FFFFFF', overlay: 'rgba(0,0,0,0.6)',
  },
};
