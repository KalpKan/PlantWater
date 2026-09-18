import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import axios from 'axios';
import { auth } from '../firebase';
import { apiUrl } from '../config';
import { track } from '../analytics';

const MIN_IMAGE_SIZE = 10 * 1024; // 10 KB
const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4 MB (the API accepts up to 4.5 MB)

function PlantUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const onDrop = useCallback((acceptedFiles) => {
    setError(null);
    const picked = acceptedFiles[0];
    if (!picked) return;
    if (picked.size < MIN_IMAGE_SIZE) {
      setError(`That image is too small (under ${MIN_IMAGE_SIZE / 1024} KB). Please use a clearer photo.`);
      return;
    }
    if (picked.size > MAX_IMAGE_SIZE) {
      setError(`That image is too large. Please use one under ${MAX_IMAGE_SIZE / 1024 / 1024} MB.`);
      return;
    }
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
    track('plant_photo_uploaded', { bytes: picked.size, type: picked.type });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    maxFiles: 1,
  });

  const handleIdentify = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const token = await auth.currentUser.getIdToken();
      const response = await axios.post(apiUrl('/api/identify'), formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      if (data.candidates && data.candidates.length > 0) {
        track('plant_identified', { demo: Boolean(data.demo), care_source: data.careSource || 'unknown' });
        navigate('/plant-details', {
          state: {
            candidates: data.candidates,
            imageUrl: data.savedPlant?.imageUrl || preview,
            careInstructions: data.careInstructions,
            careSource: data.careSource,
            demo: data.demo,
            reason: data.reason,
            savedPlant: data.savedPlant,
          },
        });
      } else {
        setError('No plant species identified. Please try a different image.');
      }
    } catch (err) {
      const message = err.response?.data?.details || err.response?.data?.error || 'Failed to identify plant. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Add New Plant
      </Typography>

      <Typography variant="body1" color="text.secondary" paragraph>
        Upload a clear photo of your plant to identify its species and get care recommendations.
      </Typography>

      <Typography variant="body2" color="text.secondary" component="div" sx={{ mb: 2 }}>
        JPEG, PNG or WebP, between {MIN_IMAGE_SIZE / 1024} KB and {MAX_IMAGE_SIZE / 1024 / 1024} MB. One plant per photo works best.
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box
            {...getRootProps()}
            data-testid="dropzone"
            sx={{
              border: '2px dashed',
              borderColor: isDragActive ? 'primary.main' : 'grey.700',
              borderRadius: 1,
              p: 3,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: isDragActive ? 'action.hover' : 'background.paper',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <input {...getInputProps()} data-testid="file-input" />
            {preview ? (
              <Box sx={{ mt: 2 }}>
                <img src={preview} alt="Preview" style={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain' }} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </Typography>
              </Box>
            ) : (
              <Typography>{isDragActive ? 'Drop the image here' : 'Drag and drop an image here, or click to select'}</Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Button variant="contained" onClick={handleIdentify} disabled={!file || loading} fullWidth data-testid="identify">
        {loading ? (
          <>
            <CircularProgress size={24} sx={{ mr: 1, color: '#fff' }} />
            Identifying plant…
          </>
        ) : (
          'Identify Plant'
        )}
      </Button>
    </Box>
  );
}

export default PlantUpload;
