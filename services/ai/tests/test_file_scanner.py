import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from subprocess import CompletedProcess

from app.security.file_scanner import (
    ScanInputError,
    ScannerUnavailable,
    scan_quarantined_file,
)


class QuarantineScannerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.sample_bytes = b"safe synthetic fixture for scanner adapter tests"
        self.sample_id = hashlib.sha256(self.sample_bytes).hexdigest()
        (self.root / self.sample_id).write_bytes(self.sample_bytes)

    def tearDown(self):
        self.temp_dir.cleanup()

    @patch("app.security.file_scanner.subprocess.run")
    def test_clean_verdict_returns_hash_and_metadata(self, run):
        run.return_value = CompletedProcess(args=[], returncode=0, stdout="", stderr="")
        result = scan_quarantined_file(self.sample_id, self.root)

        self.assertEqual(result["verdict"], "clean")
        self.assertEqual(result["sha256"], self.sample_id)
        self.assertEqual(result["size_bytes"], len(self.sample_bytes))
        self.assertFalse(result["execution_performed"])
        run.assert_called_once()
        self.assertNotIn("shell", run.call_args.kwargs)

    @patch("app.security.file_scanner.subprocess.run")
    def test_detected_verdict_is_reported_without_execution(self, run):
        run.return_value = CompletedProcess(args=[], returncode=1, stdout="", stderr="")
        result = scan_quarantined_file(self.sample_id, self.root)
        self.assertEqual(result["verdict"], "detected")
        self.assertFalse(result["execution_performed"])

    @patch("app.security.file_scanner.subprocess.run", side_effect=FileNotFoundError)
    def test_missing_scanner_fails_closed(self, run):
        with self.assertRaises(ScannerUnavailable):
            scan_quarantined_file(self.sample_id, self.root)

    def test_invalid_identifier_is_rejected(self):
        with self.assertRaises(ScanInputError):
            scan_quarantined_file("../outside", self.root)

    def test_content_hash_must_match_quarantine_identifier(self):
        claimed_id = hashlib.sha256(b"different content").hexdigest()
        (self.root / claimed_id).write_bytes(self.sample_bytes)
        with self.assertRaises(ScanInputError):
            scan_quarantined_file(claimed_id, self.root)

    def test_missing_quarantine_directory_fails_closed(self):
        missing = self.root / "missing"
        with self.assertRaises(ScannerUnavailable):
            scan_quarantined_file(self.sample_id, missing)

    @patch("app.security.file_scanner.subprocess.run")
    def test_oversized_sample_is_rejected_before_scanner_call(self, run):
        with self.assertRaises(ScanInputError):
            scan_quarantined_file(self.sample_id, self.root, max_file_bytes=4)
        run.assert_not_called()

    def test_symlink_is_rejected(self):
        link_id = hashlib.sha256(b"link").hexdigest()
        (self.root / link_id).symlink_to(self.root / self.sample_id)
        with self.assertRaises(ScanInputError):
            scan_quarantined_file(link_id, self.root)


if __name__ == "__main__":
    unittest.main()
