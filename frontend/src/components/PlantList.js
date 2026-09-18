import React, { useState, useEffect, useCallback } from 'react';
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
  Snackbar,
  IconButton,
  TextField,
} from '@mui/material';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import SensorsIcon from '@mui/icons-material/Sensors';
import { auth } from '../firebase';
import { apiUrl } from '../config';
import SensorPanel from './SensorPanel';

const gridVariants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const cardVariants = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } };

const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#1f2a24"/><text x="200" y="108" font-family="Inter,Arial" font-size="18" fill="#00DC82" text-anchor="middle">no photo</text></svg>'
);

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

async function authHeaders() {
  const token = await auth.currentUser.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

function PlantList() {
  const navigate = useNavigate();
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [plantToDelete, setPlantToDelete] = useState(null);
  const [deletingPlant, setDeletingPlant] = useState(false);
  const [deviceDialogPlant, setDeviceDialogPlant] = useState(null);
  const [deviceIP, setDeviceIP] = useState('');
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState(null);

  const notify = (message, severity = 'success') => setSnackbar({ open: true, message, severity });

  const fetchPlants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(apiUrl('/api/plants'), { headers: await authHeaders() });
      setPlants(response.data);
    } catch (err) {
      const status = err.response?.status;
      if (err.code === 'ERR_NETWORK') setError('Network error. Please check your connection and try again.');
      else if (status === 401) setError('Your sign-in expired. Please sign in again.');
      else if (status === 503) setError('The plant service is not configured yet. Please try again later.');
      else setError(err.response?.data?.error || 'Failed to load your plants. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlants();
  }, [fetchPlants]);

  const handleDeleteConfirm = async () => {
    if (!plantToDelete) return;
    try {
      setDeletingPlant(true);
      await axios.delete(apiUrl(`/api/plants/${plantToDelete.id}`), { headers: await authHeaders() });
      notify(`${plantToDelete.species} has been deleted.`);
      setPlantToDelete(null);
      setSelectedPlant(null);
      await fetchPlants();
    } catch (err) {
      notify(err.response?.data?.error || 'Failed to delete plant. Please try again.', 'error');
    } finally {
      setDeletingPlant(false);
    }
  };

  const connectDevice = async () => {
    if (!deviceDialogPlant) return;
    try {
      setDeviceBusy(true);
      setDeviceMessage(null);
      await axios.post(
        apiUrl(`/api/plants/${deviceDialogPlant.id}/connect-device`),
        { deviceIP: deviceIP.trim(), devicePort: 8080 },
        { headers: await authHeaders() }
      );
      notify('ESP8266 configured. It will report moisture readings from now on.');
      setDeviceDialogPlant(null);
      setSelectedPlant(null);
      await fetchPlants();
    } catch (err) {
      setDeviceMessage(err.response?.data?.details || err.response?.data?.error || 'Could not reach the device.');
    } finally {
      setDeviceBusy(false);
    }
  };

  const disconnectDevice = async (plantId) => {
    try {
      await axios.post(apiUrl(`/api/plants/${plantId}/disconnect-device`), {}, { headers: await authHeaders() });
      notify('Device disconnected. The plant is back on the simulated sensor.');
      setSelectedPlant(null);
      await fetchPlants();
    } catch (err) {
      notify('Failed to disconnect the device.', 'error');
    }
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
        </Alert>
      )}

      {plants.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No plants yet
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Identify your first plant from a photo. No hardware needed: every plant gets a simulated moisture sensor you can water.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/add-plant')}>Add a plant</Button>
        </Box>
      ) : (
        <motion.div variants={gridVariants} initial="hidden" animate="show">
          <Grid container spacing={3}>
            {plants.map((plant) => (
              <Grid item xs={12} sm={6} md={4} key={plant.id}>
                <motion.div variants={cardVariants} whileHover={{ scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }} style={{ height: '100%' }}>
                  <Card
                    data-testid="plant-card"
                    sx={{ height: '100%', cursor: 'pointer', background: 'linear-gradient(135deg, #23272F 60%, #18181B 100%)', color: '#fff' }}
                    onClick={() => setSelectedPlant(plant)}
                  >
                    <CardMedia component="img" height="200" image={plant.imageUrl || PLACEHOLDER} alt={plant.species} sx={{ objectFit: 'cover' }} />
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
                        <Typography variant="h6" gutterBottom sx={{ fontStyle: 'italic' }}>
                          {plant.species}
                        </Typography>
                        <IconButton
                          size="small"
                          aria-label="delete plant"
                          onClick={(e) => { e.stopPropagation(); setPlantToDelete(plant); }}
                          sx={{ color: '#ff4444' }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      <Typography variant="body2" color="text.secondary">{plant.commonName}</Typography>
                      <Typography variant="body2" color="text.secondary">Family: {plant.family}</Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                        <Chip
                          size="small"
                          icon={<SensorsIcon />}
                          label={plant.sensorMode === 'hardware' ? 'Live sensor' : 'Simulated sensor'}
                          color={plant.sensorMode === 'hardware' ? 'primary' : 'warning'}
                          variant="outlined"
                        />
                        {plant.demo && <Chip size="small" label="Demo result" color="info" variant="outlined" />}
                        {plant.deviceConnected && <Chip size="small" icon={<CheckCircleIcon />} label="ESP8266 configured" color="primary" />}
                      </Box>
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

      {/* Plant dialog: sensor + care */}
      <Dialog open={Boolean(selectedPlant)} onClose={() => setSelectedPlant(null)} maxWidth="md" fullWidth>
        {selectedPlant && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
                <Box>
                  <span style={{ fontStyle: 'italic' }}>{selectedPlant.species}</span>
                  <Typography variant="subtitle1" color="text.secondary">{selectedPlant.commonName}</Typography>
                </Box>
                {selectedPlant.deviceConnected && (
                  <Chip icon={<CheckCircleIcon />} label={`ESP8266 at ${selectedPlant.deviceIP}`} size="small" color="primary" />
                )}
              </Box>
            </DialogTitle>
            <DialogContent>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <img src={selectedPlant.imageUrl || PLACEHOLDER} alt={selectedPlant.species} style={{ width: '100%', borderRadius: 8 }} />
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">Family: {selectedPlant.family}</Typography>
                    <Typography variant="body2" color="text.secondary">Added: {formatDate(selectedPlant.createdAt)}</Typography>
                  </Box>
                  <SensorPanel plantId={selectedPlant.id} onWatered={() => fetchPlants()} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>Care Instructions</Typography>
                  {selectedPlant.careInstructions ? (
                    <List>
                      {[
                        ['Watering', selectedPlant.careInstructions.watering],
                        ['Light', selectedPlant.careInstructions.light],
                        ['Temperature', selectedPlant.careInstructions.temperature],
                        ['Humidity', selectedPlant.careInstructions.humidity],
                        ['Soil', selectedPlant.careInstructions.soil],
                        ['Fertilizer', selectedPlant.careInstructions.fertilizer],
                      ].map(([label, text], i) => (
                        <React.Fragment key={label}>
                          {i > 0 && <Divider />}
                          <ListItem>
                            <ListItemText primary={label} secondary={text} />
                          </ListItem>
                        </React.Fragment>
                      ))}
                    </List>
                  ) : (
                    <Typography color="text.secondary">No care instructions available for this plant.</Typography>
                  )}
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button onClick={() => setSelectedPlant(null)}>Close</Button>
              <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setPlantToDelete(selectedPlant)}>
                Delete Plant
              </Button>
              {selectedPlant.deviceConnected ? (
                <Button variant="outlined" color="warning" onClick={() => disconnectDevice(selectedPlant.id)}>
                  Disconnect ESP8266
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  startIcon={<DeviceHubIcon />}
                  onClick={() => { setDeviceDialogPlant(selectedPlant); setDeviceMessage(null); }}
                >
                  Connect ESP8266 (hardware required)
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Hardware dialog */}
      <Dialog open={Boolean(deviceDialogPlant)} onClose={() => setDeviceDialogPlant(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Connect an ESP8266 (hardware required)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This step needs the physical watering device from the <code>arduino/</code> folder, powered on and on the same
            network as the API. The hosted API runs in the cloud, so it cannot see devices on your home Wi-Fi; run the API
            locally (<code>npm run dev:api</code>) to connect real hardware. Without a device, the simulated sensor keeps working.
          </Typography>
          <TextField
            label="ESP8266 IP address"
            placeholder="192.168.1.50"
            value={deviceIP}
            onChange={(e) => setDeviceIP(e.target.value)}
            fullWidth
            size="small"
          />
          {deviceMessage && <Alert severity="warning" sx={{ mt: 2 }}>{deviceMessage}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeviceDialogPlant(null)}>Cancel</Button>
          <Button variant="contained" onClick={connectDevice} disabled={deviceBusy || !deviceIP.trim()}>
            {deviceBusy ? 'Connecting…' : 'Send plant settings to device'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={Boolean(plantToDelete)} onClose={() => !deletingPlant && setPlantToDelete(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete plant</DialogTitle>
        <DialogContent>
          {plantToDelete && (
            <Typography variant="body1">
              Delete <strong>{plantToDelete.species}</strong>? Its photo, care guide and watering log are removed. This cannot be undone.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlantToDelete(null)} disabled={deletingPlant}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm} disabled={deletingPlant} startIcon={deletingPlant ? <CircularProgress size={16} /> : <DeleteIcon />}>
            {deletingPlant ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default PlantList;
