#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// Uno R3: RC522 SS=D10, RST=D9, MOSI=D11, MISO=D12, SCK=D13.
// LCD: SDA=A4, SCL=A5. Default geometry is 16 columns, 2 rows.
MFRC522 reader(10, 9);
LiquidCrystal_I2C lcd27(0x27, 16, 2);
LiquidCrystal_I2C lcd3f(0x3f, 16, 2);
LiquidCrystal_I2C *lcd = NULL;
char command[40];
byte commandLength = 0;
bool overflow = false;
bool readerReady = false;
bool displayActive = false;
unsigned long displayAt = 0;
unsigned long lastScan = 0;
unsigned long lastCheck = 0;
char lastUid[21] = "";

void show(const char *line1, const char *line2) {
  if (!lcd) return;
  const char *lines[] = {line1, line2};
  for (byte row = 0; row < 2; row++) {
    lcd->setCursor(0, row);
    bool ended = false;
    for (byte col = 0; col < 16; col++) {
      if (!ended && lines[row][col] == '\0') ended = true;
      lcd->write(ended ? ' ' : lines[row][col]);
    }
  }
}

void diagnostics() {
  byte version = reader.PCD_ReadRegister(MFRC522::VersionReg);
  readerReady = version != 0x00 && version != 0xFF;
  Serial.print(F("STATUS\tRFID=")); Serial.print(readerReady ? F("OK") : F("MISSING"));
  Serial.print(F("\tVERSION=")); Serial.print(version, HEX);
  Serial.print(F("\tLCD="));
  Serial.println(lcd == &lcd27 ? F("0x27") : lcd == &lcd3f ? F("0x3F") : F("MISSING"));
}

void handleCommand() {
  command[commandLength] = '\0';
  if (strcmp(command, "PING") == 0) {
    diagnostics();
  } else if (strcmp(command, "CLEAR") == 0) {
    displayActive = false;
    show("Pran Rekha", readerReady ? "Tap RFID card" : "Check RFID wires");
  } else if (strncmp(command, "LCD\t", 4) == 0) {
    char *second = strchr(command + 4, '\t');
    if (second) {
      *second = '\0';
      show(command + 4, second + 1);
      displayAt = millis();
      displayActive = true;
    }
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  Wire.setWireTimeout(25000, true);
  Wire.beginTransmission(0x27);
  if (Wire.endTransmission() == 0) lcd = &lcd27;
  if (!lcd) {
    Wire.beginTransmission(0x3F);
    if (Wire.endTransmission() == 0) lcd = &lcd3f;
  }
  if (lcd) { lcd->init(); lcd->backlight(); }
  SPI.begin();
  reader.PCD_Init();
  delay(50);
  diagnostics();
  show("Pran Rekha", readerReady ? "Tap RFID card" : "Check RFID wires");
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (!overflow) handleCommand();
      commandLength = 0; overflow = false;
    } else if (c == '\t' || (c >= 32 && c <= 126)) {
      if (commandLength < sizeof(command) - 1) command[commandLength++] = c;
      else overflow = true;
    } else overflow = true;
  }
  // A disconnected bridge must never leave patient text displayed indefinitely.
  if (displayActive && millis() - displayAt >= 8000) {
    displayActive = false;
    show("Pran Rekha", readerReady ? "Tap RFID card" : "Check RFID wires");
  }
  if (millis() - lastCheck >= 10000) {
    lastCheck = millis();
    if (!readerReady) reader.PCD_Init();
    diagnostics();
  }
  if (!readerReady || !reader.PICC_IsNewCardPresent() || !reader.PICC_ReadCardSerial()) return;
  char uid[21];
  const char hex[] = "0123456789ABCDEF";
  for (byte i = 0; i < reader.uid.size; i++) {
    uid[i * 2] = hex[reader.uid.uidByte[i] >> 4];
    uid[i * 2 + 1] = hex[reader.uid.uidByte[i] & 15];
  }
  uid[reader.uid.size * 2] = '\0';
  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
  if (strcmp(uid, lastUid) == 0 && millis() - lastScan < 2500) return;
  strcpy(lastUid, uid); lastScan = millis();
  show("Card scanned", "Sending to app");
  displayActive = true; displayAt = millis();
  Serial.print(F("SCAN\t")); Serial.println(uid);
}
