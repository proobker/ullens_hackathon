#pragma once
// Copy to secrets.h locally. Never commit live Wi-Fi or device credentials.
#define WIFI_SSID "YOUR_LOCAL_NETWORK"
#define WIFI_PASSWORD "YOUR_LOCAL_PASSWORD"
#define API_URL "https://clinic.example.test/api/platform/rfid/scans"
#define DEVICE_ID "reader-demo"
#define DEVICE_TOKEN "PROVISION_UNIQUE_DEVICE_TOKEN"
#define SERVER_CA_PEM R"PEM(-----BEGIN CERTIFICATE-----
REPLACE_WITH_LOCAL_CA_CERTIFICATE
-----END CERTIFICATE-----
)PEM"
#define RFID_SS 5
#define RFID_RST 22
#define RFID_SCK 18
#define RFID_MISO 19
#define RFID_MOSI 23
