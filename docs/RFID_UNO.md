# Raspberry Pi + Arduino Uno RFID scanner

This reader uses the existing `/api/platform/rfid/scans` ingestion endpoint. The
Uno reads card UIDs and drives a 16x2 I2C character LCD. A Python bridge on the Pi
handles the network and reader credential. No patient data is written to cards,
Arduino EEPROM, or bridge files. Patient text exists briefly in RAM and on the LCD.

## Hardware

Target: Raspberry Pi 3 B+, Raspberry Pi OS 64-bit, Arduino Uno R3, MFRC522/RC522,
and an HD44780-compatible 16x2 LCD with a common PCF8574 I2C backpack at 0x27 or
0x3F. Other LCD geometries/backpacks need configuration or a different driver.

Power off before changing wires. Use a 5 V to 3.3 V level translator suitable for
SPI on Uno output signals to the RC522. RC522 power is **3.3 V**, never 5 V.

| RC522 | Uno |
| --- | --- |
| 3.3V | 3.3V |
| GND | GND |
| SDA/SS | D10 through level translator |
| SCK | D13 through level translator |
| MOSI | D11 through level translator |
| MISO | D12 |
| RST | D9 through level translator |
| IRQ | Unconnected |

The RC522's SDA pin means SPI chip-select here, not I2C SDA.

| Typical 5 V LCD backpack | Uno |
| --- | --- |
| VCC | 5V |
| GND | GND |
| SDA | A4 |
| SCL | A5 |

Connect the Uno to a USB port on the Pi. Power the Pi with its own suitable power
supply. The LCD connects to the Uno, not to the Pi's 3.3 V GPIO. Adjust the LCD
backpack contrast trimmer if its backlight comes on but characters are invisible.

Electrical reference: [NXP MFRC522 datasheet](https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf).

## Firmware build and upload on the Pi

Install [Arduino CLI](https://docs.arduino.cc/arduino-cli/installation/) for Linux
ARM64. Commands below assume it is on PATH; this installation also keeps a copy
at `~/patient-scanner/tools/arduino-cli`.

```bash
arduino-cli core update-index
arduino-cli core install arduino:avr@1.8.6
arduino-cli lib install 'MFRC522@1.4.12' 'LiquidCrystal I2C@1.1.2'
arduino-cli compile --fqbn arduino:avr:uno ~/patient-scanner/uno_scanner
arduino-cli upload --fqbn arduino:avr:uno -p /dev/ttyACM0 ~/patient-scanner/uno_scanner
```

Stop the bridge before uploading so it releases the serial port. The sketch is
`firmware/uno_scanner/uno_scanner.ino`. Opening the serial port resets an Uno;
wait two seconds before sending commands. Serial speed is 115200 baud.

Protocol, one ASCII line per message:

- Uno -> Pi: `SCAN<TAB>DEADBEEF` (actual 4-, 7-, or 10-byte UID, uppercase hex).
- Uno -> Pi: `STATUS<TAB>RFID=OK<TAB>VERSION=92<TAB>LCD=0x27`.
- Pi -> Uno: `PING`, `CLEAR`, or `LCD<TAB>first line<TAB>second line`.
- `RFID=MISSING` or `VERSION=0/FF` means check reader power and SPI wiring.
- `LCD=MISSING` means no device responded at 0x27 or 0x3F.

Patient display clears after eight seconds without bridge refreshes. Card scans
also immediately replace the previous display.

## Bridge configuration

The Pi needs Python 3 and `python3-serial` (already present on the configured Pi).
Copy `firmware/pi_bridge/scanner.py` and `patient-scanner.service` into
`~/patient-scanner/`. Create `~/patient-scanner/scanner.env`, mode 600:

```dotenv
API_ORIGIN=http://127.0.0.1:14100
RFID_DEVICE_ID=reader-pi-uno
RFID_DEVICE_TOKEN=YOUR_UNIQUE_PROVISIONED_READER_TOKEN
RFID_SERIAL_PORT=/dev/ttyACM0
```

Prefer the corresponding `/dev/serial/by-id/...` path if multiple serial devices
are attached. Provision the token via the existing admin-only
`POST /api/platform/readers/provision` endpoint with
`{"id":"reader-pi-uno","actorId":"portal-paramedic"}`. This changes the paired
reader of that paramedic. Store the returned token privately. Do not use the
published synthetic reader token on hardware.

On the Windows laptop, from the project directory:

```powershell
rtk npm run dev
```

In another PowerShell terminal keep this connection open:

```powershell
rtk proxy ssh -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -R 127.0.0.1:14100:127.0.0.1:4100 scanner@patient-scanner
```

The Pi's loopback port 14100 forwards through encrypted SSH to the laptop's
loopback API port 4100. No public API port or unencrypted LAN HTTP is needed.
An HTTPS deployment can instead be used as `API_ORIGIN`; certificate verification
remains enabled. Keep the laptop awake. If the tunnel or app stops, scans wait in
memory and the LCD reports that the app is offline.

On the Pi:

```bash
mkdir -p ~/.config/systemd/user
cp ~/patient-scanner/patient-scanner.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now patient-scanner.service
journalctl --user -u patient-scanner.service -n 30 --no-pager
```

To run the user service at boot without an SSH login, enable lingering once:
`sudo loginctl enable-linger scanner`. This does not change the login password.
The SSH tunnel still needs to be started from the laptop after a restart.

## Using real cards

1. Tap a compatible 13.56 MHz ISO 14443-A card. The bridge log prints its UID,
   and the app receives it. A phone or 125 kHz tag may not work with the RC522.
2. Associate that **actual UID** with the intended patient using the existing
   hospital registration form, or admin `POST /api/platform/tags` with
   `{"tagUid":"ACTUAL_HEX_UID","patientId":"PATIENT_ID","revoked":false}`.
   Never assume a physical card has the fixture UID `DEADBEEF`.
3. In the paramedic portal, click the RFID scan button within two minutes of the
   tap. Confirm the access purpose and click **Open approved emergency summary**.
4. The LCD cycles through the approved patient's full name and released entries
   for up to 90 seconds. Long values are split across numbered pages, not silently
   truncated. Characters the LCD cannot represent show **Read in app**. The web
   app remains the source for complete records, dates, and provenance.

The LCD endpoint authenticates the reader and checks the exact scan, paired staff,
staff session, grant expiry, tag mapping, release revision and signature on every
poll. A different scan, logout, revoked/revised release, or expired grant removes
display access. The bridge polls every two seconds and clears patient text on an
API failure. Audited card projection must succeed before records are returned.

Retries reuse the same event ID. Only the newest scan is held in memory, for at
most four minutes. A new card supersedes a pending scan; restarting the bridge
loses it, so tap again. No persistent offline patient cache is maintained.

## Verification

```powershell
rtk proxy npx vitest run tests/platform.test.ts
rtk npm run typecheck
```

On the Pi: `cd ~/patient-scanner && python3 -m unittest -v test_scanner.py`.
Physical scan and display verification still require an assembled reader, LCD,
and a real card. Check the recorded result in `docs/DEVICE_MATRIX.md`.
