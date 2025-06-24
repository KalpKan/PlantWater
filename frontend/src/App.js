import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Home from './components/Home';
import Login from './components/Login';
import PlantList from './components/PlantList';
import PlantUpload from './components/PlantUpload';
import PlantDetails from './components/PlantDetails';
import { AnimatePresence, motion } from 'framer-motion';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00DC82', // Green accent
      contrastText: '#fff',
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
          color: '#fff',
          '&:hover': {
            background: 'linear-gradient(90deg, #00b86b 0%, #00DC82 100%)',
            boxShadow: '0 4px 16px 0 rgba(0,220,130,0.10)',
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

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -24 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ minHeight: '100vh' }}
      >
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Home />
              </PrivateRoute>
            }
          />
          <Route
            path="/plants"
            element={
              <PrivateRoute>
                <PlantList />
              </PrivateRoute>
            }
          />
          <Route
            path="/add-plant"
            element={
              <PrivateRoute>
                <PlantUpload />
              </PrivateRoute>
            }
          />
          <Route
            path="/plant-details"
            element={
              <PrivateRoute>
                <PlantDetails />
              </PrivateRoute>
            }
          />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Navbar />
          <AnimatedRoutes />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App; 