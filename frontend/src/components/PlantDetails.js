import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip,
} from '@mui/material';
import axios from 'axios';
import { auth } from '../firebase';
import { apiUrl } from '../config';

const DEMO_REASONS = {
  no_plantnet_key: 'No Pl@ntNet key is configured on this deployment, so the species comes from a bundled list of common houseplants.',
  plantnet_daily_limit: 'Today\'s Pl@ntNet identification budget is used up, so the species comes from a bundled list of common houseplants.',
  plantnet_error: 'Pl@ntNet did not answer, so the species comes from a bundled list of common houseplants.',
};

const CARE_SOURCES = {
  bundled: 'Care guide from the built-in plant library.',
  openai: 'Care guide written by OpenAI for this species.',
  generic: 'General houseplant care (no species-specific guide was available).',
};

function PlantDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [plantDetails, setPlantDetails] = useState(null);

  const { candidates, imageUrl, careInstructions, careSource, savedPlant, demo, reason } = location.state || {};

  useEffect(() => {
    if (!candidates || candidates.length === 0) {
      navigate('/add-plant');
      return;
    }
    if (careInstructions) {
      setPlantDetails(careInstructions);
      return;
    }
    const fetchPlantDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await auth.currentUser.getIdToken();
        const species = encodeURIComponent(candidates[0].species.scientificNameWithoutAuthor);
        const response = await axios.get(apiUrl(`/api/plant/${species}/care`), { headers: { Authorization: `Bearer ${token}` } });
        setPlantDetails(response.data);
      } catch (err) {
        setError('Failed to fetch plant details. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchPlantDetails();
  }, [candidates, navigate, careInstructions]);

  if (!candidates || candidates.length === 0) return null;

  const topMatch = candidates[0];
  const rows = plantDetails
    ? [
      ['Watering', plantDetails.watering],
      ['Light', plantDetails.light],
      ['Temperature', plantDetails.temperature],
      ['Humidity', plantDetails.humidity],
      ['Soil', plantDetails.soil],
      ['Fertilizer', plantDetails.fertilizer],
    ]
    : [];

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Plant Identification Results
      </Typography>

      {savedPlant && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Saved to your collection. Open "My Plants" to see its soil moisture and water it.
        </Alert>
      )}
      {demo && (
        <Alert severity="info" sx={{ mb: 2 }} data-testid="demo-notice">
          <strong>Demo result.</strong> {DEMO_REASONS[reason] || 'The species comes from a bundled list of common houseplants.'}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="h6">Identified Plant</Typography>
                {demo && <Chip size="small" label="Demo result" color="info" variant="outlined" />}
              </Box>
              {imageUrl && (
                <img src={imageUrl} alt="Uploaded plant" style={{ width: '100%', borderRadius: 8, marginBottom: 16 }} />
              )}
              <Typography variant="h5" gutterBottom data-testid="species">
                {topMatch.species.scientificNameWithoutAuthor}
              </Typography>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                Common name: {topMatch.species.commonNames?.[0] || 'Unknown'}
              </Typography>
              {topMatch.species.family && (
                <Typography variant="body2" color="text.secondary">
                  Family: {topMatch.species.family.scientificNameWithoutAuthor}
                </Typography>
              )}
              {typeof topMatch.score === 'number' && (
                <Typography variant="body2" color="text.secondary">
                  Confidence: {Math.round(topMatch.score * 100)}%
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Care Instructions
              </Typography>
              {(careSource || plantDetails?.source) && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {CARE_SOURCES[careSource || plantDetails?.source] || ''}
                </Typography>
              )}
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : plantDetails ? (
                <List data-testid="care-list">
                  {rows.map(([label, text], i) => (
                    <React.Fragment key={label}>
                      {i > 0 && <Divider />}
                      <ListItem>
                        <ListItemText primary={label} secondary={text} />
                      </ListItem>
                    </React.Fragment>
                  ))}
                  {plantDetails.soilMoisture && (
                    <>
                      <Divider />
                      <ListItem>
                        <ListItemText
                          primary="Soil moisture targets"
                          secondary={`Keep between ${plantDetails.soilMoisture.minVWC}% and ${plantDetails.soilMoisture.maxVWC}% water content; water below ${plantDetails.soilMoisture.wateringThreshold}%.`}
                        />
                      </ListItem>
                    </>
                  )}
                </List>
              ) : (
                <Typography color="text.secondary">No care instructions available for this plant.</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={() => navigate('/plants')}>
          View My Plants
        </Button>
        <Button variant="outlined" onClick={() => navigate('/add-plant')}>
          Identify Another Plant
        </Button>
        <Button variant="outlined" onClick={() => navigate('/')}>
          Back to Home
        </Button>
      </Box>
    </Box>
  );
}

export default PlantDetails;
