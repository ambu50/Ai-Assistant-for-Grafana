import type { GrafanaTheme2 } from '@grafana/data';
import type { CSSProperties } from 'react';

export function assistantTheme(theme: GrafanaTheme2): CSSProperties {
  const { colors, components, typography } = theme;
  return {
    colorScheme: colors.mode,
    '--bg': colors.background.canvas,
    '--panel': colors.background.primary,
    '--surface': colors.background.secondary,
    '--border': colors.border.weak,
    '--border-strong': colors.border.medium,
    '--muted': colors.text.secondary,
    '--text': colors.text.primary,
    '--accent': colors.primary.text,
    '--link': colors.text.link,
    '--hover': colors.action.hover,
    '--selected': colors.primary.transparent,
    '--selected-border': colors.primary.border,
    '--button-bg': colors.primary.main,
    '--button-text': colors.primary.contrastText,
    '--button-hover': colors.primary.shade,
    '--input-bg': components.input.background,
    '--code-bg': colors.background.canvas,
    '--code-text': colors.getContrastText(colors.background.canvas),
    '--success': colors.success.text,
    '--error': colors.error.text,
    '--error-bg': colors.error.transparent,
    '--error-border': colors.error.border,
    '--warning-bg': colors.warning.transparent,
    '--warning-border': colors.warning.border,
    '--info-bg': colors.info.transparent,
    '--info-text': colors.info.text,
    '--font': typography.fontFamily,
    '--font-mono': typography.fontFamilyMonospace,
    '--shadow': theme.shadows.z1,
  } as CSSProperties;
}
