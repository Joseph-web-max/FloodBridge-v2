/*
  FloodBridge ESP32 Water-Level Demonstrator
  Board: ESP32 DevKit / ESP32-WROOM compatible
  Sensor: JSN-SR04T ultrasonic probe + controller board

  IMPORTANT:
  - Bench / controlled test prototype only. Do not mount over a live river,
    bridge edge, culvert or flood channel without a qualified installation team,
    safe-work plan, engineered mount and site-specific risk assessment.
  - The probe/controller variants vary. Confirm your exact sensor datasheet.
  - JSN-SR04T modules commonly require 5 V. ECHO may be 5 V logic:
    use a resistor divider/level shifter before the 3.3 V ESP32 GPIO.
  - STAGE DATUM MUST BE SURVEYED. Leave SENSOR_HEIGHT_ABOVE_DATUM_M = -1.0
    until a qualified person measures and documents the sensor position relative
    to the local gauge datum. A stage reading without a known datum is omitted.
  - This device measures distance to the water surface. It does NOT measure flow,
    discharge, flood depth over a road, structural safety, or route passability.
  - JSON telemetry is unverified sensor data. Compare with a physical staff gauge.

  Required app transport:
  - USB Serial JSONL at 115200 baud
  - BLE Nordic UART Service (NUS), notify TX characteristic
*/

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

static const int TRIG_PIN = 18;
static const int ECHO_PIN = 19;

// Set these values for the actual monitored site and inventory.
static const char* DEVICE_ID = "FB-ESP32-001";
static const char* SITE_ID = "UNASSIGNED-SITE";

// Set to the surveyed vertical distance (metres) from the ultrasonic sensor
// reference plane to the local staff-gauge zero. Leave -1 until surveyed.
static const float SENSOR_HEIGHT_ABOVE_DATUM_M = -1.0f;

static const unsigned long SAMPLE_INTERVAL_MS = 30000;
static const unsigned long ECHO_TIMEOUT_US = 30000;
static const float MIN_VALID_DISTANCE_CM = 25.0f;
static const float MAX_VALID_DISTANCE_CM = 450.0f;

static const char* BLE_DEVICE_NAME = "FloodBridge-Node";
static BLECharacteristic* txCharacteristic = nullptr;
static bool bleConnected = false;

static const char* SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static const char* RX_UUID      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
static const char* TX_UUID      = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* server) override {
    bleConnected = true;
  }
  void onDisconnect(BLEServer* server) override {
    bleConnected = false;
    BLEDevice::startAdvertising();
  }
};

float singleDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(3);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, ECHO_TIMEOUT_US);
  if (duration == 0) return NAN;

  // Approximate speed of sound at ordinary ambient conditions.
  return (duration * 0.0343f) / 2.0f;
}

float medianDistanceCm() {
  float values[5];
  int count = 0;

  for (int i = 0; i < 5; i++) {
    float d = singleDistanceCm();
    if (!isnan(d) && d >= MIN_VALID_DISTANCE_CM && d <= MAX_VALID_DISTANCE_CM) {
      values[count++] = d;
    }
    delay(80);
  }

  if (count < 3) return NAN;

  // Small fixed-size insertion sort.
  for (int i = 1; i < count; i++) {
    float key = values[i];
    int j = i - 1;
    while (j >= 0 && values[j] > key) {
      values[j + 1] = values[j];
      j--;
    }
    values[j + 1] = key;
  }
  return values[count / 2];
}

void notifyJsonLine(const String& line) {
  if (!bleConnected || txCharacteristic == nullptr) return;

  // Safe conservative payload chunks for the default BLE ATT MTU.
  const size_t chunkSize = 20;
  for (size_t i = 0; i < line.length(); i += chunkSize) {
    String part = line.substring(i, min((int)line.length(), (int)(i + chunkSize)));
    txCharacteristic->setValue((uint8_t*)part.c_str(), part.length());
    txCharacteristic->notify();
    delay(15);
  }
}

void emitReading() {
  float distance = medianDistanceCm();
  bool valid = !isnan(distance);
  bool datumConfigured = SENSOR_HEIGHT_ABOVE_DATUM_M >= 0.0f;

  String json = "{";
  json += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  json += "\"site_id\":\"" + String(SITE_ID) + "\",";
  json += "\"distance_cm\":";
  json += valid ? String(distance, 1) : "null";
  json += ",\"stage_m\":";
  if (valid && datumConfigured) {
    float stage = SENSOR_HEIGHT_ABOVE_DATUM_M - (distance / 100.0f);
    json += String(stage, 3);
  } else {
    json += "null";
  }
  json += ",\"sensor_height_above_datum_m\":";
  json += datumConfigured ? String(SENSOR_HEIGHT_ABOVE_DATUM_M, 3) : "null";
  json += ",\"health\":\"";
  json += valid ? "ok" : "no_valid_echo";
  json += "\",\"ts_ms\":";
  json += String(millis());
  json += ",\"unit\":\"metres_from_local_datum\"";
  json += "}\n";

  Serial.print(json);
  notifyJsonLine(json);
}

void setupBle() {
  BLEDevice::init(BLE_DEVICE_NAME);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* service = server->createService(SERVICE_UUID);

  txCharacteristic = service->createCharacteristic(
    TX_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  txCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic* rx = service->createCharacteristic(
    RX_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  (void)rx; // Reserved for future configuration; not used in this prototype.

  service->start();
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->start();
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  setupBle();

  Serial.println("{\"device_status\":\"ready\",\"device_id\":\"FB-ESP32-001\"}");
}

void loop() {
  static unsigned long lastSample = 0;
  unsigned long now = millis();

  if (now - lastSample >= SAMPLE_INTERVAL_MS) {
    lastSample = now;
    emitReading();
  }
  delay(10);
}
