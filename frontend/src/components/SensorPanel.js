import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import SensorsIcon from '@mui/icons-material/Sensors';
import axios from 'axios';
import { auth } from '../firebase';
import { apiUrl } from '../config';
import { track } from '../analytics';

function hoursAgo(iso) {
  if (!iso) return 'never';
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 48) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/**
 * Moisture reading + "Water now" for one plant. The API decides the mode:
 * "simulated" until a real ESP8266 has posted a reading, "hardware" after.
 * Both modes log watering events in Firestore, so the whole flow works with
 * no hardware at all.
 */
export default function SensorPanel({ plantId, onWatered }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [watering, setWatering] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser.getIdToken();
      const res = await axios.get(apiUrl(`/api/plants/${plantId}/device`), { headers: { Authorization: `Bearer ${token}` } });
      setState(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not read the sensor.');
    } finally {
      setLoading(false);
    }
  }, [plantId]);

  useEffect(() => {
    load();
  }, [load]);

  const waterNow = async () => {
    try {
      setWatering(true);
      setError(null);
      track('water_now_clicked', { mode: state?.mode || 'unknown' });
      const token = await auth.currentUser.getIdToken();
      const res = await axios.post(apiUrl(`/api/plants/${plantId}/water`), {}, { headers: { Authorization: `Bearer ${token}` } });
      setState({ mode: res.data.mode, reading: res.data.reading, events: res.data.events });
      if (onWatered) onWatered(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Watering failed. Please try again.');
    } finally {
      setWatering(false);
    }
  };

  if (loading && !state) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (!state) {
    return <Alert severity="error">{error || 'Sensor unavailable.'}</Alert>;
  }

  const { mode, reading, events } = state;
  const simulated = mode === 'simulated';
  const span = Math.max(1, reading.maxVWC - reading.minVWC);
  const pct = Math.max(0, Math.min(100, ((reading.currentVWC - reading.minVWC) / span) * 100));

  return (
    <Box data-testid="sensor-panel" sx={{ mt: 2, p: 2, borderRadius: 2, border: '1px solid #23272F', background: '#141517' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <SensorsIcon fontSize="small" color={simulated ? 'warning' : 'primary'} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Soil moisture</Typography>
        <Chip
          size="small"
          label={simulated ? 'Simulated sensor' : 'Live sensor (ESP8266)'}
          color={simulated ? 'warning' : 'primary'}
          variant="outlined"
        />
      </Box>

      {simulated && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          No ESP8266 has reported for this plant, so the reading is simulated: it starts full after watering and dries out over about 3 days.
          Thresholds and the watering log below are real and saved to your account.
        </Typography>
      )}

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography variant="h4" component="span" sx={{ fontWeight: 700, color: reading.needsWater ? '#FFC107' : '#00DC82' }}>
          {reading.currentVWC}%
        </Typography>
        <Typography variant="body2" color="text.secondary">
          water content · waters below {reading.wateringThreshold}% · last watered {hoursAgo(reading.lastWatered)}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={reading.needsWater ? 'warning' : 'primary'}
        sx={{ height: 10, borderRadius: 5, my: 1.5, backgroundColor: 'rgba(255,255,255,0.08)' }}
      />

      {reading.needsWater ? (
        <Alert severity="warning" sx={{ mb: 1.5 }}>The soil is below the watering threshold. Time to water.</Alert>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>The soil is moist enough for now.</Typography>
      )}
      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      <Button
        variant="contained"
        startIcon={watering ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <WaterDropIcon />}
        onClick={waterNow}
        disabled={watering}
        data-testid="water-now"
      >
        {watering ? 'Watering…' : 'Water now'}
      </Button>

      {events && events.length > 0 && (
        <List dense sx={{ mt: 1 }}>
          {events.slice(0, 5).map((ev) => (
            <ListItem key={ev.id} disableGutters>
              <ListItemText
                primary={`Watered (${ev.source})`}
                secondary={`${new Date(ev.at).toLocaleString()}${ev.vwcBefore !== undefined ? ` · ${ev.vwcBefore}% → ${ev.vwcAfter}%` : ''}`}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
