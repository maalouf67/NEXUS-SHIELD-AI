import hashlib
import io
import socket
import stat
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

from app.security.file_scanner import (
    ScanInputError,
    ScannerExecutionError,
    ScannerTimeout,
    ScannerUnavailable,
    UploadTooLarge,
    scan_quarantined_file,
    stage_uploaded_file,
    delete_quarantined_file,
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

    def _clamd_connection(self, response=b"stream: OK\0"):
        connection = MagicMock()
        connection.recv.side_effect = [response]
        return connection

    @patch("app.security.file_scanner.socket.create_connection")
    def test_clean_verdict_streams_content_using_instream_protocol(self, create_connection):
        connection = self._clamd_connection()
        create_connection.return_value = connection
        result = scan_quarantined_file(self.sample_id, self.root, clamd_host="clamav", clamd_port=3310)
        self.assertEqual(result["verdict"], "clean")
        self.assertEqual(result["sha256"], self.sample_id)
        self.assertEqual(result["size_bytes"], len(self.sample_bytes))
        self.assertFalse(result["execution_performed"])
        self.assertEqual(result["scanner"], "ClamAV clamd INSTREAM")
        create_connection.assert_called_once_with(("clamav", 3310), timeout=60)
        sent = b"".join(call.args[0] for call in connection.sendall.call_args_list)
        self.assertTrue(sent.startswith(b"zINSTREAM\0"))
        offset = len(b"zINSTREAM\0")
        chunk_size = struct.unpack("!I", sent[offset:offset + 4])[0]
        self.assertEqual(chunk_size, len(self.sample_bytes))
        self.assertEqual(sent[offset + 4:offset + 4 + chunk_size], self.sample_bytes)
        self.assertEqual(sent[-4:], struct.pack("!I", 0))
        connection.close.assert_called_once()

    @patch("app.security.file_scanner.socket.create_connection")
    def test_detected_verdict_is_reported_without_execution(self, create_connection):
        create_connection.return_value = self._clamd_connection(b"stream: Eicar-Test-Signature FOUND\0")
        result = scan_quarantined_file(self.sample_id, self.root)
        self.assertEqual(result["verdict"], "detected")
        self.assertFalse(result["execution_performed"])

    @patch("app.security.file_scanner.socket.create_connection")
    def test_clamd_error_is_not_reported_as_clean(self, create_connection):
        create_connection.return_value = self._clamd_connection(b"stream: INSTREAM size limit exceeded. ERROR\0")
        with self.assertRaises(ScannerExecutionError):
            scan_quarantined_file(self.sample_id, self.root)

    @patch("app.security.file_scanner.socket.create_connection", side_effect=socket.timeout)
    def test_clamd_timeout_fails_closed(self, create_connection):
        with self.assertRaises(ScannerTimeout):
            scan_quarantined_file(self.sample_id, self.root)

    @patch("app.security.file_scanner.socket.create_connection", side_effect=OSError("connection refused"))
    def test_unavailable_clamd_fails_closed(self, create_connection):
        with self.assertRaises(ScannerUnavailable):
            scan_quarantined_file(self.sample_id, self.root)

    @patch("app.security.file_scanner.socket.create_connection")
    def test_incomplete_clamd_response_fails_closed(self, create_connection):
        connection = MagicMock()
        connection.recv.return_value = b""
        create_connection.return_value = connection
        with self.assertRaises(ScannerExecutionError):
            scan_quarantined_file(self.sample_id, self.root)

    def test_invalid_identifier_is_rejected(self):
        with self.assertRaises(ScanInputError):
            scan_quarantined_file("../outside", self.root)

    def test_invalid_clamd_port_is_rejected_before_connect(self):
        with patch("app.security.file_scanner.socket.create_connection") as connect:
            with self.assertRaises(ScanInputError):
                scan_quarantined_file(self.sample_id, self.root, clamd_port=70000)
            connect.assert_not_called()

    def test_content_hash_must_match_quarantine_identifier(self):
        claimed_id = hashlib.sha256(b"different content").hexdigest()
        (self.root / claimed_id).write_bytes(self.sample_bytes)
        with self.assertRaises(ScanInputError):
            scan_quarantined_file(claimed_id, self.root)

    def test_missing_quarantine_directory_fails_closed(self):
        with self.assertRaises(ScannerUnavailable):
            scan_quarantined_file(self.sample_id, self.root / "missing")

    @patch("app.security.file_scanner.socket.create_connection")
    def test_oversized_sample_is_rejected_before_scanner_call(self, connect):
        with self.assertRaises(ScanInputError):
            scan_quarantined_file(self.sample_id, self.root, max_file_bytes=4)
        connect.assert_not_called()

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

    def test_delete_removes_only_the_matching_hash_sample(self):
        self.assertTrue(delete_quarantined_file(self.sample_id, self.root))
        self.assertFalse((self.root / self.sample_id).exists())
        self.assertFalse(delete_quarantined_file(self.sample_id, self.root))

    def test_delete_rejects_a_sample_whose_contents_were_modified(self):
        (self.root / self.sample_id).write_bytes(b"modified content")
        with self.assertRaises(ScanInputError):
            delete_quarantined_file(self.sample_id, self.root)

    def test_insecure_quarantine_permissions_are_rejected(self):
        quarantine = self.root / "insecure-quarantine"
        quarantine.mkdir(mode=0o755)
        quarantine.chmod(0o755)
        with self.assertRaises(ScannerUnavailable):
            stage_uploaded_file(io.BytesIO(self.sample_bytes), quarantine)


if __name__ == "__main__":
    unittest.main()
