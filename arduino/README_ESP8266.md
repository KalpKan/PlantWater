# ESP8266 Plant Watering Device Setup

This ESP8266 code creates a web server that can receive plant configuration data from the Plant It web app.

## Key Differences from ESP32

### Hardware Differences:
- **Single ADC pin**: ESP8266 only has one analog pin (A0)
- **Different GPIO numbering**: Uses D1, D2, etc. instead of GPIO numbers
- **Inverted LED**: Built-in LED works opposite to ESP32 (HIGH = OFF)
- **10-bit ADC**: Reads 0-1023 instead of 0-4095

### Software Differences:
- Uses `ESP8266WiFi.h` instead of `WiFi.h`
- Uses `ESP8266HTTPClient.h` instead of `HTTPClient.h`
- Uses `ESP8266WebServer.h` instead of `WebServer.h`

## Features

- **Automatic Device Discovery**: ESP8266 broadcasts its presence on the network
- **Web-based Configuration**: Receive plant data directly from the web app
- **Real-time Monitoring**: Continuously monitor soil moisture levels
- **Automatic Watering**: Trigger watering when moisture is below threshold
- **Status LED**: Visual feedback for device status

## Required Libraries

Install these libraries in Arduino IDE:

1. **ESP8266WiFi** (built-in with ESP8266 board package)
2. **ESP8266HTTPClient** (built-in with ESP8266 board package)
3. **ESP8266WebServer** (built-in with ESP8266 board package)
4. **ArduinoJson** by Benoit Blanchon

## Setup Instructions

### 1. Hardware Setup
- Connect soil moisture sensor to **A0** (only analog pin available)
- Connect relay module to **D1** (GPIO5)
- Built-in LED on **LED_BUILTIN** will show status

### 2. Arduino IDE Configuration
1. Go to **File → Preferences**
2. Add this URL to "Additional Board Manager URLs":
   ```
   http://arduino.esp8266.com/stable/package_esp8266com_index.json
   ```
3. Go to **Tools → Board → Boards Manager**
4. Search for "ESP8266" and install "ESP8266 by ESP8266 Community"
5. Select your ESP8266 board (NodeMCU 1.0, Wemos D1 Mini, etc.)

### 3. Code Configuration
Update these variables in `plant_watering_esp8266.ino`:
```cpp
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
```

### 4. Upload Code
1. Select your ESP8266 board in Arduino IDE
2. Set correct port (usually shows as "USB Serial Port")
3. Upload the code
4. Open Serial Monitor (115200 baud)

### 5. Device Status Indicators

**LED Patterns (ESP8266 LED is inverted):**
- **3 quick blinks**: Device ready and waiting for configuration
- **Slow blinking**: Waiting for plant configuration
- **5 quick blinks**: Plant configured successfully
- **Solid OFF**: Actively monitoring plant (LED stays off)

**Serial Output:**
```
Connecting to WiFi...
Connected to WiFi
IP Address: 192.168.1.100
Device URL: http://192.168.1.100:8080
Web server started on port 8080
```

### 6. Web App Connection

1. **Power on your ESP8266** and ensure it's connected to WiFi
2. **Open the Plant It web app** on the same network
3. **Click on a plant** in your plant list
4. **Click "Connect to Device"** button
5. **Select your ESP8266** from the discovered devices
6. **Device will automatically configure** with plant data

### 7. Testing the Connection

You can test the device manually by visiting:
```
http://[ESP8266_IP]:8080
```

Example: `http://192.168.1.100:8080`

This will show a simple status page with device information.

## Pin Mapping

| Function | ESP8266 Pin | Arduino Pin Name |
|----------|-------------|------------------|
| Moisture Sensor | A0 | A0 |
| Relay Module | D1 | GPIO5 |
| Status LED | LED_BUILTIN | GPIO2 |

## Moisture Sensor Calibration

ESP8266 has a 10-bit ADC (0-1023 range). You may need to calibrate the sensor:

```cpp
// In readMoistureSensor() function, adjust these values:
int moisturePercentage = map(rawValue, 0, 1023, 0, 100);

// For better calibration, test with known moisture levels:
// Dry soil: ~300-400
// Moist soil: ~600-700
// Wet soil: ~800-900
```

## Troubleshooting

### Device Not Found
1. Ensure ESP8266 is on the same WiFi network as your computer
2. Check that the web server started successfully
3. Verify the IP address in Serial Monitor
4. Try accessing the device URL directly in browser

### Connection Failed
1. Check that your backend server is running
2. Verify the backend URL is accessible from ESP8266
3. Check Serial Monitor for error messages

### Moisture Sensor Issues
1. ESP8266 only has one analog pin (A0) - make sure sensor is connected there
2. Calibrate the sensor values in `readMoistureSensor()`
3. Check wiring connections
4. Test with known moisture levels

### Upload Issues
1. Make sure you've selected the correct ESP8266 board
2. Try pressing the reset button on ESP8266 before uploading
3. Check that the correct port is selected
4. Some ESP8266 boards need to be in "flash mode" (hold FLASH button while uploading)

## Network Requirements

- ESP8266 and computer must be on the same WiFi network
- Network must allow device-to-device communication
- Port 8080 must be available on ESP8266
- Backend server must be accessible from ESP8266

## Performance Notes

- ESP8266 has less memory than ESP32
- Web server performance may be slightly slower
- Single analog pin limits sensor options
- Still fully capable for plant watering application

## Security Notes

- This implementation is for local network use only
- No authentication is required for device configuration
- Consider adding authentication for production use
- Device discovery scans common IP ranges (192.168.1.100-200) 