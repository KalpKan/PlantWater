import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
} from '@mui/material';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();

  const handleLogout = async () => {
    try {
      // Clear all stored data
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear any Firebase auth state
      await auth.signOut();
      
      // Force a complete page reload to clear any cached state
      window.location.href = '/login';
    } catch (error) {
      console.error('Error logging out:', error);
      // Even if there's an error, redirect to login
      window.location.href = '/login';
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography 
          variant="h6" 
          component="div" 
          sx={{ flexGrow: 1, cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          Plant It
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button 
            color="inherit" 
            onClick={() => navigate('/')}
            sx={{ 
              backgroundColor: location.pathname === '/' ? 'rgba(255,255,255,0.1)' : 'transparent'
            }}
          >
            Home
          </Button>
          
          <Button 
            color="inherit" 
            onClick={() => navigate('/plants')}
            sx={{ 
              backgroundColor: location.pathname === '/plants' ? 'rgba(255,255,255,0.1)' : 'transparent'
            }}
          >
            My Plants
          </Button>
          
          <Button 
            color="inherit" 
            onClick={() => navigate('/add-plant')}
            sx={{ 
              backgroundColor: location.pathname === '/add-plant' ? 'rgba(255,255,255,0.1)' : 'transparent'
            }}
          >
            Add Plant
          </Button>
          
          <Button color="inherit" onClick={handleLogout}>
            Logout
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Navbar; 