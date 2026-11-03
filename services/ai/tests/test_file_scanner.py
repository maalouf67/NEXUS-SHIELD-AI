import hashlib
import io
import stat
import tempfile
import unittest
from pathlib import Path
from subprocess import CompletedProcess
from unittest.mock import patch

from app.security.file_scanner import (
    ScanInputError,
    ScannerUnavailable,
    UploadTooLarge,
    scan_quarantined_file,
    stage_uploaded_file,
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
        self.assertIn("--fdpass", run.call_args.args[0])

    @patch("app.security.file_scanner.subprocess.run")
    def test_detected_verdict_is_reported_without_execution(self, run):
        run.return_value = CompletedProcess(args=[], returncode=1, stdout="", stderr="")
        result = scan_quarantined_file(self.sample_id, self.root)
        self.assertEqual(result["verdict"], "detected")
        self.assertFalse(result["execution_performed"])

    @patch("app.security.file_scanner.subprocess.run")
    def test_remote_clamd_uses_tcp_stream_mode_without_fdpass(self, run):
        run.return_value = CompletedProcess(args=[], returncode=0, stdout="", stderr="")
        scan_quarantined_file(self.sample_id, self.root, clamd_host="clamav", clamd_port=3310)
        command = run.call_args.args[0]
        self.assertIn("--host=clamav", command)
        self.assertIn("--port=3310", command)
        self.assertNotIn("--fdpass", command)

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
        with self.assertRaises(ScannerUnavailable):
            scan_quarantined_file(self.sample_id, self.root / "missing")

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

    def test_upload_is_streamed_to_private_hash_named_quarantine(self):
        quarantine = self.root / "new-quarantine"
        result = stage_uploaded_file(io.BytesIO(self.sample_bytes), quarantine)
        stored = quarantine / result["sample_id"]
        self.assertEqual(result["sample_id"], self.sample_id)
        self.assertEqual(stored.read_bytes(), self.sample_bytes)
        self.assertEqual(stat.S_IMODE(stored.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(quarantine.stat().st_mode), 0o700)
        self.assertEqual(list(quarantine.glob("*.part")), [])

    def test_duplicate_upload_reuses_same_content_addressed_sample(self):
        quarantine = self.root / "new-quarantine"
        first = stage_uploaded_file(io.BytesIO(self.sample_bytes), quarantine)
        second = stage_uploaded_file(io.BytesIO(self.sample_bytes), quarantine)
        self.assertEqual(first["sample_id"], second["sample_id"])
        self.assertEqual(len(list(quarantine.iterdir())), 1)
        self.assertTrue((quarantine / self.sample_id).is_file())

    def test_empty_upload_is_rejected(self):
        with self.assertRaises(ScanInputError):
            stage_uploaded_file(io.BytesIO(b""), self.root / "empty-quarantine")

    def test_upload_limit_is_enforced_and_temporary_file_is_removed(self):
        quarantine = self.root / "limited-quarantine"
        with self.assertRaises(UploadTooLarge):
            stage_uploaded_file(io.BytesIO(b"12345"), quarantine, max_file_bytes=4)
        self.assertEqual(list(quarantine.glob("*.part")), [])
        self.assertEqual(list(quarantine.iterdir()), [])

    def test_insecure_quarantine_permissions_are_rejected(self):
        quarantine = self.root / "insecure-quarantine"
        quarantine.mkdir(mode=0o755)
        quarantine.chmod(0o755)
        with self.assertRaises(ScannerUnavailable):
            stage_uploaded_file(io.BytesIO(self.sample_bytes), quarantine)


if __name__ == "__main__":
    unittest.main()
