import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider, browserPopupRedirectResolver } from 'firebase/auth';
import { auth } from '../firebase';
import {
  Box,
  Button,
  Typography,
  Paper,
  Divider,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { BUTTON_TEXT } from '../theme';

/** Google's "G" mark as a 0.6 KB inline SVG (was an 88 KB PNG shown at 24 px, D6). */
function GoogleG() {
  return (
    <svg width="24" height="24" viewBox="0 0 48 48" aria-hidden="true" focusable="false" style={{ background: '#fff', borderRadius: '50%', padding: 3, boxSizing: 'border-box' }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function Login() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // If user is already logged in, redirect to home
    if (currentUser) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  const handleGoogleLogin = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const provider = new GoogleAuthProvider();
      // Force account selection to prevent auto-login
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      // The resolver is passed here instead of at auth init, so the sign-in iframe loads on click, not on every page (D6).
      await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      navigate('/');
    } catch (error) {
      // Never use alert() here: a native dialog freezes the page and hides the retry button.
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        setMessage('Sign-in was cancelled. Click the button to try again.');
      } else if (error.code === 'auth/popup-blocked') {
        setMessage('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.');
      } else if (error.code === 'auth/unauthorized-domain') {
        setMessage('This address is not on the app\'s allowed sign-in list yet (' + window.location.hostname + ').');
      } else {
        setMessage('Sign-in failed: ' + (error.message || 'unknown error') + '. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #101112 0%, #00DC82 100%)',
      }}
    >
      <Paper
        elevation={6}
        sx={{
          p: 5,
          borderRadius: 4,
          minWidth: 350,
          maxWidth: 400,
          bgcolor: '#18181B',
          color: '#fff',
          boxShadow: '0 8px 32px 0 rgba(0,220,130,0.10)',
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography component="h1" variant="h4" fontWeight={700} gutterBottom>
            Plant It
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Your personal plant identification and care assistant
          </Typography>
        </Box>
        <Divider sx={{ mb: 3, bgcolor: 'rgba(255,255,255,0.08)' }} />
        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={handleGoogleLogin}
          disabled={busy}
          sx={{
            background: 'linear-gradient(90deg, #00DC82 0%, #00b86b 100%)',
            color: BUTTON_TEXT,
            fontWeight: 600,
            fontSize: '1.1rem',
            py: 1.5,
            mb: 2,
            borderRadius: 2,
            boxShadow: '0 2px 8px 0 rgba(0,220,130,0.10)',
            '&:hover': {
              background: 'linear-gradient(90deg, #00b86b 0%, #00DC82 100%)',
            },
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
          startIcon={<GoogleG />}
        >
          {busy ? 'Opening Google sign-in…' : 'Sign in with Google'}
        </Button>
        {message && (
          <Typography role="alert" variant="body2" align="center" sx={{ color: '#ffb4a2', mb: 2 }}>
            {message}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" align="center">
          Sign in to start identifying and managing your plants
        </Typography>
      </Paper>
    </Box>
  );
}

export default Login; 