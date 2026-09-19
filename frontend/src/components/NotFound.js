import React from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';

/** Rendered for any address the app does not know (was a blank page, TEST round 1 D4). */
function NotFound() {
  const { pathname } = useLocation();
  return (
    <Box sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Card>
        <CardContent>
          <Typography variant="h4" gutterBottom>That page does not exist</Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            There is nothing at <code data-testid="missing-path">{pathname}</code>. Plant It has a home page, My Plants and Add Plant.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button variant="contained" component={RouterLink} to="/">Home</Button>
            <Button variant="outlined" component={RouterLink} to="/plants">My Plants</Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default NotFound;
