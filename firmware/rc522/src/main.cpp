#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>
#include "secrets.h"

MFRC522 reader(RFID_SS, RFID_RST);
String pendingPayload;
String lastUid;
unsigned long lastRead = 0;
unsigned long lastAttempt = 0;
unsigned long lastWifiAttempt = 0;

String eventId() {
  char output[33];
  snprintf(output, sizeof(output), "%08lx%08lx%08lx%08lx",
    (unsigned long)esp_random(), (unsigned long)esp_random(),
    (unsigned long)esp_random(), (unsigned long)esp_random());
  return String(output);
}
void setup() {
  Serial.begin(115200);
  SPI.begin(RFID_SCK, RFID_MISO, RFID_MOSI, RFID_SS);
  reader.PCD_Init();
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org");
  Serial.println("RFID reader ready. No patient data is stored on this device.");
}
void loop() {
  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiAttempt > 10000) {
    lastWifiAttempt = millis(); WiFi.reconnect();
  }
  if (pendingPayload.length() && WiFi.status() == WL_CONNECTED && millis() - lastAttempt > 3000) {
    lastAttempt = millis();
    WiFiClientSecure client;
    client.setCACert(SERVER_CA_PEM);
    HTTPClient http;
    http.setTimeout(5000);
    if (http.begin(client, API_URL)) {
      http.addHeader("Content-Type", "application/json");
      http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
      int status = http.POST(pendingPayload);
      if (status == 200) { pendingPayload = ""; Serial.println("Scan acknowledged."); }
      else if (status >= 400 && status < 500) { pendingPayload = ""; Serial.println("Scan rejected. Check provisioning."); }
      else Serial.println("Scan pending; retry will use the same event ID.");
      http.end();
    }
  }
  if (!pendingPayload.length() && reader.PICC_IsNewCardPresent() && reader.PICC_ReadCardSerial()) {
    String uid;
    for (byte i = 0; i < reader.uid.size; i++) {
      char part[3]; snprintf(part, sizeof(part), "%02X", reader.uid.uidByte[i]); uid += part;
    }
    reader.PICC_HaltA(); reader.PCD_StopCrypto1();
    if (uid == lastUid && millis() - lastRead < 3000) return;
    lastUid = uid; lastRead = millis();
    JsonDocument event;
    event["version"] = 1; event["deviceId"] = DEVICE_ID;
    event["eventId"] = eventId(); event["tagUid"] = uid;
    serializeJson(event, pendingPayload);
  }
  delay(20);
}
