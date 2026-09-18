import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';
import {
  Box,
  Button,
  Typography,
  Paper,
  Divider,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import GoogleLogo from '../assets/Google__G__logo.png';

function Login() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  useEffect(() => {
    // If user is already logged in, redirect to home
    if (currentUser) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Force account selection to prevent auto-login
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      await signInWithPopup(auth, provider);
      navigate('/');
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user') {
        alert('Sign-in was cancelled. Please try again.');
      } else if (error.code === 'auth/popup-blocked') {
        alert('Popup was blocked by your browser. Please allow popups for this site and try again.');
      } else if (error.code === 'auth/unauthorized-domain') {
        alert('This site is not yet on the Firebase authorized-domain list. Error: ' + error.message);
      } else {
        alert('Sign-in failed. Please try again. Error: ' + error.message);
      }
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
          sx={{
            background: 'linear-gradient(90deg, #00DC82 0%, #00b86b 100%)',
            color: '#fff',
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
          startIcon={
            <img
              src={GoogleLogo}
              alt="Google logo"
              style={{ width: 24, height: 24, background: 'white', borderRadius: '50%' }}
            />
          }
        >
          Sign in with Google
        </Button>
        <Typography variant="body2" color="text.secondary" align="center">
          Sign in to start identifying and managing your plants
        </Typography>
      </Paper>
    </Box>
  );
}

export default Login; 