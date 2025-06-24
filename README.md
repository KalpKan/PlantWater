# Plant It - AI-Powered Plant Watering System

An intelligent plant care system that automatically identifies plants and manages their watering schedule using AI and IoT technology.

## Features

- Plant species identification using Pl@ntNet API
- AI-generated watering guidelines using OpenAI
- Real-time soil moisture monitoring
- Automatic watering control
- Web dashboard for plant management
- Firebase integration for data storage and real-time updates
- Firebase Realtime Database for microcontroller communication

## Project Structure

```
plant-it/
├── backend/           # Node.js Express server
├── frontend/         # React web application
├── arduino/          # ESP32/Arduino code
└── firebase/         # Firebase configuration and rules
```

## Prerequisites

- Node.js (v16 or higher)
- Firebase account
- Pl@ntNet API key
- OpenAI API key
- ESP32 or Arduino with soil moisture sensor and relay

## Environment Variables

Create a `.env` file in the backend directory with:

```env
PLANTNET_API_KEY=your_plantnet_api_key
OPENAI_API_KEY=your_openai_api_key
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY=your_firebase_private_key
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
```

## Firebase Setup

1. Create a new Firebase project
2. Enable the following services:
   - **Firestore Database** - for storing plant data and care instructions
   - **Storage** - for storing plant images
   - **Realtime Database** - for real-time moisture level updates
   - **Authentication** - for user management

3. Deploy Firebase security rules:
   ```bash
   # Deploy Firestore rules
   firebase deploy --only firestore:rules
   
   # Deploy Realtime Database rules
   firebase deploy --only database
   
   # Deploy Storage rules
   firebase deploy --only storage
   ```

## Data Storage Structure

### Firestore Database
```
users/{userId}/plants/{plantId}/
├── id: string
├── species: string
├── commonName: string
├── family: string
├── confidence: number
├── imageUrl: string
├── careInstructions: object
├── minVWC: number (moisture threshold)
├── maxVWC: number (moisture threshold)
├── optimalVWC: number (moisture threshold)
├── wateringThreshold: number (moisture threshold)
├── currentVWC: number (updated by microcontroller)
├── createdAt: timestamp
└── lastWatered: timestamp
```

### Realtime Database
```
plants/{userId}/{plantId}/
├── minVWC: number
├── maxVWC: number
├── optimalVWC: number
├── wateringThreshold: number
├── currentVWC: number
├── lastWatered: string (ISO timestamp)
├── species: string
└── commonName: string
```

## Setup Instructions

1. Clone the repository
2. Install dependencies:
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

3. Set up Firebase:
   - Create a new Firebase project
   - Enable Firestore, Storage, and Realtime Database
   - Add the Firebase configuration to `frontend/src/firebase.js`
   - Deploy Firebase security rules

4. Deploy the backend:
   ```bash
   cd backend
   npm run deploy
   ```

5. Deploy the frontend:
   ```bash
   cd frontend
   npm run build
   npm run deploy
   ```

6. Upload the Arduino code to your ESP32/Arduino device:
   - Update the WiFi credentials
   - Set your backend URL
   - Set your Firebase user ID and plant ID

## API Endpoints

- `POST /api/identify`: Upload plant photos for species identification
- `GET /api/plants`: Get list of user's plants
- `POST /api/plants`: Add new plant
- `PUT /api/plants/:id`: Update plant data
- `DELETE /api/plants/:id`: Remove plant
- `POST /api/plants/:plantId/moisture`: Update moisture level (microcontroller)
- `GET /api/plants/:plantId/moisture/:userId`: Get plant moisture data (microcontroller)

## Microcontroller Integration

The Arduino/ESP32 code communicates with the backend to:
1. Retrieve plant moisture thresholds from the database
2. Monitor soil moisture levels
3. Trigger watering when moisture is below threshold
4. Update current moisture levels in real-time

### Required Arduino Libraries
- WiFi.h
- HTTPClient.h
- ArduinoJson.h

### Configuration
Update these variables in the Arduino code:
- `ssid` and `password`: Your WiFi credentials
- `backendUrl`: Your backend server URL
- `userId`: Your Firebase user ID
- `plantId`: The specific plant ID to monitor

## Firebase Security Rules

See `firebase/firestore.rules` and `firebase/realtime-database.rules.json` for the complete security configuration.

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

MIT License - see LICENSE file for details 