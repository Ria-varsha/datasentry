# DataSentry v2 — Intelligent Dataset Validation & Quality Assurance Platform

A production-ready, full-stack data validation platform built with **FastAPI** (Python) and **React + Vite + Tailwind CSS**.
Deployable on **Render** (backend) and **Vercel** (frontend) — no Docker required.

---

## What It Does

DataSentry acts as a quality gateway for your CSV datasets:

1. **Uploads** a CSV or XLSX file (max 25 MB) through a drag-and-drop interface
2. **Schema validates** — checks all 7 required columns are present before processing
3. **Profiles** the dataset — missing value %, duplicate detection, column type detection
4. **Validates** every record against 7 configurable rules:
   - `customer_id` — Required, integer, exactly 6 digits (100000–999999), **unique**
   - `full_name` — Required, 2–50 characters (letters, spaces, hyphens, apostrophes)
   - `email` — Required, valid email format
   - `phone_number` — Required, exactly 10 digits
   - `age` — Required, integer, 18–100 (inclusive)
   - `city` — Required, allowed values: Chennai / Bangalore / Hyderabad / Mumbai / Delhi / Kolkata / Pune
   - `signup_date` — Required, DD-MM-YYYY or YYYY-MM-DD only, must not be a future date
5. **Classifies** every row:
   - ✅ **Valid** → split into 1,000-row CSV chunks, bundled as `validated_chunks.zip`
   - ⚠️ **Quarantine** → `quarantined_errors.csv` with `Quarantine_Reason` column
6. **Scores** the dataset:
   - `Quality Score = (valid_records / total_records) × 100`
   - `Column Quality = (valid_values_in_column / total_records) × 100` per column
7. **Reports** — animated quality ring, per-column quality bars, ranked error breakdown
8. **Downloads** — one-click clean ZIP and quarantine CSV downloads

---

## Project Structure

```
datasentry/
├── backend/
│   ├── main.py                    # FastAPI v2 — profiling + validation engine
│   ├── requirements.txt           # Python dependencies
│   ├── generate_test_data.py      # Generates canonical v2 test datasets
│   └── tests/
│       ├── __init__.py
│       └── test_validation.py     # 50+ pytest tests (all scenarios)
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Root — 2-phase upload state machine
│   │   ├── index.css              # Dark-themed design system
│   │   ├── main.jsx               # React entry point
│   │   └── components/
│   │       ├── UploadZone.jsx     # Drop zone + 9-step pipeline animation
│   │       ├── Dashboard.jsx      # Metrics, downloads, error breakdown
│   │       ├── QualityScore.jsx   # Animated SVG quality ring
│   │       └── ColumnQuality.jsx  # Animated per-column quality bars
│   ├── public/
│   ├── .env.example
│   ├── .env.local
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
├── sample_test.csv                # 20-row test CSV (10 valid, 10 invalid, 1 duplicate)
├── .gitignore
└── README.md
```

---

## Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
cp .env.example .env.local     # already points to localhost:8000
npm install
npm run dev
```

- App: http://localhost:5173

---

## Running Tests

```bash
cd backend
pytest tests/test_validation.py -v
```

Expected output:
```
tests/test_validation.py::test_health_check                      PASSED
tests/test_validation.py::test_reject_non_csv                    PASSED
tests/test_validation.py::test_reject_empty_file                 PASSED
...
50+ tests in ~3s
```

### Generate a larger test dataset

```bash
cd backend
python generate_test_data.py --rows 5000 --out big_test.csv --valid 0.75
```

---

## API Reference

### Workflow

```
POST /api/datasets/profile              → { dataset_id, profile }
POST /api/datasets/{id}/validate        → { quality_score, column_quality, ... }
GET  /api/datasets/{id}/download/clean       → validated_chunks.zip
GET  /api/datasets/{id}/download/quarantine  → quarantined_errors.csv
```

### POST /api/datasets/profile

Upload a file. Returns a `dataset_id` and dataset statistics.

**Request:** `multipart/form-data` with `file` field (CSV or XLSX, max 25 MB)

**Response:**
```json
{
  "dataset_id":    "ds_abc123456789",
  "filename":      "customers.csv",
  "total_rows":    1000,
  "columns":       ["customer_id", "full_name", "email", "phone_number", "age", "city", "signup_date"],
  "column_rules":  { "customer_id": ["Required", "Integer", "6 digits", "Unique"], ... },
  "missing_pct":   { "customer_id": 0.0, "email": 2.3, ... },
  "duplicate_count": 5,
  "uploaded_at":   "2026-08-11T15:30:00Z"
}
```

**Error (schema mismatch):**
```json
{
  "detail": {
    "error": "Schema mismatch — required columns missing",
    "missing_columns": ["customer_id", "age"],
    "unexpected_columns": ["name"],
    "expected_columns": [...]
  }
}
```

### POST /api/datasets/{dataset_id}/validate

Run the full validation pipeline. Must be called after profile.

**Response:**
```json
{
  "total_rows":       1000,
  "clean_count":      850,
  "quarantine_count": 150,
  "quality_score":    85.0,
  "duplicate_count":  3,
  "error_summary": {
    "Invalid Email Format":   52,
    "Age Below Minimum (18)": 41,
    "Invalid Phone Number":   31,
    "Invalid City":           26
  },
  "column_quality": {
    "customer_id":  100.0,
    "full_name":     96.2,
    "email":         89.4,
    "phone_number":  94.1,
    "age":           82.0,
    "city":          91.3,
    "signup_date":   97.8
  }
}
```

### GET /api/datasets/{id}/download/clean
Returns `validated_chunks.zip` — clean rows split into 1,000-row CSV chunks.

### GET /api/datasets/{id}/download/quarantine
Returns `quarantined_errors.csv` — invalid rows with `Quarantine_Reason` column.

---

## CSV Format

| Column | Rule |
|---|---|
| `customer_id` | Required · Integer · Exactly 6 digits (100000–999999) · **Unique** |
| `full_name` | Required · 2–50 chars · Letters, spaces, hyphens, apostrophes |
| `email` | Required · Valid email format |
| `phone_number` | Required · Exactly 10 digits |
| `age` | Required · Integer · 18–100 (inclusive) |
| `city` | Required · One of: Chennai, Bangalore, Hyderabad, Mumbai, Delhi, Kolkata, Pune |
| `signup_date` | Required · DD-MM-YYYY or YYYY-MM-DD · Must not be a future date |

> Additional columns in the CSV are preserved in outputs but not validated.

---

## Quality Score Formula

```
Quality Score     = (valid_records / total_records) × 100
Column Quality %  = (valid_values_in_column / total_records) × 100
```

| Score | Health Label |
|---|---|
| ≥ 90 | Excellent |
| ≥ 75 | Good |
| ≥ 50 | Fair |
| < 50 | Critical |

---

## Security

- File type validated by extension (`.csv`, `.xlsx`, `.xls`)
- File size limited to 25 MB
- Empty files rejected before processing
- File content parsed before any validation begins (malformed files return 422)
- Temporary files stored server-side per `dataset_id` — not constructed from user filenames
- No secrets in repository — use `.env.local` (gitignored)

---

## Cloud Deployment

### Backend → Render

| Setting | Value |
|---|---|
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Runtime | Python 3.11+ |

### Frontend → Vercel

1. Import the `frontend/` directory
2. Add environment variable: `VITE_API_URL` = `https://your-service.onrender.com`
3. Deploy

---

## Roadmap (Stage 3 — Not Yet Implemented)

**Configurable Cross-Column Validation Rules**

The next planned feature allows users to define relationships between columns:

```
total_amount = quantity × unit_price
```

This will extend the validation engine with a `CrossColumnRule` type and integrate with:
- Validation engine
- Error reporting & quarantine
- Quality score contribution
- Frontend rule configuration UI
- Full regression test coverage

This feature is intentionally deferred to demonstrate the AI change-loop in the Tactive assessment.
