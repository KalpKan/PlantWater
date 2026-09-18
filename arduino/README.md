# ESP32 Plant Watering Device Setup

> **Hardware is optional.** The web app works without any device: until an ESP8266/ESP32 reports a reading, each plant shows a clearly labelled *Simulated sensor* with a realistic moisture curve and a working *Water now* button. The routes and buttons below are labelled "hardware required" in the app and only matter once you build the device.
>
> **Not implemented yet:** the firmware receives its configuration (moisture targets, `userId`, `plantId`, `deviceSecret`) but does not send readings back to the app (`POST /api/plants/:id/moisture` with the `X-Device-Secret` header is documented below and tested on the server, but no code in `plant_watering_esp8266.ino` calls it). So the web app never leaves *Simulated sensor* for a real device today. That reporting loop is scheduled for the hardening pass (T5.b).

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

### Reporting readings to the app

`POST /configure` now also carries `userId`, `plantId` and a per-plant `deviceSecret` (a fresh one on every "Connect ESP8266"). The firmware stores them. When you extend it to report soil readings, call the app's API with that secret in a header, otherwise the API answers `403`:

```
POST https://plantit.kalpkan.com/api/plants/<plantId>/moisture
X-Device-Secret: <deviceSecret>
Content-Type: application/json

{"userId": "<userId>", "currentVWC": 31.5, "watered": false}
```

`GET /api/plants/<plantId>/moisture/<userId>` (the plant's targets) needs the same header. A plant that was never connected from the app, or a wrong secret, is refused; "Disconnect ESP8266" in the app clears the secret.
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