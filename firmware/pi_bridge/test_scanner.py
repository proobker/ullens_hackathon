import unittest
from scanner import Api, UID, display_pages, lcd


class ScannerTests(unittest.TestCase):
    def test_uid_lengths(self):
        for uid in ("DEADBEEF", "11223344556677", "11223344556677889900"):
            self.assertIsNotNone(UID.fullmatch(uid))
        for uid in ("SCAN", "123", "deadbeef", "DEADBEEF\tbad"):
            self.assertIsNone(UID.fullmatch(uid))

    def test_name_and_allergy_are_not_truncated(self):
        name = "Siddharth Raj Sharma"
        allergy = "Penicillin - anaphylaxis recorded"
        pages = display_pages({"name": name, "entries": [{"kind": "allergy", "text": allergy}]})
        self.assertEqual("".join(p[1] for p in pages[1:3]), name)
        self.assertEqual("".join(p[1] for p in pages[3:]), allergy)
        self.assertTrue(all(len(a) <= 16 and len(b) <= 16 for a, b in pages))

    def test_unicode_cannot_silently_change_clinical_values(self):
        pages = display_pages({"name": "Asha", "entries": [{"kind": "medication", "text": "१ tablet"}]})
        self.assertEqual(pages[-1], ("medication", "Read in app"))

    def test_lcd_protocol_cannot_inject_commands(self):
        class Port:
            def write(self, data):
                self.data = data
        port = Port()
        lcd(port, "Name\nCLEAR", "line\t2")
        self.assertEqual(port.data, b"LCD\tName CLEAR\tline 2\n")

    def test_unencrypted_remote_api_is_rejected(self):
        with self.assertRaises(ValueError):
            Api("http://192.168.1.69:4100", "token", "reader")
        Api("http://127.0.0.1:14100", "token", "reader")
        Api("https://clinic.example.test", "token", "reader")


if __name__ == "__main__":
    unittest.main()
