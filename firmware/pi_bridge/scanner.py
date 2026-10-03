#!/usr/bin/env python3
"""Uno serial reader -> Pran Rekha API; patient display stays in memory only."""
import json
import logging
import os
import re
import time
import unicodedata
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

import serial

UID = re.compile(r"^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$")


def display_pages(card):
    """Page complete fields; never silently truncate an allergy or patient name."""
    pages = [("FICTIONAL DEMO" if card.get("demo") else "Approved summary", "See app for full")]
    fields = [("Patient name", card["name"])]
    fields += [(e["kind"].replace("_", " "), e["text"]) for e in card["entries"]]
    for title, value in fields:
        # HD44780 character LCDs cannot render Unicode patient records.
        value = value.translate(str.maketrans({"—": "-", "–": "-", "’": "'", "“": '"', "”": '"', "·": ";"}))
        value = unicodedata.normalize("NFKD", value)
        value = "".join(c for c in value if not unicodedata.combining(c))
        value = " ".join(value.split())
        if any(ord(c) < 32 or ord(c) > 126 for c in value):
            pages.append((title[:16], "Read in app"))
            continue
        chunks = [value[i:i + 16] for i in range(0, len(value), 16)] or ["Not provided"]
        for i, chunk in enumerate(chunks):
            label = title if len(chunks) == 1 else f"{title[:10]} {i+1}/{len(chunks)}"
            pages.append((label[:16], chunk))
    return pages


class Api:
    def __init__(self, origin, token, device):
        parsed = urlparse(origin)
        if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost", "::1")):
            raise ValueError("Use HTTPS, or loopback HTTP through an SSH tunnel")
        self.origin, self.token, self.device = origin.rstrip("/"), token, device

    def call(self, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = Request(self.origin + "/api/platform" + path, data=data,
                      headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"})
        with urlopen(req, timeout=2) as response:
            raw = response.read(1_000_001)
            if len(raw) > 1_000_000:
                raise ValueError("API response too large")
            return json.loads(raw)

    def display(self, event=None):
        query = {"deviceId": self.device}
        if event:
            query["eventId"] = event
        return self.call("/rfid/display?" + urlencode(query))


def lcd(port, first, second):
    def clean(text):
        return "".join(c if 32 <= ord(c) <= 126 else " " for c in text)[:16]
    port.write(("LCD\t" + clean(first) + "\t" + clean(second) + "\n").encode("ascii"))


def run(port, api):
    time.sleep(2)  # Uno resets when its USB serial port opens.
    port.reset_input_buffer()
    port.write(b"PING\nCLEAR\n")
    pending = None
    event = None
    event_started = 0
    pages = []
    page = 0
    last_poll = last_send = last_page = 0
    message = ("Pran Rekha", "Tap RFID card")
    incoming = b""
    reader_ready = False
    while True:
        incoming += port.read_until(b"\n", 128)
        line = incoming if incoming.endswith(b"\n") else b""
        if len(incoming) > 256:
            incoming = b""
            line = b""
        if line:
            incoming = b""
            text = line.decode("ascii", errors="replace").strip()
            if text.startswith("STATUS\t"):
                logging.info("Arduino %s", text)
                reader_ready = "RFID=OK" in text
                if not reader_ready:
                    pages = []
                    pending = event = None
                    message = ("RFID not found", "Check wiring")
            elif text.startswith("SCAN\t") and UID.fullmatch(text[5:]):
                uid = text[5:]
                # A new physical card always clears the previous patient's display.
                pending = {"version": 1, "deviceId": api.device, "eventId": str(uuid.uuid4()), "tagUid": uid}
                event = None
                pages = []
                event_started = time.monotonic()
                last_poll = last_send = 0
                message = ("Card scanned", "Sending to app")
                lcd(port, *message)
                logging.info("Card UID %s scanned (map this UID in the app)", uid)
        now = time.monotonic()
        if (pending or event) and now - event_started >= 240:
            pending = event = None
            pages = []
            message = ("Scan expired", "Tap card again")
        if now - last_poll >= 2:
            last_poll = now
            try:
                if pending:
                    result = api.call("/rfid/scans", pending)
                    if result.get("accepted") is not True or result.get("eventId") != pending["eventId"]:
                        raise ValueError("Unexpected scan acknowledgement")
                    event = pending["eventId"]
                    pending = None
                    logging.info("Scan accepted by app")
                result = api.display(event)
                state = result.get("state")
                if event and (state == "AUTHORIZED" or (state == "WAITING_APPROVAL" and result.get("demo") is True and isinstance(result.get("name"), str))):
                    if state == "AUTHORIZED":
                        updated = display_pages(result["card"])
                    else:
                        name = result["name"]
                        updated = [(name[i:i+16], "Approve in app") for i in range(0, len(name), 16)] or [("Demo patient", "Approve in app")]
                    if updated != pages:
                        pages, page, last_page = updated, 0, now
                    message = pages[page]
                else:
                    pages = []
                    message = {
                        "READY": ("Pran Rekha", "Tap RFID card") if reader_ready else ("RFID not found", "Check wiring"),
                        "WAITING_APPROVAL": ("Card received", "Waiting approval"),
                        "UNKNOWN_TAG": ("Unknown card", "Register in app"),
                        "EXPIRED": ("Display cleared", "Tap card again"),
                    }.get(state, ("App unavailable", "Try again"))
                    if state == "EXPIRED":
                        event = None
                lcd(port, *message)
                last_send = time.monotonic()
            except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, TypeError) as exc:
                pages = []
                message = ("App offline", "Retrying...")
                if isinstance(exc, HTTPError) and 400 <= exc.code < 500 and exc.code not in (408, 429):
                    pending = event = None
                    message = ("Access rejected", "Check app setup")
                logging.warning("API unavailable: %s", type(exc).__name__)
                lcd(port, *message)
                last_send = time.monotonic()
        if pages and now - last_page >= 3:
            page = (page + 1) % len(pages)
            last_page = now
            message = pages[page]
            lcd(port, *message)
            last_send = time.monotonic()
        if time.monotonic() - last_send >= 3:
            lcd(port, *message)
            last_send = time.monotonic()


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    api = Api(os.environ.get("API_ORIGIN", "http://127.0.0.1:14100"),
              os.environ["RFID_DEVICE_TOKEN"], os.environ.get("RFID_DEVICE_ID", "reader-demo"))
    path = os.environ.get("RFID_SERIAL_PORT", "/dev/ttyACM0")
    while True:
        try:
            with serial.Serial(path, 115200, timeout=0.1, write_timeout=1, exclusive=True) as port:
                logging.info("Connected to Arduino at %s", path)
                run(port, api)
        except (serial.SerialException, OSError) as exc:
            logging.warning("Arduino disconnected: %s", type(exc).__name__)
            time.sleep(3)


if __name__ == "__main__":
    main()
