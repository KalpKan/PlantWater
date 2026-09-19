import theme, { contrastRatio } from './theme';

describe('theme colours are readable (TEST round 1 D10)', () => {
  test('primary button text reaches WCAG AA (>= 4.5:1) on the accent and on both ends of the button gradient', () => {
    const text = theme.palette.primary.contrastText;
    expect(contrastRatio(text, theme.palette.primary.main)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(text, '#00DC82')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(text, '#00b86b')).toBeGreaterThanOrEqual(4.5);
    const contained = theme.components.MuiButton.styleOverrides.containedPrimary;
    expect(contained.color).toBe(text);
  });

  test('a disabled contained button does not keep the green gradient', () => {
    const contained = theme.components.MuiButton.styleOverrides.containedPrimary;
    const disabled = contained['&.Mui-disabled'];
    expect(disabled).toBeDefined();
    expect(String(disabled.background)).not.toMatch(/00DC82|00b86b/i);
  });

  test('contrastRatio is the WCAG formula', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#fff', '#00DC82')).toBeLessThan(2); // the round-1 finding: 1.8:1
  });
});
