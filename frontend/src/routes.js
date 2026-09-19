import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { motion } from 'framer-motion';
import { useAuth } from './contexts/AuthContext';
import Home from './components/Home';
import Login from './components/Login';
import NotFound from './components/NotFound';

// The three heavy pages load on demand so the first paint of /login and / is not
// waiting for the dropzone, the dialogs and the sensor panel (TEST round 1 D6).
const PlantList = lazy(() => import('./components/PlantList'));
const PlantUpload = lazy(() => import('./components/PlantUpload'));
const PlantDetails = lazy(() => import('./components/PlantDetails'));

/** React Router v6 opt-ins (silences the v7 upgrade warnings; startTransition keeps navigations non-blocking). */
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

export function PrivateRoute({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!currentUser) return <Navigate to="/login" />;
  return children;
}

const fallback = (
  <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
    <CircularProgress aria-label="Loading page" />
  </Box>
);

/** All routes. Rendered inside a Router (BrowserRouter in the app, MemoryRouter in tests). */
export function AppRoutes() {
  const location = useLocation();
  return (
    // A short opacity-only fade: the old 0.5 s slide-in (plus a 0.5 s exit) delayed every page's first paint.
    <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} style={{ minHeight: '100vh' }}>
      <Suspense fallback={fallback}>
        <Routes location={location}>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
          <Route path="/plants" element={<PrivateRoute><PlantList /></PrivateRoute>} />
          <Route path="/add-plant" element={<PrivateRoute><PlantUpload /></PrivateRoute>} />
          <Route path="/plant-details" element={<PrivateRoute><PlantDetails /></PrivateRoute>} />
          <Route path="*" element={<PrivateRoute><NotFound /></PrivateRoute>} />
        </Routes>
      </Suspense>
    </motion.div>
  );
}
