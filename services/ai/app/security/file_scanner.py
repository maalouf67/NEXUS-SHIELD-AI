import hashlib
import os
import re
import stat
import socket
import struct
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO

SAMPLE_ID_PATTERN = re.compile(r"^[a-f0-9]{64}$")
DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024
DEFAULT_SCAN_TIMEOUT_SECONDS = 60
UPLOAD_CHUNK_BYTES = 1024 * 1024


class ScanInputError(ValueError):
    pass


class UploadTooLarge(ScanInputError):
    pass


class QuarantineFileNotFound(FileNotFoundError):
    pass


class ScannerUnavailable(RuntimeError):
    pass


class ScannerTimeout(TimeoutError):
    pass


class ScannerExecutionError(RuntimeError):
    pass


def _quarantine_root(quarantine_dir: str | Path, *, create: bool = False) -> Path:
    requested = Path(quarantine_dir).expanduser()
    try:
        if create:
            requested.mkdir(parents=True, exist_ok=True, mode=0o700)
        if requested.is_symlink():
            raise ScanInputError("quarantine directory must not be a symlink")
        root = requested.resolve(strict=True)
    except FileNotFoundError as exc:
        raise ScannerUnavailable("configured quarantine directory does not exist") from exc
    except OSError as exc:
        raise ScannerUnavailable("quarantine directory is not accessible") from exc

    if not root.is_dir():
        raise ScanInputError("quarantine path must be a directory")

    # Samples must remain private to the AI service account.
    if os.name != "nt" and stat.S_IMODE(root.stat().st_mode) & 0o077:
        raise ScannerUnavailable("quarantine directory permissions must be 0700 or stricter")
    return root


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(UPLOAD_CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stage_uploaded_file(
    upload: BinaryIO,
    quarantine_dir: str | Path,
    *,
    max_file_bytes: int = DEFAULT_MAX_FILE_BYTES,
) -> dict[str, Any]:
    """
    Stream an untrusted upload into a private quarantine directory.

    The original filename and MIME type are deliberately ignored. A generated
    SHA-256 identifier is the only stored filename. The upload is never executed
    or made available through a public web directory.
    """
    if max_file_bytes < 1:
        raise ScanInputError("maximum file size must be a positive integer")

    root = _quarantine_root(quarantine_dir, create=True)
    try:
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=".nexus-upload-",
            suffix=".part",
            dir=root,
        )
    except OSError as exc:
        raise ScannerUnavailable("could not create a private quarantine sample") from exc

    temporary_path = Path(temporary_name)
    digest = hashlib.sha256()
    total_bytes = 0
    descriptor_open = True

    try:
        with os.fdopen(descriptor, "wb") as destination:
            descriptor_open = False
            while True:
                chunk = upload.read(UPLOAD_CHUNK_BYTES)
                if not chunk:
                    break
                if not isinstance(chunk, bytes):
                    raise ScanInputError("uploaded content must be a binary stream")
                total_bytes += len(chunk)
                if total_bytes > max_file_bytes:
                    raise UploadTooLarge("sample exceeds the configured maximum file size")
                digest.update(chunk)
                destination.write(chunk)
            if total_bytes == 0:
                raise ScanInputError("empty files cannot be scanned")
            destination.flush()
            os.fsync(destination.fileno())

        sample_id = digest.hexdigest()
        sample_path = root / sample_id
        try:
            # A hard link creates the final name atomically without replacing an
            # existing sample. Both paths are in the same private directory.
            os.link(temporary_path, sample_path)
        except FileExistsError:
            if sample_path.is_symlink() or not sample_path.is_file():
                raise ScanInputError("existing quarantine entry is not a regular file")
            if _sha256_file(sample_path) != sample_id:
                raise ScanInputError("existing quarantine entry failed its content hash check")
        except OSError as exc:
            raise ScannerUnavailable("could not finalize the quarantined sample") from exc

        os.chmod(sample_path, 0o600)
        return {
            "sample_id": sample_id,
            "sha256": sample_id,
            "size_bytes": total_bytes,
            "staged_at": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        if descriptor_open:
            os.close(descriptor)
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError:
            # Keep the primary scan/staging failure; an operator can clean stale
            # .part files from this private directory during maintenance.
            pass


def scan_quarantined_file(
    sample_id: str,
    quarantine_dir: str | Path,
    *,
    clamd_host: str | None = None,
    clamd_port: int | None = None,
    max_file_bytes: int = DEFAULT_MAX_FILE_BYTES,
    timeout_seconds: int = DEFAULT_SCAN_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """
    Stream a pre-staged file to a private ClamAV daemon using its INSTREAM protocol.

    The AI service is a protocol client only; the ClamAV engine and signature
    database live in the separate ClamAV container/service. No shell command or
    ClamAV binary is required in this image.
    """
    if not SAMPLE_ID_PATTERN.fullmatch(sample_id):
        raise ScanInputError("sample_id must be a lowercase SHA-256 hex identifier")
    if max_file_bytes < 1 or timeout_seconds < 1:
        raise ScanInputError("scan limits must be positive integers")
    root = _quarantine_root(quarantine_dir)
    candidate = root / sample_id
    if candidate.is_symlink():
        raise ScanInputError("symlinks are not accepted in quarantine")

    try:
        resolved_candidate = candidate.resolve(strict=True)
    except FileNotFoundError as exc:
        raise QuarantineFileNotFound("quarantined sample was not found") from exc

    if resolved_candidate.parent != root or not resolved_candidate.is_file():
        raise ScanInputError("sample must be a regular file directly inside quarantine")

    size_bytes = resolved_candidate.stat().st_size
    if size_bytes > max_file_bytes:
        raise ScanInputError("sample exceeds the configured maximum file size")

    sha256 = _sha256_file(resolved_candidate)
    if sha256 != sample_id:
        raise ScanInputError("sample identifier does not match the file SHA-256 digest")

    host = (clamd_host or os.getenv("CLAMD_HOST", "clamav")).strip()
    try:
        port = int(clamd_port if clamd_port is not None else os.getenv("CLAMD_PORT", "3310"))
    except (TypeError, ValueError) as exc:
        raise ScanInputError("ClamAV TCP port must be an integer") from exc
    if not host or not 1 <= port <= 65535:
        raise ScanInputError("ClamAV TCP host and port are invalid")

    response = bytearray()
    try:
        connection = socket.create_connection((host, port), timeout=timeout_seconds)
        try:
            connection.settimeout(timeout_seconds)
            connection.sendall(b"zINSTREAM\\0")
            with resolved_candidate.open("rb") as sample:
                for chunk in iter(lambda: sample.read(UPLOAD_CHUNK_BYTES), b""):
                    connection.sendall(struct.pack("!I", len(chunk)))
                    connection.sendall(chunk)
            connection.sendall(struct.pack("!I", 0))

            # Clamd terminates its NUL-delimited INSTREAM response with OK,
            # FOUND or ERROR. Bound the response to avoid untrusted growth.
            while b"\\0" not in response:
                chunk = connection.recv(1024)
                if not chunk:
                    break
                response.extend(chunk)
                if len(response) > 8192:
                    raise ScannerExecutionError("ClamAV returned an oversized response")
        finally:
            connection.close()
    except socket.timeout as exc:
        raise ScannerTimeout("ClamAV scan exceeded the configured time limit") from exc
    except ScannerExecutionError:
        raise
    except OSError as exc:
        raise ScannerUnavailable("ClamAV daemon could not be reached") from exc

    if b"\\0" not in response:
        raise ScannerExecutionError("ClamAV closed the stream without a verdict")
    message = bytes(response).split(b"\\0", 1)[0].decode("utf-8", errors="replace").strip()
    if message.endswith(" OK"):
        verdict = "clean"
    elif message.endswith(" FOUND"):
        verdict = "detected"
    else:
        raise ScannerExecutionError("ClamAV returned an error status")

    return {
        "sample_id": sample_id,
        "sha256": sha256,
        "size_bytes": size_bytes,
        "verdict": verdict,
        "scanner": "ClamAV clamd INSTREAM",
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "execution_performed": False,
        "disclaimer": "A clean signature scan does not guarantee that a file is harmless.",
    }


def delete_quarantined_file(sample_id: str, quarantine_dir: str | Path) -> bool:
    """Delete one owner-scoped quarantined sample after strict path/hash checks."""
    if not SAMPLE_ID_PATTERN.fullmatch(sample_id):
        raise ScanInputError("sample_id must be a lowercase SHA-256 hex identifier")
    root = _quarantine_root(quarantine_dir)
    candidate = root / sample_id
    if candidate.is_symlink():
        raise ScanInputError("symlinks are not accepted in quarantine")
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError:
        return False
    if resolved.parent != root or not resolved.is_file():
        raise ScanInputError("sample must be a regular file directly inside quarantine")
    if _sha256_file(resolved) != sample_id:
        raise ScanInputError("sample content hash does not match its identifier")
    resolved.unlink()
    return True
