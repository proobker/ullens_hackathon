# Scanner hardware verification

Recorded 2026-10-03, from SSH on `patient-scanner` (Raspberry Pi 3 B+).

| Check | Result |
| --- | --- |
| Pi operating system | Debian 13 / Raspberry Pi OS, aarch64 |
| USB board | Arduino Uno R3, VID:PID 2341:0043, `/dev/ttyACM0` |
| Firmware compile | Passed, Arduino AVR core 1.8.6, MFRC522 1.4.12, LiquidCrystal I2C 1.1.2 |
| Flash / RAM | 8,454 / 32,256 bytes flash; 656 / 2,048 bytes static RAM |
| Firmware upload | Completed through Arduino CLI; new firmware serial diagnostics received |
| LCD I2C probe | Responds at 0x27 |
| RC522 SPI version register | After rewiring: **0x92 — RFID=OK** |
| Actual card scan | Seven physical card UIDs received and accepted by the app |
| LCD name before approval | User confirmed correct name with Approve in app |
| LCD approved summary | User confirmed FICTIONAL DEMO and sample details after Sumitra's physical scan was approved |
| App access tests | 59 tests pass across 9 files |
| Type checks | All workspaces pass |
| Pi bridge tests | 6 tests pass on the Pi |
| Pi -> app authentication | Verified through SSH tunnel; display heartbeat returns READY |
| Installed source integrity | Uno sketch and Pi bridge SHA-256 match the repository sources |
| Bridge service | Enabled; lingering enabled for scanner; retries USB reconnection |
| Last USB observation | Uno connected; Pi bridge restarted with name-before-approval support |

The seven-card batch is linked to fictional demo profiles in its recorded order.
Card ingestion and software access boundaries are verified. The user confirmed
both the physical name-only display and the fictional medical summary after
approval. The live API returned only name/demo/state before approval and four
fictional entries afterward. Photo upload remains available for later use.

The Pi bridge is installed as the `patient-scanner.service` user service, using
a unique `reader-pi-uno` credential paired with the local demo paramedic. Its
configuration is private on the Pi; credentials are not stored in this document.
The local app and laptop-to-Pi SSH tunnel must remain running.
