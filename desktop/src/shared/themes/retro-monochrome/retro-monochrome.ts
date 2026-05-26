import retroOverridesCss from './retro_overrides.css?inline';

import { AppThemeConfiguration } from '/@/shared/themes/app-theme-types';

const UI_FONT =
    'Inter, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const retroMonochrome: AppThemeConfiguration = {
    app: {
        'content-max-width': '1800px',
        'overlay-header': 'none',
        'overlay-subheader': 'none',
        'root-font-size': '14px',
        'scrollbar-handle-active-background': 'rgba(255,255,255,0.28)',
        'scrollbar-handle-background': 'rgba(255,255,255,0.16)',
        'scrollbar-handle-border-radius': '4px',
        'scrollbar-handle-hover-background': 'rgba(255,255,255,0.28)',
        'scrollbar-size': '8px',
        'scrollbar-track-active-background': '#080808',
        'scrollbar-track-background': '#080808',
        'scrollbar-track-border-radius': '0',
        'scrollbar-track-hover-background': '#080808',
    },
    colors: {
        background: '#050505',
        'background-alternate': '#080808',
        black: '#000000',
        foreground: '#f4f4f4',
        'foreground-muted': '#b8b8b8',
        primary: '#ffffff',
        'state-error': '#777777',
        'state-info': '#b8b8b8',
        'state-success': '#f4f4f4',
        'state-warning': '#777777',
        surface: '#0d0d0d',
        'surface-foreground': '#f4f4f4',
        white: '#f4f4f4',
    },
    mantineOverride: {
        defaultRadius: 4,
        fontFamily: UI_FONT,
        headings: {
            fontFamily: UI_FONT,
            fontWeight: '700',
            sizes: {
                h1: { fontSize: '2rem', fontWeight: '700', lineHeight: '1.2' },
                h2: { fontSize: '1.75rem', fontWeight: '700', lineHeight: '1.2' },
                h3: { fontSize: '1.125rem', fontWeight: '700', lineHeight: '1.3' },
                h4: { fontSize: '1rem', fontWeight: '700', lineHeight: '1.3' },
                h5: { fontSize: '0.875rem', fontWeight: '600', lineHeight: '1.3' },
                h6: { fontSize: '0.8125rem', fontWeight: '600', lineHeight: '1.3' },
            },
        },
        primaryColor: 'dark',
        primaryShade: { dark: 5, light: 9 },
        radius: {
            lg: '8px',
            md: '6px',
            sm: '4px',
            xl: '8px',
            xs: '4px',
        },
        shadows: {
            lg: 'none',
            md: 'none',
            sm: 'none',
            xl: 'none',
            xs: 'none',
            xxl: 'none',
        },
    },
    mode: 'dark',
    stylesheets: [retroOverridesCss],
};
