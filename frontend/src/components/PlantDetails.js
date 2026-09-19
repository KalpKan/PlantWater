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
import { openAiKeyHeaders } from '../openaiKey';

const DEMO_REASONS = {
  no_plantnet_key: 'No Pl@ntNet key is configured on this deployment, so the species comes from a bundled list of common houseplants.',
  plantnet_daily_limit: 'Today\'s Pl@ntNet identification budget is used up, so the species comes from a bundled list of common houseplants.',
  plantnet_error: 'Pl@ntNet did not answer, so the species comes from a bundled list of common houseplants.',
};

const CARE_SOURCES = {
  bundled: 'Care guide from the built-in plant library.',
  openai: 'Care guide written by OpenAI for this species, using the key saved in your browser.',
  generic: 'General houseplant care (no species-specific guide is bundled; add your own OpenAI key under "Add Plant" for one).',
  // After a rejected visitor key the caption must not contradict the warning above it (D12).
  genericAfterKeyError: 'General houseplant care (your OpenAI key was rejected, see above, and no species-specific guide is bundled).',
};

/** Below this top-1 score the page warns and lists the runner-up candidates (matches the API's LOW_CONFIDENCE_SCORE). */
export const LOW_CONFIDENCE_SCORE = 0.3;
const pct = (score) => `${Math.round(score * 100)} %`;

const OPENAI_ERRORS = {
  invalid_key: 'OpenAI rejected the key saved in your browser (401). Check it under "Add Plant".',
  rate_limited_or_no_credit: 'OpenAI answered 429 for your key (rate limit or no credit on that account).',
  forbidden: 'OpenAI refused the request for your key (403).',
  timeout: 'OpenAI did not answer in time.',
  error: 'OpenAI did not answer.',
};

function PlantDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [plantDetails, setPlantDetails] = useState(null);

  const { candidates, imageUrl, careInstructions, careSource, careReason, openaiError, savedPlant, demo, reason, lowConfidence: lowFlag } = location.state || {};

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
        const response = await axios.get(apiUrl(`/api/plant/${species}/care`), { headers: { Authorization: `Bearer ${token}`, ...openAiKeyHeaders() } });
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
  const lowConfidence = lowFlag === true || (typeof topMatch.score === 'number' && topMatch.score < LOW_CONFIDENCE_SCORE);
  const runnersUp = candidates.slice(1, 4);
  const keyRejected = careReason === 'openai_error' || plantDetails?.reason === 'openai_error';
  const sourceKey = careSource || plantDetails?.source;
  const sourceText = sourceKey === 'generic' && keyRejected ? CARE_SOURCES.genericAfterKeyError : CARE_SOURCES[sourceKey] || '';
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
      <Typography variant="h4" component="h1" gutterBottom>
        Plant Identification Results
      </Typography>

      {lowConfidence && (
        <Alert severity="warning" sx={{ mb: 2 }} data-testid="low-confidence-notice">
          <strong>Low confidence.</strong> Pl@ntNet is only {typeof topMatch.score === 'number' ? pct(topMatch.score) : 'slightly'} sure this is{' '}
          <em>{topMatch.species.scientificNameWithoutAuthor}</em>. Check the other matches below or try a clearer photo of a single leaf or flower.
          {savedPlant ? ' It was saved with a "Low confidence" mark; delete it from My Plants if it is wrong.' : ''}
        </Alert>
      )}
      {savedPlant && !lowConfidence && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Saved to your collection. Open "My Plants" to see its soil moisture and water it.
        </Alert>
      )}
      {demo && (
        <Alert severity="info" sx={{ mb: 2 }} data-testid="demo-notice">
          <strong>Demo result.</strong> {DEMO_REASONS[reason] || 'The species comes from a bundled list of common houseplants.'}
        </Alert>
      )}
      {keyRejected && (
        <Alert severity="warning" sx={{ mb: 2 }} data-testid="openai-error-notice">
          {OPENAI_ERRORS[openaiError || plantDetails?.openaiError] || OPENAI_ERRORS.error} The built-in care guide is shown instead.
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
                <Typography variant="h6" component="h2">Identified Plant</Typography>
                {demo && <Chip size="small" label="Demo result" color="info" variant="outlined" />}
              </Box>
              {imageUrl && (
                <img src={imageUrl} alt="Uploaded plant" style={{ width: '100%', borderRadius: 8, marginBottom: 16 }} />
              )}
              <Typography variant="h5" component="p" gutterBottom data-testid="species">
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
                <Typography variant="body2" color={lowConfidence ? 'warning.main' : 'text.secondary'}>
                  Confidence: {pct(topMatch.score)}{lowConfidence ? ' (low)' : ''}
                </Typography>
              )}
              {lowConfidence && runnersUp.length > 0 && (
                <Box sx={{ mt: 2 }} data-testid="other-candidates">
                  <Typography variant="subtitle2" gutterBottom>Other matches Pl@ntNet suggested</Typography>
                  <List dense disablePadding>
                    {runnersUp.map((c) => (
                      <ListItem key={c.species.scientificNameWithoutAuthor} disableGutters>
                        <ListItemText
                          primary={<em>{c.species.scientificNameWithoutAuthor}</em>}
                          secondary={`${c.species.commonNames?.[0] ? `${c.species.commonNames[0]} · ` : ''}${typeof c.score === 'number' ? pct(c.score) : ''}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" component="h2" gutterBottom>
                Care Instructions
              </Typography>
              {sourceKey && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }} data-testid="care-source">
                  {sourceText}
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
