"""
DataSentry v2 — Intelligent Dataset Validation & Quality Assurance Platform
FastAPI backend

API workflow:
  POST /api/datasets/profile          → upload file, get dataset_id + profile
  POST /api/datasets/{id}/validate    → run validation, get full quality report
  GET  /api/datasets/{id}/download/clean       → download clean ZIP
  GET  /api/datasets/{id}/download/quarantine  → download quarantine CSV
"""

import io
import os
import re
import uuid
import zipfile
import tempfile
import shutil
from collections import defaultdict
from datetime import datetime, date, timezone
from typing import Optional

import pandas as pd
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# ---------------------------------------------------------------------------
# App Initialization
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DataSentry API",
    version="2.0.0",
    description="Intelligent, Configurable Dataset Validation & Quality Assurance Platform",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "https://datasentry.vercel.app",
        "https://frontend-blue-nine-82.vercel.app",
        "https://frontend-9vzgsyrbb-ria5.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Constants & Configuration
# ---------------------------------------------------------------------------

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB

CANONICAL_COLUMNS = [
    "customer_id",
    "full_name",
    "email",
    "phone_number",
    "age",
    "city",
    "signup_date",
]

ALLOWED_CITIES = {
    "Chennai", "Bangalore", "Hyderabad", "Mumbai", "Delhi", "Kolkata", "Pune"
}

# Regex patterns
EMAIL_RE    = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
PHONE_RE    = re.compile(r"^\d{10}$")
FULLNAME_RE = re.compile(r"^[A-Za-z\s'\-]{2,50}$")   # allows apostrophe & hyphen
DATE_FMTS   = ["%d-%m-%Y", "%Y-%m-%d"]

# ---------------------------------------------------------------------------
# In-memory dataset store
#   dataset_id → {
#       "df": DataFrame,
#       "filename": str,
#       "uploaded_at": str,
#       "tmp_dir": str,         # cleaned up after download or on expiry
#       "validation_result": dict | None,
#   }
# ---------------------------------------------------------------------------

_datasets: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Validation Helpers
# ---------------------------------------------------------------------------

def _is_empty(val) -> bool:
    """True if value is blank / NaN / None."""
    if val is None:
        return True
    if isinstance(val, float) and pd.isna(val):
        return True
    return str(val).strip() == ""


def validate_customer_id(val) -> list[str]:
    if _is_empty(val):
        return ["customer_id is required"]
    s = str(val).strip()
    if s.endswith(".0"):
        s = s[:-2]
    if not re.match(r"^\d+$", s):
        return [f"customer_id must be numeric — got '{s}'"]
    if len(s) != 6:
        return [f"customer_id must be exactly 6 digits — got {len(s)} digit(s)"]
    num = int(s)
    if not (100000 <= num <= 999999):
        return [f"customer_id must be 100000–999999 — got {num}"]
    return []


def validate_full_name(val) -> list[str]:
    if _is_empty(val):
        return ["full_name is required"]
    s = str(val).strip()
    if not FULLNAME_RE.match(s):
        return [f"full_name must be 2–50 characters (letters, spaces, hyphens, apostrophes) — got '{s}'"]
    return []


def validate_email(val) -> list[str]:
    if _is_empty(val):
        return ["email is required"]
    s = str(val).strip()
    if not EMAIL_RE.match(s):
        return [f"email format invalid — got '{s}'"]
    return []


def validate_phone(val) -> list[str]:
    if _is_empty(val):
        return ["phone_number is required"]
    s = str(val).strip()
    # Strip common formatting characters before checking
    cleaned = re.sub(r"[\s\-\(\)\+]", "", s)
    if not PHONE_RE.match(cleaned):
        return [f"phone_number must be exactly 10 digits — got '{s}'"]
    return []


def validate_age(val) -> list[str]:
    if _is_empty(val):
        return ["age is required"]
    s = str(val).strip()
    if s.endswith(".0"):
        s = s[:-2]
    if not re.match(r"^\d+$", s):
        return [f"age must be an integer — got '{s}'"]
    num = int(s)
    if num < 18:
        return [f"age below minimum (18) — got {num}"]
    if num > 100:
        return [f"age above maximum (100) — got {num}"]
    return []


def validate_city(val) -> list[str]:
    if _is_empty(val):
        return ["city is required"]
    s = str(val).strip()
    if s not in ALLOWED_CITIES:
        allowed = ", ".join(sorted(ALLOWED_CITIES))
        return [f"city '{s}' not in allowed list ({allowed})"]
    return []


def validate_signup_date(val) -> list[str]:
    if _is_empty(val):
        return ["signup_date is required"]
    s = str(val).strip()
    parsed: Optional[date] = None
    for fmt in DATE_FMTS:
        try:
            parsed = datetime.strptime(s, fmt).date()
            break
        except ValueError:
            continue
    if parsed is None:
        return [f"signup_date must be DD-MM-YYYY or YYYY-MM-DD — got '{s}'"]
    if parsed > date.today():
        return [f"signup_date cannot be a future date — got '{s}'"]
    return []


# Maps each column name to its validator function
COLUMN_VALIDATORS = {
    "customer_id":  validate_customer_id,
    "full_name":    validate_full_name,
    "email":        validate_email,
    "phone_number": validate_phone,
    "age":          validate_age,
    "city":         validate_city,
    "signup_date":  validate_signup_date,
}

# Human-readable rule descriptions for the frontend
COLUMN_RULES = {
    "customer_id":  ["Required", "Integer", "6 digits", "100000–999999", "Unique"],
    "full_name":    ["Required", "Text", "2–50 chars", "Letters/spaces/hyphens/apostrophes"],
    "email":        ["Required", "Email format"],
    "phone_number": ["Required", "10 digits"],
    "age":          ["Required", "Integer", "18–100"],
    "city":         ["Required", "Allowed values: Chennai, Bangalore, Hyderabad, Mumbai, Delhi, Kolkata, Pune"],
    "signup_date":  ["Required", "DD-MM-YYYY or YYYY-MM-DD", "Must not be future date"],
}


# ---------------------------------------------------------------------------
# Error Categorisation
# ---------------------------------------------------------------------------

def _categorise_error(msg: str) -> str:
    m = msg.lower()
    if "customer_id" in m:
        if "required" in m:     return "Missing Customer ID"
        if "numeric" in m:      return "Invalid Customer ID (non-numeric)"
        if "6 digit" in m:      return "Invalid Customer ID (wrong length)"
        if "100000" in m:       return "Invalid Customer ID (out of range)"
        if "duplicate" in m:    return "Duplicate Customer ID"
        return "Invalid Customer ID"
    if "full_name" in m:
        return "Missing Full Name" if "required" in m else "Invalid Full Name"
    if "email" in m:
        return "Missing Email" if "required" in m else "Invalid Email Format"
    if "phone" in m:
        return "Missing Phone Number" if "required" in m else "Invalid Phone Number"
    if "age" in m:
        if "required" in m:   return "Missing Age"
        if "below" in m:      return "Age Below Minimum (18)"
        if "above" in m:      return "Age Above Maximum (100)"
        return "Invalid Age"
    if "city" in m:
        return "Missing City" if "required" in m else "Invalid City"
    if "signup_date" in m or "date" in m:
        if "required" in m:   return "Missing Signup Date"
        if "future" in m:     return "Future Signup Date"
        return "Invalid Date Format"
    return msg[:60]


# ---------------------------------------------------------------------------
# Endpoint 1 — Profile Dataset
# POST /api/datasets/profile
# ---------------------------------------------------------------------------

@app.post("/api/datasets/profile")
async def profile_dataset(file: UploadFile = File(...)):
    """
    Step 1: Upload a CSV/XLSX file.
    Returns a dataset_id and a profile summary.
    Validates file type, size, schema, and computes basic statistics.
    """
    # ── 1. File type validation ───────────────────────────────────────────────
    filename = file.filename or ""
    is_csv   = filename.lower().endswith(".csv")
    is_excel = filename.lower().endswith((".xlsx", ".xls"))

    if not (is_csv or is_excel):
        raise HTTPException(
            status_code=400,
            detail="Only CSV (.csv) or Excel (.xlsx, .xls) files are accepted.",
        )

    # ── 2. Read file content ──────────────────────────────────────────────────
    contents = await file.read()

    if len(contents) == 0:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is 25 MB.",
        )

    # ── 3. Parse ──────────────────────────────────────────────────────────────
    try:
        if is_csv:
            df = pd.read_csv(io.BytesIO(contents), dtype=str, keep_default_na=False)
        else:
            df = pd.read_excel(io.BytesIO(contents), dtype=str, keep_default_na=False)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {exc}")

    # Normalise column names
    df.columns = [c.strip() for c in df.columns]

    if len(df) == 0:
        raise HTTPException(status_code=422, detail="File has no data rows (header only).")

    # ── 4. Schema validation ──────────────────────────────────────────────────
    uploaded_cols  = set(df.columns)
    required_cols  = set(CANONICAL_COLUMNS)
    missing_cols   = sorted(required_cols - uploaded_cols)
    extra_cols     = sorted(uploaded_cols - required_cols)

    if missing_cols:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Schema mismatch — required columns missing",
                "missing_columns": missing_cols,
                "unexpected_columns": extra_cols,
                "expected_columns": CANONICAL_COLUMNS,
            },
        )

    # ── 5. Data profiling ─────────────────────────────────────────────────────
    total_rows = len(df)

    # Missing value counts per column (blank strings count as missing)
    missing_counts = {
        col: int(df[col].apply(lambda v: _is_empty(v)).sum())
        for col in CANONICAL_COLUMNS
    }
    missing_pct = {
        col: round(missing_counts[col] / total_rows * 100, 1)
        for col in CANONICAL_COLUMNS
    }

    # Duplicate customer_id detection
    cid_col         = df["customer_id"].apply(lambda v: str(v).strip().rstrip(".0") if not _is_empty(v) else "")
    dup_mask        = cid_col.duplicated(keep=False) & (cid_col != "")
    duplicate_count = int(dup_mask.sum())

    # ── 6. Store dataset ──────────────────────────────────────────────────────
    dataset_id = "ds_" + uuid.uuid4().hex[:12]
    _datasets[dataset_id] = {
        "df":               df,
        "filename":         filename,
        "uploaded_at":      datetime.now(timezone.utc).isoformat(),
        "total_rows":       total_rows,
        "tmp_dir":          None,
        "validation_result": None,
    }

    return JSONResponse({
        "dataset_id":      dataset_id,
        "filename":        filename,
        "total_rows":      total_rows,
        "columns":         CANONICAL_COLUMNS,
        "extra_columns":   extra_cols,
        "column_rules":    COLUMN_RULES,
        "missing_pct":     missing_pct,
        "duplicate_count": duplicate_count,
        "uploaded_at":     _datasets[dataset_id]["uploaded_at"],
    })


# ---------------------------------------------------------------------------
# Endpoint 2 — Validate Dataset
# POST /api/datasets/{dataset_id}/validate
# ---------------------------------------------------------------------------

@app.post("/api/datasets/{dataset_id}/validate")
async def validate_dataset(dataset_id: str):
    """
    Step 2: Run the full validation pipeline on a profiled dataset.
    Returns quality score, column quality, error summary, and saves outputs.
    """
    entry = _datasets.get(dataset_id)
    if entry is None:
        raise HTTPException(
            status_code=404,
            detail=f"Dataset '{dataset_id}' not found. Upload a file first via POST /api/datasets/profile.",
        )

    df         = entry["df"]
    total_rows = entry["total_rows"]

    # ── 1. Pre-compute duplicate customer_id set ───────────────────────────────
    cid_series = df["customer_id"].apply(
        lambda v: str(v).strip().rstrip(".0") if not _is_empty(v) else ""
    )
    dup_cids = set(
        cid for cid, cnt in cid_series.value_counts().items()
        if cnt > 1 and cid != ""
    )

    # ── 2. Row-level validation ────────────────────────────────────────────────
    clean_indices:     list[int]  = []
    quarantine_records: list[dict] = []
    error_frequency:   dict       = defaultdict(int)

    # Per-column valid count tracker
    col_valid_counts = {col: 0 for col in CANONICAL_COLUMNS}

    for idx, row in df.iterrows():
        row_errors: list[str] = []
        col_errors: dict[str, list[str]] = {}

        for col, validator in COLUMN_VALIDATORS.items():
            errs = validator(row.get(col))
            col_errors[col] = errs
            if errs:
                row_errors.extend(errs)
            else:
                col_valid_counts[col] += 1

        # Duplicate check — flag ALL occurrences
        cid = cid_series[idx]
        if cid in dup_cids:
            dup_err = f"Duplicate customer_id: {cid}"
            row_errors.append(dup_err)
            col_errors.setdefault("customer_id", []).append(dup_err)

        if row_errors:
            record = row.to_dict()
            record["_validation_errors"] = row_errors
            record["Quarantine_Reason"]  = "; ".join(row_errors)
            quarantine_records.append(record)
            for err in row_errors:
                error_frequency[_categorise_error(err)] += 1
        else:
            clean_indices.append(idx)

    # ── 3. Build DataFrames ────────────────────────────────────────────────────
    clean_df      = df.loc[clean_indices].reset_index(drop=True)
    quarantine_df = pd.DataFrame(quarantine_records)

    # ── 4. Quality metrics ─────────────────────────────────────────────────────
    clean_count      = len(clean_df)
    quarantine_count = len(quarantine_records)
    quality_score    = round(clean_count / total_rows * 100, 1) if total_rows > 0 else 0.0
    column_quality   = {
        col: round(col_valid_counts[col] / total_rows * 100, 1) if total_rows > 0 else 0.0
        for col in CANONICAL_COLUMNS
    }
    duplicate_count  = int(sum(1 for cid in cid_series if cid in dup_cids))

    # ── 5. Persist output files ────────────────────────────────────────────────
    tmp_dir = tempfile.mkdtemp()

    # Clean ZIP (1,000-row chunks)
    zip_path = os.path.join(tmp_dir, "validated_chunks.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if len(clean_df) > 0:
            chunk_size = 1000
            num_chunks = max(1, (len(clean_df) + chunk_size - 1) // chunk_size)
            for i in range(num_chunks):
                chunk     = clean_df.iloc[i * chunk_size: (i + 1) * chunk_size]
                csv_bytes = chunk.to_csv(index=False).encode("utf-8")
                zf.writestr(f"chunk_{i + 1:04d}.csv", csv_bytes)
        else:
            zf.writestr("chunk_0001.csv", df.iloc[0:0].to_csv(index=False))

    # Quarantine CSV — drop internal list column before saving
    quarantine_path = os.path.join(tmp_dir, "quarantined_errors.csv")
    if len(quarantine_df) > 0:
        save_qdf = quarantine_df.drop(columns=["_validation_errors"], errors="ignore")
        save_qdf.to_csv(quarantine_path, index=False)
    else:
        empty_cols = list(df.columns) + ["Quarantine_Reason"]
        pd.DataFrame(columns=empty_cols).to_csv(quarantine_path, index=False)

    # Clean up old tmp_dir if re-validating
    old_tmp = entry.get("tmp_dir")
    if old_tmp and os.path.exists(old_tmp) and old_tmp != tmp_dir:
        shutil.rmtree(old_tmp, ignore_errors=True)

    # ── 6. Update store ────────────────────────────────────────────────────────
    entry["tmp_dir"]  = tmp_dir
    entry["validation_result"] = {
        "total_rows":      total_rows,
        "clean_count":     clean_count,
        "quarantine_count": quarantine_count,
        "quality_score":   quality_score,
        "duplicate_count": duplicate_count,
        "error_summary":   dict(error_frequency),
        "column_quality":  column_quality,
    }

    return JSONResponse(entry["validation_result"])


# ---------------------------------------------------------------------------
# Endpoint 3 — Download Clean ZIP
# GET /api/datasets/{dataset_id}/download/clean
# ---------------------------------------------------------------------------

@app.get("/api/datasets/{dataset_id}/download/clean")
async def download_clean(dataset_id: str):
    entry = _datasets.get(dataset_id)
    if not entry or not entry.get("tmp_dir"):
        raise HTTPException(
            status_code=404,
            detail="No validated data found. Run POST /api/datasets/{id}/validate first.",
        )
    path = os.path.join(entry["tmp_dir"], "validated_chunks.zip")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Clean data file not found.")
    return FileResponse(path, media_type="application/zip", filename="validated_chunks.zip")


# ---------------------------------------------------------------------------
# Endpoint 4 — Download Quarantine CSV
# GET /api/datasets/{dataset_id}/download/quarantine
# ---------------------------------------------------------------------------

@app.get("/api/datasets/{dataset_id}/download/quarantine")
async def download_quarantine(dataset_id: str):
    entry = _datasets.get(dataset_id)
    if not entry or not entry.get("tmp_dir"):
        raise HTTPException(
            status_code=404,
            detail="No validated data found. Run POST /api/datasets/{id}/validate first.",
        )
    path = os.path.join(entry["tmp_dir"], "quarantined_errors.csv")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Quarantine file not found.")
    return FileResponse(path, media_type="text/csv", filename="quarantined_errors.csv")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return {
        "status":  "ok",
        "service": "DataSentry v2 API",
        "version": "2.0.0",
    }


# ---------------------------------------------------------------------------
# Entry-point (local dev)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
