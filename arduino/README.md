# ESP32 Plant Watering Device Setup

This ESP32 code creates a web server that can receive plant configuration data from the Plant It web app.

## Features

- **Automatic Device Discovery**: ESP32 broadcasts its presence on the network
- **Web-based Configuration**: Receive plant data directly from the web app
- **Real-time Monitoring**: Continuously monitor soil moisture levels
- **Automatic Watering**: Trigger watering when moisture is below threshold
- **Status LED**: Visual feedback for device status

## Required Libraries

Install these libraries in Arduino IDE:

1. **WiFi** (built-in with ESP32)
2. **HTTPClient** (built-in with ESP32)
3. **ArduinoJson** by Benoit Blanchon
4. **WebServer** (built-in with ESP32)

## Setup Instructions

### 1. Hardware Setup
- Connect soil moisture sensor to GPIO 34
- Connect relay module to GPIO 25
- Built-in LED on GPIO 2 will show status

### 2. Code Configuration
Update these variables in `plant_watering.ino`:
```cpp
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
```

### 3. Upload Code
1. Select your ESP32 board in Arduino IDE
2. Upload the code
3. Open Serial Monitor (115200 baud)

### 4. Device Status Indicators

**LED Patterns:**
- **3 quick blinks**: Device ready and waiting for configuration
- **Slow blinking**: Waiting for plant configuration
- **5 quick blinks**: Plant configured successfully
- **Solid ON**: Actively monitoring plant

**Serial Output:**
```
Connecting to WiFi...
Connected to WiFi
IP Address: 192.168.1.100
Device URL: http://192.168.1.100:8080
Web server started on port 8080
```

### 5. Web App Connection

1. **Power on your ESP32** and ensure it's connected to WiFi
2. **Open the Plant It web app** on the same network
3. **Click on a plant** in your plant list
4. **Click "Connect to Device"** button
5. **Select your ESP32** from the discovered devices
6. **Device will automatically configure** with plant data

### 6. Testing the Connection

You can test the device manually by visiting:
```
http://[ESP32_IP]:8080
```

Example: `http://192.168.1.100:8080`

This will show a simple status page with device information.

## API Endpoints

The ESP32 provides these endpoints:

- `GET /status` - Device discovery endpoint
- `POST /configure` - Receive plant configuration
- `GET /` - Status page

## Troubleshooting

### Device Not Found
1. Ensure ESP32 is on the same WiFi network as your computer
2. Check that the web server started successfully
3. Verify the IP address in Serial Monitor
4. Try accessing the device URL directly in browser

### Connection Failed
1. Check that your backend server is running
2. Verify the backend URL is accessible from ESP32
3. Check Serial Monitor for error messages

### Moisture Sensor Issues
1. Calibrate the sensor values in `readMoistureSensor()`
2. Check wiring connections
3. Test with known moisture levels

## Network Requirements

- ESP32 and computer must be on the same WiFi network
- Network must allow device-to-device communication
- Port 8080 must be available on ESP32
- Backend server must be accessible from ESP32

## Security Notes

- This implementation is for local network use only
- No authentication is required for device configuration
- Consider adding authentication for production use
- Device discovery scans common IP ranges (192.168.1.100-200) 