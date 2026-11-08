
import os
import re
import hmac
from pathlib import Path

from starlette.concurrency import run_in_threadpool
from app.security.file_scanner import (
    ScanInputError,
    QuarantineFileNotFound,
    ScannerUnavailable,
    ScannerTimeout,
    ScannerExecutionError,
    UploadTooLarge,
    DEFAULT_MAX_FILE_BYTES,
    scan_quarantined_file,
    stage_uploaded_file,
    delete_quarantined_file,
)
from fastapi import FastAPI, HTTPException, Header, Request
from pydantic import BaseModel, Field
from starlette.datastructures import UploadFile as StarletteUploadFile


app = FastAPI(
    title="NEXUS SHIELD AI Engine",
    version="1.0.0"
)


class ScanFileRequest(BaseModel):
    sample_id: str = Field(pattern=r"^[a-f0-9]{64}$")


OWNER_ID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


def _owner_quarantine_path(owner_user_id: str) -> str:
    if not OWNER_ID_PATTERN.fullmatch(owner_user_id):
        raise HTTPException(status_code=400, detail={"code": "INVALID_OWNER_ID"})
    base = os.getenv("NEXUS_QUARANTINE_DIR", "")
    if not base:
        raise HTTPException(status_code=503, detail={"code": "QUARANTINE_NOT_CONFIGURED"})
    root = Path(base).expanduser()
    try:
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        if root.is_symlink():
            raise OSError("quarantine root must not be a symlink")
        root = root.resolve(strict=True)
        if os.name != "nt" and root.stat().st_mode & 0o077:
            raise OSError("quarantine root permissions must be 0700 or stricter")
        owner_dir = root / owner_user_id
        if owner_dir.is_symlink():
            raise OSError("owner quarantine directory must not be a symlink")
        owner_dir.mkdir(mode=0o700, exist_ok=True)
        if owner_dir.is_symlink() or not owner_dir.is_dir():
            raise OSError("owner quarantine path is invalid")
        if os.name != "nt" and owner_dir.stat().st_mode & 0o077:
            raise OSError("owner quarantine permissions must be 0700 or stricter")
        return str(owner_dir.resolve(strict=True))
    except OSError:
        raise HTTPException(status_code=503, detail={"code": "QUARANTINE_UNAVAILABLE"})


@app.get("/health")
async def health():
    # Public liveness endpoint: avoid disclosing whether a paid AI provider
    # credential is present or which provider is configured.
    return {
        "service": "nexus-shield-ai-engine",
        "ok": True,
        "status": "healthy"
    }



def _require_service_auth(authorization: str | None) -> None:
    expected_token = os.getenv("NEXUS_SERVICE_API_TOKEN", "")
    if len(expected_token) < 32:
        raise HTTPException(
            status_code=503,
            detail={"code": "SCANNER_AUTH_NOT_CONFIGURED"}
        )
    auth_parts = (authorization or "").split(None, 1)
    provided_token = auth_parts[1].strip() if len(auth_parts) == 2 and auth_parts[0].lower() == "bearer" else ""
    if not provided_token or not hmac.compare_digest(provided_token, expected_token):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED"})


# remainder intentionally retained as-is
