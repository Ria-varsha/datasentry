"""
DataSentry v2 - Intelligent Dataset Validation and Quality Assurance Platform
FastAPI backend

API workflow:
  POST /api/datasets/profile          - upload file, get dataset_id + full profile
  GET  /api/rules                     - get rule manifest
  POST /api/rules                     - toggle rules on/off
  POST /api/datasets/{id}/validate    - run validation, get full quality report
  GET  /api/datasets/{id}/download/clean      - download clean ZIP
  GET  /api/datasets/{id}/download/quarantine - download quarantine CSV
  POST /api/debug/inject-bug          - deliberately break a rule (Red/Green demo)
  POST /api/debug/fix-bug             - restore broken rule
"""

import io
import os
import uuid
import zipfile
import tempfile
import shutil
from collections import defaultdict
from datetime import datetime, timezone

import pandas as pd
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from rules import (
    build_default_rules, rules_to_manifest, _is_empty,
    CANONICAL_COLUMNS, Rule, RangeRule, ChennaiAgeRule,
)

# ---------------------------------------------------------------------------
# App Initialization
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DataSentry API",
    version="2.0.0",
    description="Intelligent, Configurable Dataset Validation and Quality Assurance Platform",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "https://datasentry.vercel.app",
        "https://frontend-blue-nine-82.vercel.app",
        "https://frontend-9vzgsyrbb-ria5.vercel.app",
        "https://frontend-ria5.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB

# Global rule registry (toggle-able per session)
_datasets: dict[str, dict] = {}
_rules: list[Rule] = build_default_rules()

def _cleanup_old_datasets():
    """Security/Hygiene: Clean up temporary files older than 1 hour to prevent disk/memory leaks."""
    now = datetime.now(timezone.utc)
    to_delete = []
    for d_id, data in _datasets.items():
        upload_time_str = data.get("uploaded_at")
        if upload_time_str:
            try:
                dt = datetime.fromisoformat(upload_time_str)
                if (now - dt).total_seconds() > 3600:
                    to_delete.append(d_id)
            except:
                pass
    for d_id in to_delete:
        tmp_dir = _datasets[d_id].get("tmp_dir")
        if tmp_dir and os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)
        del _datasets[d_id]

# ---------------------------------------------------------------------------
# In-memory dataset store
# ---------------------------------------------------------------------------


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
        if "required" in m:       return "Missing Age"
        if "below" in m:          return "Age Below Minimum (18)"
        if "above" in m:          return "Age Above Maximum (100)"
        if "chennai" in m:        return "Chennai Age Violation (cross-column)"
        return "Invalid Age"
    if "city" in m:
        return "Missing City" if "required" in m else "Invalid City"
    if "signup_date" in m or "date" in m:
        if "required" in m:   return "Missing Signup Date"
        if "future" in m:     return "Future Signup Date"
        return "Invalid Date Format"
    return msg[:60]


# ---------------------------------------------------------------------------
# Rule Endpoints
# GET  /api/rules
# POST /api/rules
# ---------------------------------------------------------------------------

@app.get("/api/rules")
async def get_rules():
    return JSONResponse({"rules": rules_to_manifest(_rules)})


@app.post("/api/rules")
async def update_rules(updates: dict):
    """Body: {"rule_id": true/false, ...}  Toggles rules on/off by id."""
    updated = []
    for rule in _rules:
        if rule.id in updates:
            rule.enabled = bool(updates[rule.id])
            updated.append(rule.id)
    return JSONResponse({"updated": updated, "rules": rules_to_manifest(_rules)})



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
    _cleanup_old_datasets()

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

    # Column rule descriptions from active rules
    column_rules: dict = defaultdict(list)
    for r in _rules:
        if r.enabled:
            column_rules[r.field].append(r.description)

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
        "total_columns":   len(CANONICAL_COLUMNS),
        "columns":         CANONICAL_COLUMNS,
        "extra_columns":   extra_cols,
        "column_rules":    column_rules,
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

    clean_indices:      list[int]  = []
    quarantine_records: list[dict] = []
    error_frequency:    dict       = defaultdict(int)
    col_valid_counts = {col: 0 for col in CANONICAL_COLUMNS}

    for idx, row in df.iterrows():
        row_errors: list[dict] = []   # structured errors now
        row_dict = row.to_dict()

        for rule in _rules:
            if not rule.enabled:
                continue
            field_val = row.get(rule.field)
            errs = rule.validate(field_val, row=row_dict)
            for e in errs:
                row_errors.append(e.to_dict())

        # Duplicate check (always active)
        cid = cid_series[idx]
        if cid in dup_cids:
            row_errors.append({
                "field":   "customer_id",
                "value":   cid,
                "rule":    "unique",
                "message": f"Duplicate customer_id: {cid}",
            })

        # Track per-column validity
        error_fields = {e["field"] for e in row_errors}
        for col in CANONICAL_COLUMNS:
            if col not in error_fields:
                col_valid_counts[col] += 1

        if row_errors:
            record = row_dict.copy()
            record["_validation_errors"] = row_errors
            record["Quarantine_Reason"]  = "; ".join(e["message"] for e in row_errors)
            quarantine_records.append(record)
            for e in row_errors:
                error_frequency[_categorise_error(e["message"])] += 1
        else:
            clean_indices.append(idx)

    # ── 3. Build DataFrames ────────────────────────────────────────────────────
    clean_df      = df.loc[clean_indices].reset_index(drop=True)
    quarantine_df = pd.DataFrame(quarantine_records)

    clean_count      = len(clean_df)
    quarantine_count = len(quarantine_records)
    quality_score    = round(clean_count / total_rows * 100, 1) if total_rows > 0 else 0.0
    column_quality   = {
        col: round(col_valid_counts[col] / total_rows * 100, 1) if total_rows > 0 else 0.0
        for col in CANONICAL_COLUMNS
    }
    duplicate_count  = int(sum(1 for cid in cid_series if cid in dup_cids))

    # Build sample of invalid records for the frontend drill-down (max 50)
    sample_invalid = []
    for rec in quarantine_records[:50]:
        sample_invalid.append({
            "row":    {col: rec.get(col, "") for col in CANONICAL_COLUMNS},
            "errors": rec["_validation_errors"],
            "reason": rec["Quarantine_Reason"],
        })

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

    entry["tmp_dir"]  = tmp_dir
    result = {
        "total_rows":       total_rows,
        "clean_count":      clean_count,
        "quarantine_count": quarantine_count,
        "quality_score":    quality_score,
        "quality_formula":  f"{clean_count} / {total_rows} x 100 = {quality_score}%",
        "duplicate_count":  duplicate_count,
        "error_summary":    dict(error_frequency),
        "column_quality":   column_quality,
        "sample_invalid":   sample_invalid,
    }
    entry["validation_result"] = result
    return JSONResponse(result)


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
# Debug endpoints - Deliberate Red/Green demonstration for assessment
# ---------------------------------------------------------------------------

@app.post("/api/debug/inject-bug")
async def inject_bug(token: str = ""):
    """DELIBERATE BUG: Changes age minimum from 18 to 25.
    Rows with age 18-24 will now fail - demonstrating the Red run."""
    if token != "datasentry-debug":
        raise HTTPException(status_code=403, detail="Invalid or missing debug token.")
    changed = []
    for rule in _rules:
        if rule.id == "age_range" and hasattr(rule, "min_val"):
            rule.min_val = 25  # BUG: was 18
            changed.append(rule.id)
    return JSONResponse({
        "status":        "bug_injected",
        "change":        "age_range min raised from 18 to 25",
        "changed_rules": changed,
        "warning":       "Tests will now FAIL for rows with age 18-24",
    })


@app.post("/api/debug/fix-bug")
async def fix_bug(token: str = ""):
    """Restores age minimum to the correct value (18). Green run."""
    if token != "datasentry-debug":
        raise HTTPException(status_code=403, detail="Invalid or missing debug token.")
    changed = []
    for rule in _rules:
        if rule.id == "age_range" and hasattr(rule, "min_val"):
            rule.min_val = 18  # FIX: restore correct minimum
            changed.append(rule.id)
    return JSONResponse({
        "status":        "bug_fixed",
        "change":        "age_range min restored to 18",
        "changed_rules": changed,
    })


@app.get("/api/debug/status")
async def debug_status():
    """Returns current state of mutable rules for test verification."""
    rule_state = {}
    for r in _rules:
        if hasattr(r, "min_val") and r.id == "age_range":
            rule_state[r.id] = {"min_val": r.min_val, "max_val": r.max_val}
        if hasattr(r, "min_age") and r.id == "chennai_age_rule":
            rule_state[r.id] = {"min_age": r.min_age}
    return JSONResponse({"rules": rule_state})


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return {"status": "ok", "service": "DataSentry v2 API", "version": "2.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
