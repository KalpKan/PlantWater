import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ListIcon from '@mui/icons-material/List';

function Home() {
  const navigate = useNavigate();

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Welcome to Plant It
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        Your personal plant identification and care assistant. Upload photos of plants to identify them and get detailed care instructions.
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Identify a New Plant
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Upload a photo of a plant to identify its species and get care recommendations.
              </Typography>
            </CardContent>
            <CardActions>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/add-plant')}
              >
                Add New Plant
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                View Your Plants
              </Typography>
              <Typography variant="body2" color="text.secondary">
                See all the plants you've identified and their care instructions.
              </Typography>
            </CardContent>
            <CardActions>
              <Button
                variant="outlined"
                startIcon={<ListIcon />}
                onClick={() => navigate('/plants')}
              >
                View Plants
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          How It Works
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  1. Upload
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Take a clear photo of your plant and upload it to our system.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  2. Identify
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Our AI will analyze the image and identify the plant species.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  3. Care
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Get detailed care instructions specific to your plant.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}

export default Home; 