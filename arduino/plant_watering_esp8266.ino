#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ArduinoJson.h>

// —————— Configuration ——————
#define relayPin    D5    // GPIO14
#define moisturePin A0    // analog input

const int dry         = 452;  // dry calibration
const int wet         = 234;  // wet calibration
const int errorMargin = 2;    // debounce margin

// —————— LCD Setup ——————
LiquidCrystal_I2C lcd(0x27, 16, 2);

// —————— Wi-Fi credentials ——————
const char* ssid     = "YOUR WIFI SSID";
const char* password = "YOUR WIFI PASSWORD";

// —————— HTTP Server ——————
ESP8266WebServer server(8080);
const char* deviceName = "Plant Watering Device";

// —————— Plant thresholds ——————
struct PlantConfig {
  int minVWC;
  int maxVWC;
  int optimalVWC;
  bool configured;
} plantConfig = {0, 0, 0, false};

// —————— State ——————
bool   isWatering     = false;
bool   thresholdFlag  = false;
String statusMessage  = "";
bool   printedConfig  = false;  // print thresholds once

// — forward declarations —
void connectToWiFi();
void setupWebServer();
int  moisturePercentage(int raw);
void printMoistureAndStatus(int pct, const String &msg);

void setup() {
  Serial.begin(115200);

  // Relay off
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, LOW);

  // LCD splash
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0,0); lcd.print("Plant Watering");
  lcd.setCursor(0,1); lcd.print("System Ready!");
  delay(1500);
  lcd.clear();

  connectToWiFi();
  setupWebServer();
  server.begin();
  Serial.println("Server listening on port 8080");

  lcd.setCursor(0,0); lcd.print("Waiting for");
  lcd.setCursor(0,1); lcd.print("configuration");
}

void loop() {
  // Always listen for status/configure
  server.handleClient();

  if (!plantConfig.configured) return;

  // Print the thresholds once after config
  if (!printedConfig) {
    Serial.println(">>> Received plant config:");
    Serial.printf("minVWC=%d%%  maxVWC=%d%%  optimalVWC=%d%%\n\n",
                  plantConfig.minVWC,
                  plantConfig.maxVWC,
                  plantConfig.optimalVWC);
    printedConfig = true;
  }

  int raw = analogRead(moisturePin);
  int pct = moisturePercentage(raw);
  Serial.printf("Moisture: %d%%\n", pct);

  // Start watering
  if (pct < (plantConfig.minVWC + errorMargin)
      && !isWatering && !thresholdFlag) {
    digitalWrite(relayPin, HIGH);
    isWatering    = true;
    thresholdFlag = false;
    statusMessage = "Watering...     ";
  }
  // Stop watering
  if (isWatering && pct > (plantConfig.minVWC + errorMargin)) {
    digitalWrite(relayPin, LOW);
    isWatering    = false;
    thresholdFlag = true;
    statusMessage = "Moisture OK     ";
  }
  // Reset flag
  if (pct > (plantConfig.minVWC + 10)) thresholdFlag = false;

  printMoistureAndStatus(pct, statusMessage);
  delay(2000);
}

void connectToWiFi() {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("Connecting WiFi");
  lcd.setCursor(0,1); lcd.print(ssid);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }
  Serial.println("\nWiFi connected");
  Serial.print("IP = "); Serial.println(WiFi.localIP());

  lcd.clear();
  lcd.setCursor(0,0); lcd.print("WiFi Connected");
  lcd.setCursor(0,1); lcd.print(WiFi.localIP().toString());
  delay(2000);
  lcd.clear();
}

void setupWebServer() {
  // Device discovery endpoint
  server.on("/status", HTTP_GET, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json",
                String("{\"device\":\"") + deviceName +
                "\",\"configured\":" + (plantConfig.configured ? "true" : "false") +
                "}");
  });

  // Configure endpoint
  server.on("/configure", HTTP_POST, []() {
    if (!server.hasArg("plain")) {
      Serial.println("ERROR: No JSON data received");
      server.send(400, "application/json", "{\"error\":\"No JSON\"}");
      return;
    }
    
    String jsonData = server.arg("plain");
    Serial.println("=== RECEIVED CONFIGURATION ===");
    Serial.println("Raw JSON: " + jsonData);
    Serial.println("JSON length: " + String(jsonData.length()));
    
    DynamicJsonDocument doc(256);
    auto err = deserializeJson(doc, jsonData);
    if (err) {
      Serial.println("JSON parsing error: " + String(err.c_str()));
      server.send(400, "application/json", "{\"error\":\"Bad JSON\"}");
      return;
    }
    
    Serial.println("JSON parsed successfully");
    
    // Check if fields exist and get their values
    Serial.println("Checking JSON fields:");
    Serial.println("Has minVWC: " + String(doc.containsKey("minVWC") ? "YES" : "NO"));
    Serial.println("Has maxVWC: " + String(doc.containsKey("maxVWC") ? "YES" : "NO"));
    Serial.println("Has optimalVWC: " + String(doc.containsKey("optimalVWC") ? "YES" : "NO"));
    
    // Extract values with assignment (not bitwise OR)
    plantConfig.minVWC = doc["minVWC"];
    plantConfig.maxVWC = doc["maxVWC"];
    plantConfig.optimalVWC = doc["optimalVWC"];
    plantConfig.configured = true;
    
    Serial.println("=== PARSED VALUES ===");
    Serial.println("minVWC: " + String(plantConfig.minVWC));
    Serial.println("maxVWC: " + String(plantConfig.maxVWC));
    Serial.println("optimalVWC: " + String(plantConfig.optimalVWC));
    Serial.println("=====================");
    
    server.send(200, "application/json", "{\"success\":true}");
    Serial.println("→ Configuration received");
  });

  // CORS preflight
  server.on("/configure", HTTP_OPTIONS, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(200);
  });
}

int moisturePercentage(int raw) {
  int p = (dry - raw) * 100 / (dry - wet);
  return constrain(p, 0, 100);
}

void printMoistureAndStatus(int pct, const String &msg) {
  lcd.clear();
  lcd.setCursor(0,0);
  lcd.print("Moisture: ");
  lcd.print(pct);
  lcd.print("%");
  lcd.setCursor(0,1);
  lcd.print(msg);
} 