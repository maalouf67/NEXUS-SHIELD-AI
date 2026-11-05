
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
    return {
        "service": "nexus-shield-ai-engine",
        "ok": True,
        "status": "healthy",
        "ai_provider": "openai",
        "ai_configured": bool(os.getenv("OPENAI_API_KEY"))
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


def _scanner_options() -> dict:
    host = os.getenv("CLAMD_HOST", "clamav").strip()
    raw_port = os.getenv("CLAMD_PORT", "3310").strip()
    try:
        port = int(raw_port)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail={"code": "SCANNER_CONFIG_INVALID"}) from exc
    if not host or not 1 <= port <= 65535:
        raise HTTPException(status_code=503, detail={"code": "SCANNER_CONFIG_INVALID"})
    return {"clamd_host": host, "clamd_port": port}


def _max_upload_bytes() -> int:
    raw_limit = os.getenv("NEXUS_MAX_UPLOAD_BYTES", str(DEFAULT_MAX_FILE_BYTES))
    try:
        limit = int(raw_limit)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail={"code": "UPLOAD_LIMIT_CONFIG_INVALID"}) from exc
    if limit < 1 or limit > DEFAULT_MAX_FILE_BYTES:
        raise HTTPException(status_code=503, detail={"code": "UPLOAD_LIMIT_CONFIG_INVALID"})
    return limit


@app.post("/scan-file")
async def scan_file(
    request: ScanFileRequest,
    authorization: str | None = Header(default=None),
    x_nexus_user_id: str | None = Header(default=None, alias="X-NEXUS-USER-ID"),
):
    _require_service_auth(authorization)
    if not x_nexus_user_id:
        raise HTTPException(status_code=400, detail={"code": "OWNER_ID_REQUIRED"})
    quarantine_dir = _owner_quarantine_path(x_nexus_user_id)

    try:
        result = await run_in_threadpool(
            scan_quarantined_file,
            request.sample_id,
            quarantine_dir,
            **_scanner_options(),
        )
        return {"status": "ok", "scan": result}
    except ScanInputError as exc:
        raise HTTPException(status_code=400, detail={"code": "INVALID_SAMPLE", "message": str(exc)})
    except QuarantineFileNotFound:
        raise HTTPException(status_code=404, detail={"code": "SAMPLE_NOT_FOUND"})
    except ScannerUnavailable:
        raise HTTPException(status_code=503, detail={"code": "SCANNER_UNAVAILABLE", "sample_id": request.sample_id})
    except ScannerTimeout:
        raise HTTPException(status_code=504, detail={"code": "SCAN_TIMEOUT", "sample_id": request.sample_id})
    except ScannerExecutionError:
        raise HTTPException(status_code=502, detail={"code": "SCANNER_ERROR", "sample_id": request.sample_id})


@app.post("/scan-upload")
async def scan_upload(
    request: Request,
    authorization: str | None = Header(default=None),
    x_nexus_user_id: str | None = Header(default=None, alias="X-NEXUS-USER-ID"),
):
    _require_service_auth(authorization)
    if not x_nexus_user_id:
        raise HTTPException(status_code=400, detail={"code": "OWNER_ID_REQUIRED"})
    quarantine_dir = _owner_quarantine_path(x_nexus_user_id)
    max_upload_bytes = _max_upload_bytes()

    content_type = request.headers.get("content-type", "")
    if not content_type.lower().startswith("multipart/form-data;") or "boundary=" not in content_type.lower():
        raise HTTPException(status_code=415, detail={"code": "MULTIPART_REQUIRED"})

    raw_length = request.headers.get("content-length")
    if raw_length is None:
        raise HTTPException(status_code=411, detail={"code": "CONTENT_LENGTH_REQUIRED"})
    try:
        content_length = int(raw_length)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "INVALID_CONTENT_LENGTH"}) from exc
    if content_length < 1:
        raise HTTPException(status_code=400, detail={"code": "EMPTY_REQUEST"})
    if content_length > max_upload_bytes + 64 * 1024:
        raise HTTPException(status_code=413, detail={"code": "UPLOAD_TOO_LARGE"})

    try:
        form = await request.form(max_files=1, max_fields=0, max_part_size=64 * 1024)
    except Exception:
        raise HTTPException(status_code=400, detail={"code": "INVALID_MULTIPART"})
    try:
        if set(form.keys()) != {"file"} or len(form.getlist("file")) != 1:
            raise HTTPException(status_code=400, detail={"code": "ONE_FILE_REQUIRED"})
        upload = form.get("file")
        if not isinstance(upload, StarletteUploadFile):
            raise HTTPException(status_code=400, detail={"code": "INVALID_FILE_FIELD"})

        try:
            staged = await run_in_threadpool(
                stage_uploaded_file,
                upload.file,
                quarantine_dir,
                max_file_bytes=max_upload_bytes,
            )
        except UploadTooLarge:
            raise HTTPException(status_code=413, detail={"code": "UPLOAD_TOO_LARGE"})
        except ScanInputError as exc:
            raise HTTPException(status_code=400, detail={"code": "INVALID_UPLOAD", "message": str(exc)})
        except ScannerUnavailable:
            raise HTTPException(status_code=503, detail={"code": "QUARANTINE_UNAVAILABLE"})

        sample_id = staged["sample_id"]
        try:
            result = await run_in_threadpool(
                scan_quarantined_file,
                sample_id,
                quarantine_dir,
                max_file_bytes=max_upload_bytes,
                **_scanner_options(),
            )
            return {"status": "ok", "scan": result}
        except ScannerUnavailable:
            raise HTTPException(status_code=503, detail={"code": "SCANNER_UNAVAILABLE", "sample_id": sample_id, "size_bytes": staged["size_bytes"]})
        except ScannerTimeout:
            raise HTTPException(status_code=504, detail={"code": "SCAN_TIMEOUT", "sample_id": sample_id, "size_bytes": staged["size_bytes"]})
        except ScannerExecutionError:
            raise HTTPException(status_code=502, detail={"code": "SCANNER_ERROR", "sample_id": sample_id, "size_bytes": staged["size_bytes"]})
        except ScanInputError:
            raise HTTPException(status_code=400, detail={"code": "INVALID_QUARANTINED_SAMPLE", "sample_id": sample_id, "size_bytes": staged["size_bytes"]})
    finally:
        await form.close()


@app.delete("/samples/{sample_id}")
async def delete_sample(
    sample_id: str,
    authorization: str | None = Header(default=None),
    x_nexus_user_id: str | None = Header(default=None, alias="X-NEXUS-USER-ID"),
):
    _require_service_auth(authorization)
    if not x_nexus_user_id:
        raise HTTPException(status_code=400, detail={"code": "OWNER_ID_REQUIRED"})
    quarantine_dir = _owner_quarantine_path(x_nexus_user_id)
    try:
        deleted = await run_in_threadpool(delete_quarantined_file, sample_id, quarantine_dir)
        return {"status": "ok", "deleted": deleted}
    except ScanInputError:
        raise HTTPException(status_code=400, detail={"code": "INVALID_SAMPLE"})
    except ScannerUnavailable:
        raise HTTPException(status_code=503, detail={"code": "QUARANTINE_UNAVAILABLE"})
