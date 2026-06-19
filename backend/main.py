import io
import os
import re
import zipfile
import tempfile
from collections import defaultdict
from typing import Optional

import pandas as pd
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# ---------------------------------------------------------------------------
# App Initialization
# ---------------------------------------------------------------------------

app = FastAPI(title="DataSentry API", version="1.0.0", description="Enterprise CSV transaction data validation platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://datasentry.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Configuration — Country Phone Rules
# ---------------------------------------------------------------------------

PHONE_RULES: dict[str, dict] = {
    "IN": {
        "pattern": re.compile(r"^\d{10}$"),
        "description": "exactly 10 digits",
    },
}

REQUIRED_FIELDS = ["customer_id", "full_name", "city"]

# ---------------------------------------------------------------------------
# In-memory storage for the latest processed files
# ---------------------------------------------------------------------------

_store: dict = {
    "clean_zip_path": None,
    "quarantine_csv_path": None,
}

# ---------------------------------------------------------------------------
# Validation Helpers
# ---------------------------------------------------------------------------


def validate_phone(phone: Optional[str]) -> list[str]:
    """Return a list of error strings; empty list means valid."""
    errors: list[str] = []

    if not phone or pd.isna(phone):
        errors.append("Missing phone_number")
        return errors

    phone_str = str(phone).strip()
    rule = PHONE_RULES["IN"]

    if not rule["pattern"].match(phone_str):
        errors.append(
            f"Invalid phone (expected {rule['description']}): got '{phone_str}'"
        )

    return errors


def validate_date(signup_date: Optional[str]) -> list[str]:
    """Validate DD-MM-YYYY format strictly."""
    errors: list[str] = []

    if not signup_date or pd.isna(signup_date):
        errors.append("Missing signup_date")
        return errors

    date_str = str(signup_date).strip()
    try:
        parsed = pd.to_datetime(date_str, format="%d-%m-%Y", errors="raise")
        # Extra guard: ensure the string representation is exactly DD-MM-YYYY
        if parsed.strftime("%d-%m-%Y") != date_str:
            raise ValueError("Format mismatch")
    except (ValueError, Exception):
        errors.append(f"Invalid signup_date format (expected DD-MM-YYYY): got '{date_str}'")

    return errors


def validate_required_fields(row: pd.Series) -> list[str]:
    """Check that required fields are not empty or null."""
    errors: list[str] = []

    for field in REQUIRED_FIELDS:
        value = row.get(field, None)
        if value is None or pd.isna(value) or str(value).strip() == "":
            errors.append(f"Missing required field: {field}")

    return errors


# ---------------------------------------------------------------------------
# Core Upload & Validation Endpoint
# ---------------------------------------------------------------------------


@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)):
    # ── 1. Read & parse ──────────────────────────────────────────────────────
    is_csv = file.filename.lower().endswith(".csv")
    is_excel = file.filename.lower().endswith((".xlsx", ".xls"))
    
    if not (is_csv or is_excel):
        raise HTTPException(status_code=400, detail="Only CSV or Excel (.xlsx, .xls) files are accepted.")

    contents = await file.read()
    try:
        if is_csv:
            df = pd.read_csv(io.BytesIO(contents), dtype=str, keep_default_na=False)
        else:
            df = pd.read_excel(io.BytesIO(contents), dtype=str, keep_default_na=False)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {exc}")

    # Normalise column names: strip whitespace
    df.columns = [c.strip() for c in df.columns]

    total_rows = len(df)
    if total_rows == 0:
        raise HTTPException(status_code=422, detail="Uploaded CSV has no data rows.")

    # ── 2. Row-level validation ───────────────────────────────────────────────
    clean_indices: list[int] = []
    quarantine_records: list[dict] = []

    error_frequency: dict[str, int] = defaultdict(int)

    for idx, row in df.iterrows():
        row_errors: list[str] = []

        # Phone
        row_errors.extend(
            validate_phone(row.get("phone_number"))
        )

        # Date
        row_errors.extend(validate_date(row.get("signup_date")))

        # Required fields
        row_errors.extend(validate_required_fields(row))

        if row_errors:
            record = row.to_dict()
            record["Quarantine_Reason"] = "; ".join(row_errors)
            quarantine_records.append(record)
            # Tally each distinct error type (using first token for summary key)
            for err in row_errors:
                # Use a stable category key
                category = _categorise_error(err)
                error_frequency[category] += 1
        else:
            clean_indices.append(idx)

    # ── 3. Build dataframes ───────────────────────────────────────────────────
    clean_df = df.loc[clean_indices].reset_index(drop=True)
    quarantine_df = pd.DataFrame(quarantine_records)

    # ── 4. Persist outputs to temp files ─────────────────────────────────────
    tmp_dir = tempfile.mkdtemp()

    # --- Clean ZIP (chunked at 1,000 rows) ---
    zip_path = os.path.join(tmp_dir, "validated_chunks.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if len(clean_df) > 0:
            chunk_size = 1000
            num_chunks = max(1, (len(clean_df) + chunk_size - 1) // chunk_size)
            for i in range(num_chunks):
                chunk = clean_df.iloc[i * chunk_size : (i + 1) * chunk_size]
                csv_bytes = chunk.to_csv(index=False).encode("utf-8")
                zf.writestr(f"chunk_{i + 1:04d}.csv", csv_bytes)
        else:
            # Produce an empty placeholder so the ZIP is always valid
            zf.writestr("chunk_0001.csv", df.iloc[0:0].to_csv(index=False))

    # --- Quarantine CSV ---
    quarantine_path = os.path.join(tmp_dir, "quarantined_errors.csv")
    if len(quarantine_df) > 0:
        quarantine_df.to_csv(quarantine_path, index=False)
    else:
        # Write header-only file
        empty_cols = list(df.columns) + ["Quarantine_Reason"]
        pd.DataFrame(columns=empty_cols).to_csv(quarantine_path, index=False)

    # ── 5. Store paths globally so download endpoints can serve them ──────────
    _store["clean_zip_path"] = zip_path
    _store["quarantine_csv_path"] = quarantine_path

    # ── 6. Build metrics payload ──────────────────────────────────────────────
    return JSONResponse(
        {
            "total_rows": total_rows,
            "clean_count": len(clean_df),
            "quarantine_count": len(quarantine_df),
            "error_summary": dict(error_frequency),
        }
    )


# ---------------------------------------------------------------------------
# Download Endpoints
# ---------------------------------------------------------------------------


@app.get("/api/download/clean")
async def download_clean():
    path = _store.get("clean_zip_path")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No clean data available yet. Upload a CSV first.")
    return FileResponse(
        path,
        media_type="application/zip",
        filename="validated_chunks.zip",
    )


@app.get("/api/download/quarantine")
async def download_quarantine():
    path = _store.get("quarantine_csv_path")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No quarantine data available yet. Upload a CSV first.")
    return FileResponse(
        path,
        media_type="text/csv",
        filename="quarantined_errors.csv",
    )


# ---------------------------------------------------------------------------
# Health-check
# ---------------------------------------------------------------------------


@app.get("/")
async def root():
    return {"status": "ok", "service": "Aura Data Engine API"}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _categorise_error(error_msg: str) -> str:
    """Map raw error strings to stable category keys for the summary dict."""
    msg = error_msg.lower()
    if "phone" in msg:
        return "Invalid Phone Number"
    if "signup_date" in msg or "date" in msg:
        return "Invalid Date Format"
    if "missing required field" in msg:
        # Extract the field name
        parts = error_msg.split(":")
        field = parts[-1].strip() if len(parts) > 1 else "required field"
        return f"Missing Field: {field}"
    return error_msg[:60]  # fallback: first 60 chars


# ---------------------------------------------------------------------------
# Entry-point (local dev)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
