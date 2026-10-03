# ESP32 + RC522

For the Raspberry Pi 3 B+ + Arduino Uno + LCD setup, see [RFID_UNO.md](RFID_UNO.md).

Target: classic ESP32 DevKit, SPI RC522, compatible ISO 14443-A tags. RC522 is a 3.3 V device. Default wiring: SDA/SS→GPIO5, RST→22, SCK→18, MISO→19, MOSI→23, 3.3V→3V3 and GND→GND. Verify actual board labels before connecting; configure pins in the local header.

Install PlatformIO, copy include/secrets.example.h to include/secrets.h, supply Wi-Fi, HTTPS URL, trusted CA and a uniquely provisioned reader token. Build/upload for esp32dev. No firmware build or physical test is claimed until recorded in DEVICE_MATRIX.md.

Place the clinic frontend/API behind a local HTTPS reverse proxy. Route /api/ to 127.0.0.1:4100 and other requests to 127.0.0.1:5173. Configure PUBLIC_ORIGIN to the exact HTTPS origin. Install/trust the local CA on the phone and compile the CA into ESP32 firmware. Never disable certificate verification. The ESP32 needs a correct clock for TLS: configure an accessible local NTP server for demonstrations without internet.

The development reader has a public synthetic credential synthetic-reader-secret-change-before-hardware, UID DEADBEEF, paired to the paramedic fixture. Replace the credential before using real hardware. It permits scan ingestion only. Do not store health data on tags or the ESP32.

Simulator: set RFID_DEVICE_TOKEN, then run rtk node scripts/simulate-rfid.mjs DEADBEEF. It calls the same device endpoint as firmware. Scans remain candidates; staff must separately authorize record access.

One pending event is retried with the same event ID. A reset loses the pending in-memory event. Hardware, range, card compatibility, power and local TLS acceptance remain unverified until the assembled reader is tested.
