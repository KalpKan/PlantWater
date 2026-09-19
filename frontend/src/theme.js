import { createTheme } from '@mui/material/styles';

/** Text colour used on the green accent (buttons, filled chips). */
export const BUTTON_TEXT = '#062b1c';

/** WCAG 2.x relative luminance of a #rgb / #rrggbb colour. */
function luminance(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00DC82', // Green accent
      // Dark green-black on the accent: 9.6:1 (white on #00DC82 was 1.8:1, TEST round 1 D10).
      contrastText: BUTTON_TEXT,
    },
    secondary: {
      main: '#18181B', // Black/near-black
      contrastText: '#fff',
    },
    background: {
      default: '#101112', // Very dark background
      paper: '#18181B',   // Slightly lighter for cards
    },
    text: {
      primary: '#fff',
      secondary: '#B0B0B0',
    },
    success: {
      main: '#00DC82',
    },
    error: {
      main: '#FF5252',
    },
    warning: {
      main: '#FFC107',
    },
    info: {
      main: '#36E4DA',
    },
  },
  typography: {
    fontFamily: 'Inter, Roboto, "Helvetica Neue", Arial, sans-serif',
    h4: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
      fontSize: '2.2rem',
      color: '#fff',
    },
    h6: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
      color: '#fff',
    },
    body1: {
      fontSize: '1.1rem',
      color: '#fff',
    },
    button: {
      fontWeight: 600,
      letterSpacing: '0.02em',
      textTransform: 'none',
    },
  },
  shape: {
    borderRadius: 18,
  },
  components: {
    MuiCssBaseline: {
      // Phone guard: nothing may make the page scroll sideways.
      styleOverrides: { html: { overflowX: 'hidden' }, body: { overflowX: 'hidden' } },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          fontWeight: 600,
          padding: '10px 24px',
          boxShadow: 'none',
          transition: 'background 0.2s',
        },
        containedPrimary: {
          background: 'linear-gradient(90deg, #00DC82 0%, #00b86b 100%)',
          color: BUTTON_TEXT,
          '&:hover': {
            background: 'linear-gradient(90deg, #00b86b 0%, #00DC82 100%)',
            boxShadow: '0 4px 16px 0 rgba(0,220,130,0.10)',
          },
          // A disabled primary button must not look like an enabled one (D10): flat grey, dim text.
          '&.Mui-disabled': {
            background: 'rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.45)',
          },
        },
        containedSecondary: {
          background: '#18181B',
          color: '#fff',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 18,
          boxShadow: '0 4px 24px 0 rgba(0,0,0,0.16)',
          border: '1px solid #23272F',
          background: '#18181B',
          color: '#fff',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 18,
          background: '#18181B',
          color: '#fff',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(90deg, #101112 0%, #18181B 100%)',
          color: '#fff',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: '#18181B',
          color: '#fff',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: '#23272F',
        },
      },
    },
  },
});

export default theme;
