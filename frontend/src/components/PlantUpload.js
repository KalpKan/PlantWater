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
import { auth } from '../firebase';
import axios from 'axios';

const MIN_IMAGE_SIZE = 50 * 1024; // 50KB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

function PlantUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const onDrop = useCallback((acceptedFiles) => {
    setError(null);
    const file = acceptedFiles[0];
    
    // Validate file size
    if (file.size < MIN_IMAGE_SIZE) {
      setError(`Image is too small. Please upload an image that is at least ${MIN_IMAGE_SIZE/1024}KB in size.`);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError(`Image is too large. Please upload a smaller image (maximum ${MAX_IMAGE_SIZE/1024/1024}MB).`);
      return;
    }

    setFile(file);
    setPreview(URL.createObjectURL(file));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png']
    },
    maxFiles: 1
  });

  const handleIdentify = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('images', file);

      const token = await auth.currentUser.getIdToken();
      const response = await axios.post('/api/identify', formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.candidates && response.data.candidates.length > 0) {
        // Navigate to plant details page with the identification results and care instructions
        navigate('/plant-details', { 
          state: { 
            candidates: response.data.candidates,
            imageUrl: preview,
            careInstructions: response.data.careInstructions
          }
        });
      } else {
        setError('No plant species identified. Please try a different image.');
      }
    } catch (error) {
      console.error('Error identifying plant:', error);
      const errorMessage = error.response?.data?.details || error.response?.data?.error || 'Failed to identify plant. Please try again.';
      setError(errorMessage);
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

      <Typography variant="body2" color="text.secondary" paragraph>
        Image requirements:
        <ul>
          <li>Minimum size: {MIN_IMAGE_SIZE/1024}KB</li>
          <li>Maximum size: {MAX_IMAGE_SIZE/1024/1024}MB</li>
          <li>Supported formats: JPEG, JPG, PNG</li>
        </ul>
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box
            {...getRootProps()}
            sx={{
              border: '2px dashed',
              borderColor: isDragActive ? 'primary.main' : 'grey.300',
              borderRadius: 1,
              p: 3,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: isDragActive ? 'action.hover' : 'background.paper',
              '&:hover': {
                bgcolor: 'action.hover'
              }
            }}
          >
            <input {...getInputProps()} />
            {preview ? (
              <Box sx={{ mt: 2 }}>
                <img
                  src={preview}
                  alt="Preview"
                  style={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain' }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {file.name} ({(file.size / 1024).toFixed(1)}KB)
                </Typography>
              </Box>
            ) : (
              <Typography>
                {isDragActive
                  ? 'Drop the image here'
                  : 'Drag and drop an image here, or click to select'}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Button
        variant="contained"
        onClick={handleIdentify}
        disabled={!file || loading}
        fullWidth
      >
        {loading ? (
          <>
            <CircularProgress size={24} sx={{ mr: 1 }} />
            Identifying Plant...
          </>
        ) : (
          'Identify Plant'
        )}
      </Button>
    </Box>
  );
}

export default PlantUpload; 