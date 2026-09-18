import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';

/**
 * A plant's photo, or an honest placeholder when there is none.
 *
 * Plants added before 2026-09-18 had their photo in Firebase Storage, which this project no longer
 * uses (it needs the paid Blaze plan; every download now answers 403). The API reports those as
 * photoStatus: "unavailable" with imageUrl: null, and any other URL that fails to load lands on the
 * same placeholder through onError, so the page never shows a broken-image icon.
 */
export const UNAVAILABLE_MESSAGE = 'Photo no longer available';
export const UNAVAILABLE_HINT = 'It was kept in Firebase Storage, which this app no longer uses. Add the plant again from a photo to restore it.';

function Placeholder({ height, unavailable, dialog }) {
  return (
    <Box
      data-testid={unavailable ? 'photo-unavailable' : 'photo-none'}
      role="img"
      aria-label={unavailable ? `${UNAVAILABLE_MESSAGE}. ${UNAVAILABLE_HINT}` : 'No photo'}
      sx={{
        height,
        minHeight: dialog ? 220 : undefined,
        width: '100%',
        borderRadius: dialog ? 2 : 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5,
        px: 2,
        textAlign: 'center',
        background: 'linear-gradient(135deg, #1f2a24 0%, #18181B 100%)',
        color: '#8fa89b',
        boxSizing: 'border-box',
      }}
    >
      <LocalFloristIcon sx={{ fontSize: 40, color: '#00DC82', opacity: 0.7 }} />
      <Typography variant="subtitle2" sx={{ color: '#e6efe9' }}>
        {unavailable ? UNAVAILABLE_MESSAGE : 'No photo'}
      </Typography>
      {unavailable && (
        <Typography variant="caption" sx={{ color: '#8fa89b', maxWidth: 320 }}>
          {UNAVAILABLE_HINT}
        </Typography>
      )}
    </Box>
  );
}

export default function PlantPhoto({ plant, height = 200, dialog = false }) {
  const url = plant && plant.imageUrl ? plant.imageUrl : null;
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]); // a new URL gets a fresh chance to load

  const unavailable = failed || (plant && plant.photoStatus === 'unavailable');
  if (!url || unavailable) {
    return <Placeholder height={dialog ? 'auto' : height} unavailable={Boolean(unavailable)} dialog={dialog} />;
  }
  return (
    <Box
      component="img"
      src={url}
      alt={plant.species || 'plant'}
      onError={() => setFailed(true)}
      sx={dialog
        ? { width: '100%', borderRadius: 2, display: 'block' }
        : { width: '100%', height, objectFit: 'cover', display: 'block' }}
    />
  );
}
