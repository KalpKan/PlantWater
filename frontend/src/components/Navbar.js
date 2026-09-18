import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import LogoutIcon from '@mui/icons-material/Logout';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const LINKS = [
  { to: '/', label: 'Home', icon: <HomeIcon /> },
  { to: '/plants', label: 'My Plants', icon: <LocalFloristIcon /> },
  { to: '/add-plant', label: 'Add Plant', icon: <AddPhotoAlternateIcon /> },
];

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const theme = useTheme();
  // Below the "sm" breakpoint (600px) the four buttons do not fit next to the
  // brand, so they collapse into a menu button + drawer.
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(false);

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

  const go = (to) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <AppBar position="static">
      <Toolbar sx={{ minWidth: 0, gap: 1 }}>
        <Typography
          variant="h6"
          component="div"
          sx={{ flexGrow: 1, minWidth: 0, whiteSpace: 'nowrap', cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          Plant It
        </Typography>

        {compact ? (
          <>
            <IconButton color="inherit" edge="end" aria-label="open menu" onClick={() => setOpen(true)}>
              <MenuIcon />
            </IconButton>
            <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
              <Box sx={{ width: 240 }} role="presentation">
                <List>
                  {LINKS.map((link) => (
                    <ListItemButton key={link.to} selected={location.pathname === link.to} onClick={() => go(link.to)}>
                      <ListItemIcon>{link.icon}</ListItemIcon>
                      <ListItemText primary={link.label} />
                    </ListItemButton>
                  ))}
                </List>
                <Divider />
                <List>
                  <ListItemButton onClick={handleLogout}>
                    <ListItemIcon><LogoutIcon /></ListItemIcon>
                    <ListItemText primary="Logout" />
                  </ListItemButton>
                </List>
              </Box>
            </Drawer>
          </>
        ) : (
          <Box sx={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            {LINKS.map((link) => (
              <Button
                key={link.to}
                color="inherit"
                onClick={() => navigate(link.to)}
                sx={{
                  whiteSpace: 'nowrap',
                  backgroundColor: location.pathname === link.to ? 'rgba(255,255,255,0.1)' : 'transparent',
                }}
              >
                {link.label}
              </Button>
            ))}

            <Button color="inherit" onClick={handleLogout} sx={{ whiteSpace: 'nowrap' }}>
              Logout
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
