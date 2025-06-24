# Device Discovery Debugging Guide

If you're getting "No devices available" when trying to connect your ESP8266, follow these steps:

## 🔍 **Step 1: Check ESP8266 Serial Output**

1. Open Arduino IDE
2. Go to **Tools → Serial Monitor**
3. Set baud rate to **115200**
4. Reset your ESP8266

**Expected output:**
```
Connecting to WiFi...
Connected to WiFi
IP Address: 192.168.1.xxx
Device URL: http://192.168.1.xxx:8080
Web server started on port 8080
```

**If you don't see this, the issue is with WiFi connection or code upload.**

## 🔍 **Step 2: Test Device Manually**

1. Note the IP address from Serial Monitor
2. Open a web browser
3. Try these URLs (replace with your actual IP):

```
http://[YOUR_IP]:8080/test
http://[YOUR_IP]:8080/status
http://[YOUR_IP]:8080/
```

**Expected responses:**
- `/test` → "ESP8266 Plant Watering Device is working!"
- `/status` → JSON with device info
- `/` → HTML status page

## 🔍 **Step 3: Check Network Configuration**

The device discovery scans `192.168.1.100-200`. Verify your network:

1. **Check your computer's IP:**
   - Windows: `ipconfig` in Command Prompt
   - Mac/Linux: `ifconfig` in Terminal

2. **If your network is NOT 192.168.1.x:**
   - Your ESP8266 might be on a different subnet
   - Update the backend code to scan your network range

## 🔍 **Step 4: Check Backend Logs**

1. Look at your backend console output
2. You should see:
```
Starting device discovery...
Scanning IP range: 192.168.1.100 to 192.168.1.200
Waiting for all scans to complete...
Device discovery completed. Found X device(s)
```

3. **If you see errors**, they might indicate:
   - Network connectivity issues
   - Firewall blocking connections
   - ESP8266 not responding

## 🔍 **Step 5: Common Issues & Solutions**

### **Issue: ESP8266 not connecting to WiFi**
**Solution:**
- Check WiFi credentials in code
- Ensure WiFi network is 2.4GHz (ESP8266 doesn't support 5GHz)
- Try a different WiFi network

### **Issue: ESP8266 connects but web server doesn't work**
**Solution:**
- Check if port 8080 is available
- Try a different port (update both ESP8266 and backend)
- Restart ESP8266

### **Issue: Device found but connection fails**
**Solution:**
- Check if backend server is accessible from ESP8266
- Verify backend URL in configuration
- Check firewall settings

### **Issue: Network range mismatch**
**Solution:**
If your network is not `192.168.1.x`, update the backend:

```javascript
// In backend/src/index.js, change this line:
const networkPrefix = '192.168.1.'; // Change to your network

// For example, if your network is 192.168.0.x:
const networkPrefix = '192.168.0.';
```

## 🔍 **Step 6: Manual Network Scan**

If automatic discovery fails, try scanning manually:

1. **Find your ESP8266 IP** from Serial Monitor
2. **Test connectivity:**
   ```bash
   ping [ESP8266_IP]
   ```
3. **Test web server:**
   ```bash
   curl http://[ESP8266_IP]:8080/status
   ```

## 🔍 **Step 7: Alternative Connection Method**

If device discovery still fails, you can connect manually:

1. **Get your ESP8266 IP** from Serial Monitor
2. **Update the backend** to accept manual IP entry
3. **Or modify the frontend** to allow manual IP input

## 🔍 **Step 8: Debug Mode**

Add this to your ESP8266 code for more debugging:

```cpp
// Add this in setup() after server.begin():
Serial.println("=== DEBUG INFO ===");
Serial.print("WiFi SSID: ");
Serial.println(WiFi.SSID());
Serial.print("WiFi Signal: ");
Serial.println(WiFi.RSSI());
Serial.print("Local IP: ");
Serial.println(WiFi.localIP());
Serial.print("Gateway IP: ");
Serial.println(WiFi.gatewayIP());
Serial.print("Subnet Mask: ");
Serial.println(WiFi.subnetMask());
Serial.println("==================");
```

## 🔍 **Step 9: Network Troubleshooting Commands**

**Windows:**
```cmd
ipconfig /all
ping [ESP8266_IP]
telnet [ESP8266_IP] 8080
```

**Mac/Linux:**
```bash
ifconfig
ping [ESP8266_IP]
nc -zv [ESP8266_IP] 8080
```

## 🔍 **Step 10: Still Not Working?**

If none of the above works:

1. **Try a different port** (e.g., 80, 8081, 3000)
2. **Check if your router blocks device-to-device communication**
3. **Try connecting both devices to a mobile hotspot**
4. **Use a different ESP8266 board** if available
5. **Check if your ESP8266 has enough memory** (some boards have limited RAM)

## 📞 **Need More Help?**

If you're still having issues, please provide:
1. **Serial Monitor output** from ESP8266
2. **Backend console output** during device discovery
3. **Your network configuration** (IP range)
4. **ESP8266 board model** (NodeMCU, Wemos D1 Mini, etc.)
5. **Results of manual tests** (ping, curl, browser access) 