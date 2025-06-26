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
import { auth } from '../firebase';
import axios from 'axios';

function PlantDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [plantDetails, setPlantDetails] = useState(null);

  // Helper function to get the correct API URL
  const getApiUrl = (endpoint) => {
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://backend--plant-it-5e2fc.us-central1.hosted.app'
      : '';
    return `${baseUrl}${endpoint}`;
  };

  const { candidates, imageUrl, careInstructions, savedPlant } = location.state || {};

  useEffect(() => {
    if (!candidates || candidates.length === 0) {
      navigate('/add-plant');
      return;
    }

    // If we don't have care instructions from the identification, fetch them
    if (!careInstructions) {
      const fetchPlantDetails = async () => {
        setLoading(true);
        setError(null);

        try {
          const token = await auth.currentUser.getIdToken();
          const response = await axios.get(getApiUrl(`/api/plant/${candidates[0].species.scientificNameWithoutAuthor}/care`), {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          setPlantDetails(response.data);
        } catch (error) {
          console.error('Error fetching plant details:', error);
          setError('Failed to fetch plant details. Please try again.');
        } finally {
          setLoading(false);
        }
      };

      fetchPlantDetails();
    } else {
      setPlantDetails(careInstructions);
    }
  }, [candidates, navigate, careInstructions]);

  if (!candidates || candidates.length === 0) {
    return null;
  }

  const topMatch = candidates[0];

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Plant Identification Results
      </Typography>

      {savedPlant && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Plant successfully saved to your collection! You can view it in "My Plants".
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
              <Typography variant="h6" gutterBottom>
                Identified Plant
              </Typography>
              <img
                src={imageUrl}
                alt="Uploaded plant"
                style={{ width: '100%', borderRadius: 8, marginBottom: 16 }}
              />
              <Typography variant="h5" gutterBottom>
                {topMatch.species.scientificNameWithoutAuthor}
              </Typography>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                Common Name: {topMatch.species.commonNames?.[0] || 'Unknown'}
              </Typography>
              {topMatch.species.family && (
                <Typography variant="body2" color="text.secondary">
                  Family: {topMatch.species.family.scientificNameWithoutAuthor}
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
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : plantDetails ? (
                <Box>
                  <List>
                    <ListItem>
                      <ListItemText
                        primary="Watering"
                        secondary={plantDetails.watering}
                      />
                    </ListItem>
                    <Divider />
                    <ListItem>
                      <ListItemText
                        primary="Light"
                        secondary={plantDetails.light}
                      />
                    </ListItem>
                    <Divider />
                    <ListItem>
                      <ListItemText
                        primary="Temperature"
                        secondary={plantDetails.temperature}
                      />
                    </ListItem>
                    <Divider />
                    <ListItem>
                      <ListItemText
                        primary="Humidity"
                        secondary={plantDetails.humidity}
                      />
                    </ListItem>
                    <Divider />
                    <ListItem>
                      <ListItemText
                        primary="Soil"
                        secondary={plantDetails.soil}
                      />
                    </ListItem>
                    <Divider />
                    <ListItem>
                      <ListItemText
                        primary="Fertilizer"
                        secondary={plantDetails.fertilizer}
                      />
                    </ListItem>
                  </List>
                </Box>
              ) : (
                <Typography color="text.secondary">
                  No care instructions available for this plant.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
        <Button
          variant="contained"
          onClick={() => navigate('/add-plant')}
        >
          Identify Another Plant
        </Button>
        <Button
          variant="outlined"
          onClick={() => navigate('/plants')}
        >
          View My Plants
        </Button>
        <Button
          variant="outlined"
          onClick={() => navigate('/')}
        >
          Back to Home
        </Button>
      </Box>
    </Box>
  );
}

export default PlantDetails; 