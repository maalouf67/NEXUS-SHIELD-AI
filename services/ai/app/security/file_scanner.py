import hashlib
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SAMPLE_ID_PATTERN = re.compile(r"^[a-f0-9]{64}$")
DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024
DEFAULT_SCAN_TIMEOUT_SECONDS = 60


class ScanInputError(ValueError):
    pass


class QuarantineFileNotFound(FileNotFoundError):
    pass


class ScannerUnavailable(RuntimeError):
    pass


class ScannerTimeout(TimeoutError):
    pass


class ScannerExecutionError(RuntimeError):
    pass


def scan_quarantined_file(
    sample_id: str,
    quarantine_dir: str | Path,
    *,
    scanner_binary: str | None = None,
    max_file_bytes: int = DEFAULT_MAX_FILE_BYTES,
    timeout_seconds: int = DEFAULT_SCAN_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """
    Scan a pre-staged quarantined file with ClamAV clamdscan.

    The file is never executed. This function intentionally accepts only a
    SHA-256-shaped identifier, resolves it inside the configured quarantine
    directory, enforces size/time limits, and invokes the scanner without a shell.
    Upload staging, queueing, and quarantine storage provisioning are separate
    deployment responsibilities and are not implemented by this helper.
    """
    if not SAMPLE_ID_PATTERN.fullmatch(sample_id):
        raise ScanInputError("sample_id must be a lowercase SHA-256 hex identifier")
    if max_file_bytes < 1 or timeout_seconds < 1:
        raise ScanInputError("scan limits must be positive integers")

    try:
        root = Path(quarantine_dir).expanduser().resolve(strict=True)
    except FileNotFoundError as exc:
        raise ScannerUnavailable("configured quarantine directory does not exist") from exc
    if not root.is_dir():
        raise ScanInputError("quarantine directory must be a directory")

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

    digest = hashlib.sha256()
    with resolved_candidate.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    sha256 = digest.hexdigest()
    if sha256 != sample_id:
        raise ScanInputError("sample identifier does not match the file SHA-256 digest")

    binary = scanner_binary or os.getenv("CLAMDSCAN_BIN", "clamdscan")
    try:
        completed = subprocess.run(
            [binary, "--fdpass", "--no-summary", str(resolved_candidate)],
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout_seconds,
        )
    except FileNotFoundError as exc:
        raise ScannerUnavailable("ClamAV clamdscan binary is not installed or configured") from exc
    except subprocess.TimeoutExpired as exc:
        raise ScannerTimeout("ClamAV scan exceeded the configured time limit") from exc
    except OSError as exc:
        raise ScannerExecutionError("ClamAV scanner could not be started") from exc

    if completed.returncode == 0:
        verdict = "clean"
    elif completed.returncode == 1:
        verdict = "detected"
    else:
        raise ScannerExecutionError("ClamAV returned an error status")

    return {
        "sample_id": sample_id,
        "sha256": sha256,
        "size_bytes": size_bytes,
        "verdict": verdict,
        "scanner": "ClamAV clamdscan",
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "execution_performed": False,
        "disclaimer": "A clean signature scan does not guarantee that a file is harmless."
    }
