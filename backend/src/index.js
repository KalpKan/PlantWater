require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const admin = require('firebase-admin');
const axios = require('axios');
const OpenAI = require('openai');
const FormData = require('form-data');
const sharp = require('sharp');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Test OpenAI connection on startup
async function testOpenAIConnection() {
  const models = ["gpt-4o-mini", "gpt-4o"]; // Try multiple models
  
  console.log('Testing OpenAI connection...');
  console.log('API Key present:', !!process.env.OPENAI_API_KEY);
  console.log('API Key starts with:', process.env.OPENAI_API_KEY?.substring(0, 7) + '...');
  
  for (const model of models) {
    try {
      console.log(`Testing with model: ${model}`);
      
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "user",
            content: "Hello, this is a test message."
          }
        ],
        max_tokens: 10
      });
      
      console.log(`OpenAI connection successful with ${model}!`);
      return; // Exit if successful
    } catch (error) {
      console.error(`OpenAI connection failed with ${model}:`, error.message);
      if (error.code === 'invalid_api_key') {
        console.error('Invalid API key. Please check your OPENAI_API_KEY environment variable.');
        return; // Don't try other models if API key is invalid
      } else if (error.code === 'model_not_found') {
        console.error(`Model ${model} not found. Trying next model...`);
        continue; // Try next model
      } else if (error.status === 429) {
        console.error('OpenAI quota exceeded. Using fallback care instructions until quota resets.');
        return; // Don't try other models if quota is exceeded
      } else {
        console.error(`OpenAI error with ${model}:`, error.message);
        continue; // Try next model
      }
    }
  }
  
  console.error('All OpenAI models failed. Using fallback care instructions.');
}

// Test connection on startup
testOpenAIConnection();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://plantit.yk'
  ],
  credentials: true
}));
app.use(express.json());

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Configure axios for Pl@ntNet API
const plantNetAxios = axios.create({
  baseURL: 'https://my-api.plantnet.org/v2',
  timeout: 30000, // 30 seconds
  maxContentLength: 5 * 1024 * 1024, // 5MB
  maxBodyLength: 5 * 1024 * 1024, // 5MB
  headers: {
    'accept': 'application/json'
  }
});

// Middleware to verify Firebase token
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Plant identification endpoint
app.post('/api/identify', 
  authenticateUser,
  upload.array('images', 5),
  async (req, res) => {
    try {
      const userId = req.user.uid;
      // Check identify count
      const userRef = admin.firestore().collection('users').doc(userId);
      const userDoc = await userRef.get();
      let identifyCount = userDoc.exists && userDoc.data().identifyCount ? userDoc.data().identifyCount : 0;
      if (identifyCount >= 2) {
        return res.status(403).json({ error: 'You have reached the maximum of 2 plant identification requests.' });
      }
      // Increment identify count
      await userRef.set({ identifyCount: identifyCount + 1 }, { merge: true });

      console.log('Files received:', req.files.map(f => f.filename));
      console.log('User ID:', userId);

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      // Process images with sharp
      const processedImages = await Promise.all(req.files.map(async (file) => {
        try {
          // Validate image size before processing
          if (file.size < 50000) { // 50KB minimum
            throw new Error('Image is too small. Please upload a larger image (minimum 50KB).');
          }
          if (file.size > 5000000) { // 5MB maximum
            throw new Error('Image is too large. Please upload a smaller image (maximum 5MB).');
          }

          // Get image metadata
          const metadata = await sharp(file.buffer).metadata();
          console.log('Original image metadata:', {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            size: file.size
          });

          // Calculate optimal dimensions while maintaining aspect ratio
          const maxDimension = 600; // Reduced from 800 to 600
          let targetWidth = metadata.width;
          let targetHeight = metadata.height;

          if (metadata.width > maxDimension || metadata.height > maxDimension) {
            if (metadata.width > metadata.height) {
              targetWidth = maxDimension;
              targetHeight = Math.round((metadata.height * maxDimension) / metadata.width);
            } else {
              targetHeight = maxDimension;
              targetWidth = Math.round((metadata.width * maxDimension) / metadata.height);
            }
          }

          // Process image with optimized settings
          const processedBuffer = await sharp(file.buffer)
            .resize(targetWidth, targetHeight, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({
              quality: 75, // Reduced from 80 to 75
              progressive: true,
              optimizeScans: true,
              chromaSubsampling: '4:2:0' // More aggressive compression
            })
            .toBuffer();

          console.log('Processed image size:', processedBuffer.length, 'bytes');
          return processedBuffer;
        } catch (error) {
          console.error('Error processing image:', error);
          throw new Error(`Failed to process image: ${error.message}`);
        }
      }));

      console.log('Calling Pl@ntNet API with processed images');

      // Create form data according to new API format
      const form = new FormData();
      
      // Add images
      processedImages.forEach((imageBuffer, index) => {
        form.append('images', imageBuffer, {
          filename: `plant_${index}.jpg`,
          contentType: 'image/jpeg'
        });
      });

      // Add organs parameter (auto-detect for each image)
      processedImages.forEach(() => {
        form.append('organs', 'auto');
      });

      console.log('Form data size:', form.getLengthSync(), 'bytes');
      console.log('Using Pl@ntNet API key:', process.env.PLANTNET_API_KEY?.substring(0, 5) + '...');

      // Implement retry logic with exponential backoff
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`Attempting Pl@ntNet API call (${4 - attempt} retries left)...`);
          
          const response = await plantNetAxios.post(`/identify/all?api-key=${process.env.PLANTNET_API_KEY}`, form, {
            headers: {
              ...form.getHeaders(),
              'accept': 'application/json'
            }
          });

          if (response.data && response.data.results) {
            // Get care instructions for the top match
            const topMatch = response.data.results[0];
            let careInstructions = null;
            
            try {
              careInstructions = await getPlantCareInstructions(topMatch.species.scientificNameWithoutAuthor);
            } catch (careError) {
              console.error('Error getting care instructions:', careError);
              // Continue without care instructions if OpenAI fails
            }

            // Save the plant to the user's account
            let savedPlant = null;
            try {
              const plantRef = admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('plants')
                .doc();

              const plantData = {
                id: plantRef.id,
                species: topMatch.species.scientificNameWithoutAuthor,
                commonName: topMatch.species.commonNames?.[0] || 'Unknown',
                family: topMatch.species.family?.scientificNameWithoutAuthor || 'Unknown',
                confidence: topMatch.score,
                imageUrl: null, // We'll store the image in Firebase Storage
                careInstructions: careInstructions,
                // Store moisture levels at root level for easy microcontroller access
                minVWC: careInstructions?.soilMoisture?.minVWC || 15,
                maxVWC: careInstructions?.soilMoisture?.maxVWC || 45,
                optimalVWC: careInstructions?.soilMoisture?.optimalVWC || 30,
                wateringThreshold: careInstructions?.soilMoisture?.wateringThreshold || 20,
                currentVWC: 0, // Will be updated by microcontroller
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastWatered: admin.firestore.FieldValue.serverTimestamp()
              };

              // Upload image to Firebase Storage
              if (processedImages.length > 0) {
                const imageFileName = `plants/${userId}/${plantRef.id}/plant_image.jpg`;
                const imageFile = admin.storage().bucket().file(imageFileName);
                
                await imageFile.save(processedImages[0], {
                  metadata: {
                    contentType: 'image/jpeg'
                  }
                });

                // Make the image publicly accessible
                await imageFile.makePublic();
                
                plantData.imageUrl = `https://storage.googleapis.com/${process.env.FIREBASE_STORAGE_BUCKET}/${imageFileName}`;
              }

              await plantRef.set(plantData);
              savedPlant = { ...plantData, id: plantRef.id };
              
              // Also store in Firebase Realtime Database for real-time updates
              try {
                const realtimeData = {
                  minVWC: plantData.minVWC,
                  maxVWC: plantData.maxVWC,
                  optimalVWC: plantData.optimalVWC,
                  wateringThreshold: plantData.wateringThreshold,
                  currentVWC: plantData.currentVWC,
                  lastWatered: new Date().toISOString(),
                  species: plantData.species,
                  commonName: plantData.commonName
                };
                
                await admin.database().ref(`plants/${userId}/${plantRef.id}`).set(realtimeData);
                console.log('Plant data also saved to Realtime Database');
              } catch (realtimeError) {
                console.error('Error saving to Realtime Database:', realtimeError);
                // Continue without Realtime Database if there's an error
              }
              
              console.log('Plant saved to user account:', plantRef.id);
            } catch (saveError) {
              console.error('Error saving plant:', saveError);
              // Continue without saving if there's an error
            }

            return res.json({
              candidates: response.data.results.map(result => ({
                species: result.species,
                score: result.score
              })),
              careInstructions: careInstructions,
              savedPlant: savedPlant
            });
          } else {
            throw new Error('Invalid response from Pl@ntNet API');
          }
        } catch (error) {
          lastError = error;
          console.error(`Pl@ntNet API call failed (${4 - attempt} retries left):`, {
            message: error.message,
            code: error.code,
            response: error.response?.data
          });

          if (attempt < 3) {
            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
            console.log(`Waiting ${delay/1000} seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      throw new Error(`Failed to identify plant after multiple attempts: ${lastError.message}`);
    } catch (error) {
      console.error('Detailed error in plant identification:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
        details: error.response?.data
      });
      res.status(500).json({ 
        error: 'Failed to identify plant',
        details: error.message
      });
    }
  }
);

// Function to get plant care instructions from OpenAI
async function getPlantCareInstructions(speciesName) {
  const models = ["gpt-4o-mini", "gpt-4o"]; // Try multiple models
  
  for (const model of models) {
    try {
      console.log(`Getting care instructions for ${speciesName} using ${model}...`);
      
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: `You are a plant care expert. Provide consistent, practical care instructions for plants. 
            Always return a JSON object with the following structure:
            {
              "watering": "Detailed watering instructions including frequency and method",
              "light": "Light requirements (direct, indirect, shade, etc.)",
              "temperature": "Temperature range in both Celsius and Fahrenheit",
              "humidity": "Humidity requirements",
              "soil": "Soil type and potting mix recommendations",
              "fertilizer": "Fertilizing schedule and type",
              "soilMoisture": {
                "minVWC": number (minimum volumetric water content percentage, 0-100),
                "maxVWC": number (maximum volumetric water content percentage, 0-100),
                "optimalVWC": number (optimal volumetric water content percentage, 0-100),
                "wateringThreshold": number (percentage when watering should be triggered)
              }
            }
            
            Guidelines:
            - minVWC: typically 10-20% for most plants
            - maxVWC: typically 40-60% for most plants  
            - optimalVWC: typically 25-35% for most plants
            - wateringThreshold: typically 15-25% for most plants
            - Be specific but concise
            - Use consistent terminology
            - Include practical tips`
          },
          {
            role: "user",
            content: `Provide care instructions for ${speciesName}. Focus on practical, actionable advice that a home gardener can follow.`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
      });

      const careData = JSON.parse(completion.choices[0].message.content);
      console.log(`Care instructions generated for ${speciesName} using ${model}`);
      return careData;
    } catch (error) {
      console.error(`Error with ${model}:`, error.message);
      
      // If this is the last model to try, use fallback
      if (model === models[models.length - 1]) {
        // Check if it's a quota error
        if (error.status === 429) {
          console.log('OpenAI quota exceeded. Using fallback care instructions.');
        }
        
        // Provide fallback care instructions if OpenAI fails
        console.log('Providing fallback care instructions for:', speciesName);
        return getFallbackCareInstructions(speciesName);
      }
      // Otherwise, continue to the next model
    }
  }
}

// Function to provide fallback care instructions based on plant type
function getFallbackCareInstructions(speciesName) {
  const plantName = speciesName.toLowerCase();
  
  // Basic care instructions that work for most plants
  let careInstructions = {
    watering: "Water when the top 1-2 inches of soil feels dry to the touch. Ensure good drainage and avoid overwatering.",
    light: "Provide bright, indirect light. Most plants thrive in filtered sunlight or near a bright window.",
    temperature: "Maintain temperatures between 18-24°C (65-75°F). Avoid cold drafts and extreme temperature fluctuations.",
    humidity: "Moderate humidity (40-60%) is ideal. Consider using a humidity tray or room humidifier.",
    soil: "Use well-draining potting mix with good aeration. A mix of peat moss, perlite, and compost works well.",
    fertilizer: "Feed with a balanced liquid fertilizer every 2-4 weeks during the growing season (spring to fall).",
    soilMoisture: {
      minVWC: 15,
      maxVWC: 45,
      optimalVWC: 30,
      wateringThreshold: 20
    }
  };

  // Customize based on plant type if we can identify it
  if (plantName.includes('succulent') || plantName.includes('cactus')) {
    careInstructions = {
      ...careInstructions,
      watering: "Water sparingly, only when soil is completely dry. Allow soil to dry out between waterings.",
      light: "Provide bright, direct light. These plants need full sun exposure.",
      soil: "Use well-draining cactus or succulent mix with sand and perlite.",
      soilMoisture: {
        minVWC: 5,
        maxVWC: 25,
        optimalVWC: 15,
        wateringThreshold: 8
      }
    };
  } else if (plantName.includes('fern') || plantName.includes('moss')) {
    careInstructions = {
      ...careInstructions,
      watering: "Keep soil consistently moist but not soggy. These plants prefer high humidity.",
      light: "Provide indirect or filtered light. Avoid direct sunlight.",
      humidity: "High humidity (60-80%) is essential. Mist regularly or use a humidifier.",
      soilMoisture: {
        minVWC: 25,
        maxVWC: 55,
        optimalVWC: 40,
        wateringThreshold: 30
      }
    };
  } else if (plantName.includes('orchid')) {
    careInstructions = {
      ...careInstructions,
      watering: "Water thoroughly when potting mix is nearly dry. Allow excess water to drain completely.",
      light: "Provide bright, indirect light. Avoid direct sun exposure.",
      humidity: "High humidity (50-70%) is important. Use humidity trays or mist regularly.",
      soil: "Use specialized orchid mix with bark, sphagnum moss, and perlite.",
      soilMoisture: {
        minVWC: 20,
        maxVWC: 50,
        optimalVWC: 35,
        wateringThreshold: 25
      }
    };
  }

  return careInstructions;
}

// Get care instructions for a specific plant
app.get('/api/plant/:species/care',
  authenticateUser,
  async (req, res) => {
    try {
      const speciesName = req.params.species;
      const careInstructions = await getPlantCareInstructions(speciesName);
      res.json(careInstructions);
    } catch (error) {
      console.error('Error fetching plant care:', error);
      res.status(500).json({ error: 'Failed to fetch plant care instructions' });
    }
  }
);

// Save plant data endpoint
app.post('/api/plants',
  authenticateUser,
  [
    body('species').isString().notEmpty(),
    body('imageUrl').isURL(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Get watering guidelines from OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a plant-care assistant. Return ONLY valid JSON with watering guidelines."
          },
          {
            role: "user",
            content: `Given species = '${req.body.species}', return JSON with minVWC, maxVWC, and waterIntervalDays.`
          }
        ],
        response_format: { type: "json_object" }
      });

      const guidelines = JSON.parse(completion.choices[0].message.content);

      // Save to Firestore
      const plantRef = admin.firestore()
        .collection('users')
        .doc(req.user.uid)
        .collection('plants')
        .doc();

      await plantRef.set({
        species: req.body.species,
        imageUrl: req.body.imageUrl,
        minVWC: guidelines.minVWC,
        maxVWC: guidelines.maxVWC,
        waterIntervalDays: guidelines.waterIntervalDays,
        lastWatered: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({ 
        id: plantRef.id,
        ...guidelines
      });
    } catch (error) {
      console.error('Error saving plant:', error);
      res.status(500).json({ error: 'Failed to save plant data' });
    }
  }
);

// Get user's plants
app.get('/api/plants',
  authenticateUser,
  async (req, res) => {
    try {
      const plantsSnapshot = await admin.firestore()
        .collection('users')
        .doc(req.user.uid)
        .collection('plants')
        .get();

      const plants = plantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      res.json(plants);
    } catch (error) {
      console.error('Error fetching plants:', error);
      res.status(500).json({ error: 'Failed to fetch plants' });
    }
  }
);

// Delete a plant
app.delete('/api/plants/:plantId',
  authenticateUser,
  async (req, res) => {
    try {
      const { plantId } = req.params;
      const userId = req.user.uid;

      // Check if plant exists
      const plantDoc = await admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('plants')
        .doc(plantId)
        .get();

      if (!plantDoc.exists) {
        return res.status(404).json({ error: 'Plant not found' });
      }

      // Delete from Firestore
      await admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('plants')
        .doc(plantId)
        .delete();

      // Delete from Realtime Database
      try {
        await admin.database().ref(`plants/${userId}/${plantId}`).remove();
      } catch (realtimeError) {
        console.error('Error deleting from Realtime Database:', realtimeError);
      }

      // Delete image from Storage if it exists
      try {
        const plantData = plantDoc.data();
        if (plantData.imageUrl) {
          const bucket = admin.storage().bucket();
          const fileName = plantData.imageUrl.split('/').pop().split('?')[0];
          await bucket.file(`plant-images/${userId}/${fileName}`).delete();
        }
      } catch (storageError) {
        console.error('Error deleting image from Storage:', storageError);
      }

      res.json({
        success: true,
        message: 'Plant deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting plant:', error);
      res.status(500).json({ error: 'Failed to delete plant' });
    }
  }
);

// Disconnect device from plant
app.post('/api/plants/:plantId/disconnect-device',
  authenticateUser,
  async (req, res) => {
    try {
      const { plantId } = req.params;
      const userId = req.user.uid;

      const plantRef = admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('plants')
        .doc(plantId);

      // Remove device connection information
      await plantRef.update({
        deviceConnected: false,
        deviceIP: admin.firestore.FieldValue.delete(),
        devicePort: admin.firestore.FieldValue.delete(),
        connectedAt: admin.firestore.FieldValue.delete()
      });

      // Also update Realtime Database
      try {
        await admin.database().ref(`plants/${userId}/${plantId}`).update({
          deviceConnected: false,
          deviceIP: null,
          devicePort: null,
          connectedAt: null
        });
      } catch (realtimeError) {
        console.error('Error updating Realtime Database:', realtimeError);
      }

      res.json({
        success: true,
        message: 'Device disconnected successfully'
      });
    } catch (error) {
      console.error('Error disconnecting device:', error);
      res.status(500).json({ error: 'Failed to disconnect device' });
    }
  }
);

// Update moisture level endpoint for microcontroller
app.post('/api/plants/:plantId/moisture',
  [
    body('currentVWC').isFloat({ min: 0, max: 100 }),
    body('userId').isString().notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { plantId } = req.params;
      const { currentVWC, userId, watered = false } = req.body;

      // Update Firestore
      const plantRef = admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('plants')
        .doc(plantId);

      const updateData = {
        currentVWC: currentVWC
      };

      if (watered) {
        updateData.lastWatered = admin.firestore.FieldValue.serverTimestamp();
      }

      await plantRef.update(updateData);

      // Update Realtime Database
      const realtimeRef = admin.database().ref(`plants/${userId}/${plantId}`);
      const realtimeUpdateData = {
        currentVWC: currentVWC
      };

      if (watered) {
        realtimeUpdateData.lastWatered = new Date().toISOString();
      }

      await realtimeRef.update(realtimeUpdateData);

      res.json({ 
        success: true, 
        message: 'Moisture level updated successfully',
        currentVWC: currentVWC
      });
    } catch (error) {
      console.error('Error updating moisture level:', error);
      res.status(500).json({ error: 'Failed to update moisture level' });
    }
  }
);

// Get plant moisture data for microcontroller
app.get('/api/plants/:plantId/moisture/:userId',
  async (req, res) => {
    try {
      const { plantId, userId } = req.params;

      // Get from Realtime Database (faster for real-time data)
      const realtimeRef = admin.database().ref(`plants/${userId}/${plantId}`);
      const snapshot = await realtimeRef.once('value');
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        res.json({
          minVWC: data.minVWC,
          maxVWC: data.maxVWC,
          optimalVWC: data.optimalVWC,
          wateringThreshold: data.wateringThreshold,
          currentVWC: data.currentVWC || 0,
          lastWatered: data.lastWatered,
          species: data.species,
          commonName: data.commonName
        });
      } else {
        // Fallback to Firestore if not in Realtime Database
        const plantDoc = await admin.firestore()
          .collection('users')
          .doc(userId)
          .collection('plants')
          .doc(plantId)
          .get();

        if (plantDoc.exists) {
          const plantData = plantDoc.data();
          res.json({
            minVWC: plantData.minVWC,
            maxVWC: plantData.maxVWC,
            optimalVWC: plantData.optimalVWC,
            wateringThreshold: plantData.wateringThreshold,
            currentVWC: plantData.currentVWC || 0,
            lastWatered: plantData.lastWatered?.toDate?.()?.toISOString(),
            species: plantData.species,
            commonName: plantData.commonName
          });
        } else {
          res.status(404).json({ error: 'Plant not found' });
        }
      }
    } catch (error) {
      console.error('Error fetching plant moisture data:', error);
      res.status(500).json({ error: 'Failed to fetch plant moisture data' });
    }
  }
);

// Send plant data to ESP32 device
app.post('/api/plants/:plantId/connect-device',
  authenticateUser,
  [
    body('deviceIP').isIP(),
    body('devicePort').isInt({ min: 1, max: 65535 }).optional(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { plantId } = req.params;
      const { deviceIP, devicePort = 8080 } = req.body;
      const userId = req.user.uid;

      // Get plant data
      const plantDoc = await admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('plants')
        .doc(plantId)
        .get();

      if (!plantDoc.exists) {
        return res.status(404).json({ error: 'Plant not found' });
      }

      const plantData = plantDoc.data();

      // Prepare simplified data to send to ESP8266
      // Extract moisture values from the correct location in the data structure
      const deviceData = {
        minVWC: plantData.careInstructions?.soilMoisture?.minVWC || plantData.minVWC || 15,
        maxVWC: plantData.careInstructions?.soilMoisture?.maxVWC || plantData.maxVWC || 45,
        optimalVWC: plantData.careInstructions?.soilMoisture?.optimalVWC || plantData.optimalVWC || 30
      };

      console.log('=== DEVICE CONNECTION DEBUG ===');
      console.log('Plant ID:', plantId);
      console.log('User ID:', userId);
      console.log('Raw plant data from database:', plantData);
      console.log('Care instructions:', plantData.careInstructions);
      console.log('Soil moisture data:', plantData.careInstructions?.soilMoisture);
      console.log('Moisture values being sent:', deviceData);
      console.log('minVWC type:', typeof deviceData.minVWC, 'value:', deviceData.minVWC);
      console.log('maxVWC type:', typeof deviceData.maxVWC, 'value:', deviceData.maxVWC);
      console.log('optimalVWC type:', typeof deviceData.optimalVWC, 'value:', deviceData.optimalVWC);
      console.log('================================');

      // Send data to ESP8266
      try {
        const response = await axios.post(`http://${deviceIP}:${devicePort}/configure`, deviceData, {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        });

        console.log(`Moisture values sent to ESP8266 at ${deviceIP}:${devicePort}`);
        console.log('Sent values:', deviceData);
        console.log('ESP8266 response:', response.data);
        
        // Store device connection information
        await plantDoc.ref.update({
          deviceConnected: true,
          deviceIP: deviceIP,
          devicePort: devicePort,
          connectedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Also update Realtime Database
        try {
          await admin.database().ref(`plants/${userId}/${plantId}`).update({
            deviceConnected: true,
            deviceIP: deviceIP,
            devicePort: devicePort,
            connectedAt: new Date().toISOString()
          });
        } catch (realtimeError) {
          console.error('Error updating Realtime Database:', realtimeError);
        }
        
        res.json({
          success: true,
          message: 'Device connected successfully',
          deviceIP: deviceIP,
          moistureValues: deviceData
        });
      } catch (deviceError) {
        console.error('Error connecting to ESP8266:', deviceError.message);
        console.error('Error details:', deviceError.response?.data);
        res.status(500).json({
          error: 'Failed to connect to device',
          details: 'Make sure the ESP8266 is connected to the same network and listening for connections'
        });
      }
    } catch (error) {
      console.error('Error connecting device:', error);
      res.status(500).json({ error: 'Failed to connect device' });
    }
  }
);

// Discover ESP8266 devices on local network
app.get('/api/discover-devices',
  authenticateUser,
  async (req, res) => {
    try {
      const devices = [];
      const networkPrefix = '192.168.86.'; // Updated to match user's network
      const targetIP = '192.168.86.62'; // Specific target IP
      
      console.log('Starting device discovery...');
      console.log('Target IP:', targetIP);
      console.log('Scanning entire subnet:', networkPrefix + '1 to', networkPrefix + '254');
      console.log('Using /status endpoint for device discovery');
      
      // Scan the entire subnet for ESP8266 devices
      const scanPromises = [];
      
      // First, try the specific target IP
      scanPromises.push(
        axios.get(`http://${targetIP}:8080/status`, {
          timeout: 1000, // Longer timeout for target IP
          headers: {
            'User-Agent': 'PlantIt-DeviceDiscovery/1.0'
          }
        }).then(response => {
          console.log(`Found ESP8266 device at target IP ${targetIP}:`, response.data);
          return {
            ip: targetIP,
            port: 8080,
            name: 'Plant Watering Device',
            status: 'available',
            deviceType: 'ESP8266-PlantWatering'
          };
        }).catch((error) => {
          console.log(`Target IP ${targetIP} not responding:`, error.message);
          return null;
        })
      );
      
      // Then scan the rest of the subnet
      for (let i = 1; i <= 254; i++) {
        const ip = `${networkPrefix}${i}`;
        // Skip the target IP since we already checked it
        if (ip === targetIP) continue;
        
        scanPromises.push(
          axios.get(`http://${ip}:8080/status`, {
            timeout: 500, // Shorter timeout for other IPs
            headers: {
              'User-Agent': 'PlantIt-DeviceDiscovery/1.0'
            }
          }).then(response => {
            console.log(`Found ESP8266 device at ${ip}:`, response.data);
            return {
              ip: ip,
              port: 8080,
              name: 'Plant Watering Device',
              status: 'available',
              deviceType: 'ESP8266-PlantWatering'
            };
          }).catch((error) => {
            // Don't log connection errors as they're expected for most IPs
            return null;
          })
        );
      }

      console.log('Waiting for all scans to complete...');
      const results = await Promise.allSettled(scanPromises);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          devices.push(result.value);
          console.log('Device found:', result.value);
        }
      });

      console.log(`Device discovery completed. Found ${devices.length} device(s)`);

      res.json({
        devices: devices,
        message: `Found ${devices.length} device(s) on the network`
      });
    } catch (error) {
      console.error('Error discovering devices:', error);
      res.status(500).json({ error: 'Failed to discover devices' });
    }
  }
);

// Test endpoint to verify Firebase Admin SDK
app.get('/api/test-firebase', async (req, res) => {
  try {
    const bucket = admin.storage().bucket();
    console.log('Firebase bucket name:', bucket.name);
    res.json({ 
      message: 'Firebase Admin SDK initialized successfully',
      bucketName: bucket.name
    });
  } catch (error) {
    console.error('Firebase Admin SDK test error:', error);
    res.status(500).json({ 
      error: 'Firebase Admin SDK initialization failed',
      details: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 