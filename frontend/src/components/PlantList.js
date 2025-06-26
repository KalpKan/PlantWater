import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Divider,
  ListItemIcon,
  Snackbar,
  IconButton,
} from '@mui/material';
import { auth } from '../firebase';
import axios from 'axios';
import { motion } from 'framer-motion';
import WifiIcon from '@mui/icons-material/Wifi';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';

const gridVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08
    }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 }
};

function PlantList() {
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [devices, setDevices] = useState([]);
  const [discoveringDevices, setDiscoveringDevices] = useState(false);
  const [connectingDevice, setConnectingDevice] = useState(false);
  const [disconnectingDevice, setDisconnectingDevice] = useState(false);
  const [showDeviceDialog, setShowDeviceDialog] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [plantToDelete, setPlantToDelete] = useState(null);
  const [deletingPlant, setDeletingPlant] = useState(false);

  // Helper function to get the correct API URL
  const getApiUrl = (endpoint) => {
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://backend--plant-it-5e2fc.us-central1.hosted.app'
      : '';
    return `${baseUrl}${endpoint}`;
  };

  useEffect(() => {
    fetchPlants();
  }, []);

  // Check if any plant is connected to a device
  const hasConnectedPlant = plants.some(plant => plant.deviceConnected);

  // Temporary debug: Display user ID for Arduino configuration
  useEffect(() => {
    if (auth.currentUser) {
      console.log('🔧 ARDUINO CONFIG - User ID:', auth.currentUser.uid);
      console.log('🔧 ARDUINO CONFIG - Copy this User ID to your Arduino code');
    }
  }, []);

  const fetchPlants = async () => {
    try {
      setLoading(true);
      console.log('🔍 Fetching plants...');
      console.log('🔍 Current user:', auth.currentUser?.email);
      
      const token = await auth.currentUser.getIdToken();
      console.log('🔍 Got Firebase token');
      
      // Use the correct backend URL for production
      const apiUrl = getApiUrl('/api/plants');
      
      console.log('🔍 Making API call to:', apiUrl);
      console.log('🔍 Environment:', process.env.NODE_ENV);
      console.log('🔍 Base URL:', process.env.NODE_ENV === 'production' 
        ? 'https://backend--plant-it-5e2fc.us-central1.hosted.app'
        : 'localhost');
      
      // Test if backend is accessible at all
      try {
        const rootTest = await fetch(getApiUrl('/'), { mode: 'no-cors' });
        console.log('🔍 Root endpoint test:', rootTest);
      } catch (rootError) {
        console.error('🔍 Root endpoint not accessible:', rootError);
      }
      
      // Test health endpoint
      try {
        const healthTest = await fetch(getApiUrl('/api/health'), { mode: 'no-cors' });
        console.log('🔍 Health endpoint test:', healthTest);
      } catch (healthError) {
        console.error('🔍 Health endpoint not accessible:', healthError);
      }
      
      // First, let's test if the backend is accessible
      try {
        const testResponse = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('🔍 Test response status:', testResponse.status);
        console.log('🔍 Test response headers:', testResponse.headers);
      } catch (testError) {
        console.error('🔍 Test request failed:', testError);
      }
      
      const response = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('🔍 API response:', response.data);
      setPlants(response.data);
    } catch (error) {
      console.error('❌ Error fetching plants:', error);
      console.error('❌ Error response:', error.response?.data);
      console.error('❌ Error status:', error.response?.status);
      console.error('❌ Error headers:', error.response?.headers);
      console.error('❌ Error config:', error.config);
      
      if (error.code === 'ERR_NETWORK') {
        console.error('❌ Network error - check if backend is accessible');
        setError('Network error. Please check your connection and try again.');
      } else if (error.response?.status === 401) {
        console.error('❌ Authentication error');
        setError('Authentication failed. Please sign in again.');
      } else if (error.response?.status === 403) {
        console.error('❌ Forbidden error');
        setError('Access denied. Please check your permissions.');
      } else if (error.response?.status === 404) {
        console.error('❌ Not found error');
        setError('API endpoint not found. Please contact support.');
      } else if (error.response?.status >= 500) {
        console.error('❌ Server error');
        setError('Server error. Please try again later.');
      } else {
        setError('Failed to fetch plants. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePlantClick = (plant) => {
    setSelectedPlant(plant);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedPlant(null);
  };

  const discoverDevices = async () => {
    try {
      setDiscoveringDevices(true);
      const token = await auth.currentUser.getIdToken();
      const response = await axios.get(getApiUrl('/api/discover-devices'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      setDevices(response.data.devices);
      setShowDeviceDialog(true);
    } catch (error) {
      console.error('Error discovering devices:', error);
      setSnackbar({
        open: true,
        message: 'Failed to discover devices. Make sure your ESP32 is connected to the same network.',
        severity: 'error'
      });
    } finally {
      setDiscoveringDevices(false);
    }
  };

  const connectToDevice = async (device) => {
    try {
      setConnectingDevice(true);
      const token = await auth.currentUser.getIdToken();
      
      const response = await axios.post(getApiUrl(`/api/plants/${selectedPlant.id}/connect-device`), {
        deviceIP: device.ip,
        devicePort: device.port
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      setSnackbar({
        open: true,
        message: `Successfully connected to ${device.name}! Your plant is now being monitored.`,
        severity: 'success'
      });
      
      setShowDeviceDialog(false);
      setDialogOpen(false);
      
      // Refresh plants list to show updated connection status
      await fetchPlants();
    } catch (error) {
      console.error('Error connecting to device:', error);
      setSnackbar({
        open: true,
        message: error.response?.data?.details || 'Failed to connect to device. Please try again.',
        severity: 'error'
      });
    } finally {
      setConnectingDevice(false);
    }
  };

  const disconnectDevice = async (plantId) => {
    try {
      setDisconnectingDevice(true);
      const token = await auth.currentUser.getIdToken();
      
      await axios.post(getApiUrl(`/api/plants/${plantId}/disconnect-device`), {}, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      setSnackbar({
        open: true,
        message: 'Device disconnected successfully.',
        severity: 'success'
      });
      
      // Refresh plants list to show updated connection status
      await fetchPlants();
    } catch (error) {
      console.error('Error disconnecting device:', error);
      setSnackbar({
        open: true,
        message: 'Failed to disconnect device. Please try again.',
        severity: 'error'
      });
    } finally {
      setDisconnectingDevice(false);
    }
  };

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleDeleteClick = (plant, event) => {
    event.stopPropagation(); // Prevent opening the plant details dialog
    setPlantToDelete(plant);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!plantToDelete) return;

    try {
      setDeletingPlant(true);
      const token = await auth.currentUser.getIdToken();
      
      await axios.delete(getApiUrl(`/api/plants/${plantToDelete.id}`), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      setSnackbar({
        open: true,
        message: `${plantToDelete.species} has been deleted successfully.`,
        severity: 'success'
      });
      
      setDeleteDialogOpen(false);
      setPlantToDelete(null);
      
      // Refresh plants list
      await fetchPlants();
    } catch (error) {
      console.error('Error deleting plant:', error);
      setSnackbar({
        open: true,
        message: error.response?.data?.error || 'Failed to delete plant. Please try again.',
        severity: 'error'
      });
    } finally {
      setDeletingPlant(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setPlantToDelete(null);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    let date;
    if (timestamp.toDate) {
      // Firestore timestamp
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      // Firestore timestamp object
      date = new Date(timestamp.seconds * 1000);
    } else if (timestamp instanceof Date) {
      // JavaScript Date object
      date = timestamp;
    } else {
      // String or number timestamp
      date = new Date(timestamp);
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Unknown';
    }
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography
        variant="h4"
        gutterBottom
        component={motion.h2}
        initial={{ opacity: 0, x: -32 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        My Plants
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
          <br />
          <span style={{ fontSize: '0.9em', color: '#ffb4b4' }}>
            (See browser console for technical details)
          </span>
        </Alert>
      )}

      {plants.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No plants found
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Start by identifying your first plant!
          </Typography>
        </Box>
      ) : (
        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate="show"
        >
          <Grid container spacing={3}>
            {plants.map((plant) => (
              <Grid item xs={12} sm={6} md={4} key={plant.id}>
                <motion.div
                  variants={cardVariants}
                  whileHover={{ scale: 1.03, boxShadow: '0 8px 32px 0 rgba(0,0,0,0.24)' }}
                  transition={{ type: 'spring', stiffness: 300 }}
                  style={{ height: '100%' }}
                >
                  <Card 
                    sx={{ 
                      height: '100%', 
                      cursor: 'pointer',
                      background: 'linear-gradient(135deg, #23272F 60%, #18181B 100%)',
                      color: '#fff',
                    }}
                    onClick={() => handlePlantClick(plant)}
                  >
                    <CardMedia
                      component="img"
                      height="200"
                      image={plant.imageUrl || '/placeholder-plant.jpg'}
                      alt={plant.species}
                      sx={{ objectFit: 'cover' }}
                    />
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Typography variant="h6" gutterBottom>
                          {plant.species}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {plant.deviceConnected && (
                            <Chip
                              icon={<CheckCircleIcon />}
                              label="Connected"
                              size="small"
                              sx={{
                                backgroundColor: '#00DC82',
                                color: '#fff',
                                '& .MuiChip-icon': {
                                  color: '#fff'
                                }
                              }}
                            />
                          )}
                          <IconButton
                            size="small"
                            onClick={(e) => handleDeleteClick(plant, e)}
                            sx={{
                              color: '#ff4444',
                              '&:hover': {
                                backgroundColor: 'rgba(255, 68, 68, 0.1)',
                              },
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {plant.commonName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Family: {plant.family}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        Added: {formatDate(plant.createdAt)}
                      </Typography>
                    </CardContent>
                  </Card>
                </motion.div>
              </Grid>
            ))}
          </Grid>
        </motion.div>
      )}

      {/* Plant Details Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        {selectedPlant && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  {selectedPlant.species}
                  <Typography variant="subtitle1" color="text.secondary">
                    {selectedPlant.commonName}
                  </Typography>
                  {/* Temporary debug: Display plant ID for Arduino configuration */}
                  <Typography variant="caption" color="primary" sx={{ display: 'block', mt: 1 }}>
                    🔧 Plant ID: {selectedPlant.id}
                  </Typography>
                </Box>
                {selectedPlant.deviceConnected && (
                  <Chip
                    icon={<CheckCircleIcon />}
                    label={`Connected to ${selectedPlant.deviceIP}`}
                    size="small"
                    sx={{
                      backgroundColor: '#00DC82',
                      color: '#fff',
                      '& .MuiChip-icon': {
                        color: '#fff'
                      }
                    }}
                  />
                )}
              </Box>
            </DialogTitle>
            <DialogContent>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <img
                    src={selectedPlant.imageUrl || '/placeholder-plant.jpg'}
                    alt={selectedPlant.species}
                    style={{ width: '100%', borderRadius: 8 }}
                  />
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Family: {selectedPlant.family}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Added: {formatDate(selectedPlant.createdAt)}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    Care Instructions
                  </Typography>
                  {selectedPlant.careInstructions ? (
                    <List>
                      <ListItem>
                        <ListItemText
                          primary="Watering"
                          secondary={selectedPlant.careInstructions.watering}
                        />
                      </ListItem>
                      <Divider />
                      <ListItem>
                        <ListItemText
                          primary="Light"
                          secondary={selectedPlant.careInstructions.light}
                        />
                      </ListItem>
                      <Divider />
                      <ListItem>
                        <ListItemText
                          primary="Temperature"
                          secondary={selectedPlant.careInstructions.temperature}
                        />
                      </ListItem>
                      <Divider />
                      <ListItem>
                        <ListItemText
                          primary="Humidity"
                          secondary={selectedPlant.careInstructions.humidity}
                        />
                      </ListItem>
                      <Divider />
                      <ListItem>
                        <ListItemText
                          primary="Soil"
                          secondary={selectedPlant.careInstructions.soil}
                        />
                      </ListItem>
                      <Divider />
                      <ListItem>
                        <ListItemText
                          primary="Fertilizer"
                          secondary={selectedPlant.careInstructions.fertilizer}
                        />
                      </ListItem>
                    </List>
                  ) : (
                    <Typography color="text.secondary">
                      No care instructions available for this plant.
                    </Typography>
                  )}
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDialog}>Close</Button>
              
              <Button
                variant="outlined"
                color="error"
                onClick={() => {
                  setPlantToDelete(selectedPlant);
                  setDeleteDialogOpen(true);
                  setDialogOpen(false);
                }}
                startIcon={<DeleteIcon />}
                sx={{
                  borderColor: '#ff4444',
                  color: '#ff4444',
                  '&:hover': {
                    borderColor: '#cc0000',
                    backgroundColor: 'rgba(255, 68, 68, 0.1)',
                  },
                }}
              >
                Delete Plant
              </Button>
              
              {selectedPlant.deviceConnected ? (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => disconnectDevice(selectedPlant.id)}
                  disabled={disconnectingDevice}
                  sx={{
                    borderColor: '#ff4444',
                    color: '#ff4444',
                    '&:hover': {
                      borderColor: '#cc0000',
                      backgroundColor: 'rgba(255, 68, 68, 0.1)',
                    },
                  }}
                >
                  {disconnectingDevice ? 'Disconnecting...' : 'Disconnect Device'}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  startIcon={<DeviceHubIcon />}
                  onClick={discoverDevices}
                  disabled={discoveringDevices || hasConnectedPlant}
                  sx={{
                    background: 'linear-gradient(90deg, #00DC82 0%, #00b86b 100%)',
                    color: '#fff',
                    '&:hover': {
                      background: 'linear-gradient(90deg, #00b86b 0%, #00DC82 100%)',
                    },
                    '&:disabled': {
                      background: 'rgba(255, 255, 255, 0.12)',
                      color: 'rgba(255, 255, 255, 0.38)',
                    },
                  }}
                >
                  {discoveringDevices ? 'Discovering...' : 
                   hasConnectedPlant ? 'Another plant is connected' : 'Connect to Device'}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Device Selection Dialog */}
      <Dialog
        open={showDeviceDialog}
        onClose={() => setShowDeviceDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WifiIcon />
            <Typography variant="h6">Available Devices</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {devices.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                No devices found on your network
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Make sure your ESP32 is:
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <CheckCircleIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText primary="Connected to the same WiFi network" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <CheckCircleIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText primary="Powered on and running the Plant It code" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <CheckCircleIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText primary="Listening for connections on port 8080" />
                </ListItem>
              </List>
            </Box>
          ) : (
            <List>
              {devices.map((device, index) => (
                <ListItem
                  key={index}
                  button
                  onClick={() => connectToDevice(device)}
                  disabled={connectingDevice}
                  sx={{
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 1,
                    mb: 1,
                    '&:hover': {
                      backgroundColor: 'rgba(0,220,130,0.1)',
                    },
                  }}
                >
                  <ListItemIcon>
                    <DeviceHubIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary={device.name}
                    secondary={`${device.ip}:${device.port}`}
                  />
                  {connectingDevice && (
                    <CircularProgress size={20} />
                  )}
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeviceDialog(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DeleteIcon color="error" />
            <Typography variant="h6">Delete Plant</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {plantToDelete && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="body1" gutterBottom>
                Are you sure you want to delete <strong>{plantToDelete.species}</strong>?
              </Typography>
              <Typography variant="body2" color="text.secondary">
                This action cannot be undone. The plant and its associated data will be permanently removed.
              </Typography>
              {plantToDelete.deviceConnected && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  This plant is currently connected to a device. Deleting it will also disconnect the device.
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deletingPlant}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            disabled={deletingPlant}
            startIcon={deletingPlant ? <CircularProgress size={16} /> : <DeleteIcon />}
            sx={{
              background: 'linear-gradient(90deg, #ff4444 0%, #cc0000 100%)',
              '&:hover': {
                background: 'linear-gradient(90deg, #cc0000 0%, #ff4444 100%)',
              },
            }}
          >
            {deletingPlant ? 'Deleting...' : 'Delete Plant'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default PlantList; 