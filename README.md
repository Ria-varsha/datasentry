# DataSentry — Enterprise Transaction Data Validation Platform

A production-ready, full-stack CSV validation platform built with **FastAPI** (Python) and **React + Vite + Tailwind CSS**.
Deployable natively on **Render** (backend) and **Vercel** (frontend) — no Docker required.

---

## What It Does

DataSentry acts as a sentinel/guard for your transaction CSV data:

1. **Uploads** a CSV file through a drag-and-drop interface
2. **Validates** every row against three rule sets:
   - **Phone** — country-code-driven regex (SG: `^[89]\d{7}$` / IN: `^\d{10}$`)
   - **Date** — strict `YYYY-MM-DD` format only
   - **Required fields** — `order_id`, `product_id`, `payment_mode` must be non-empty
3. **Routes** rows to two streams:
   - ✅ **Clean** → split into 1,000-row CSV chunks, bundled as `validated_chunks.zip`
   - ⚠️ **Quarantine** → saved as `quarantined_errors.csv` with a `Quarantine_Reason` column
4. **Returns** a JSON metrics payload (total, clean, quarantined, error breakdown)
5. **Provides** instant download buttons for both output files

---

## Project Structure

```
datasentry/
├── backend/
│   ├── main.py              # FastAPI app — validation engine + download endpoints
│   ├── requirements.txt     # Python dependencies
│   └── .gitignore
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Root component — state machine, header, layout
│   │   ├── index.css        # Design system — animations, buttons, surfaces
│   │   ├── main.jsx         # React entry point
│   │   └── components/
│   │       ├── UploadZone.jsx   # Drag-drop + orbital spinner + step pipeline
│   │       └── Dashboard.jsx    # Metrics, health bar, error breakdown, downloads
│   ├── public/
│   │   └── favicon.svg      # Shield icon
│   ├── .env.example         # Environment variable template
│   ├── .env.local           # Local dev config (gitignored)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── .gitignore
├── sample_test.csv          # Test CSV (20 rows, mixed valid/invalid)
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
# Copy env file (already set to localhost:8000)
cp .env.example .env.local
npm install
npm run dev
```

- App: http://localhost:5173

---

## CSV Format

| Column             | Rule                                       |
|--------------------|--------------------------------------------|
| `order_id`         | Required — non-empty                       |
| `product_id`       | Required — non-empty                       |
| `payment_mode`     | Required — non-empty                       |
| `phone`            | SG: `^[89]\d{7}$` / IN: `^\d{10}$`       |
| `country_code`     | `SG` or `IN`                              |
| `transaction_date` | Strict `YYYY-MM-DD` only                  |

> Additional columns in the CSV are preserved as-is in outputs.

---

## API Reference

| Method | Path                       | Description                              |
|--------|----------------------------|------------------------------------------|
| GET    | `/`                        | Health check                             |
| POST   | `/api/upload`              | Upload CSV → get validation metrics JSON |
| GET    | `/api/download/clean`      | Download `validated_chunks.zip`          |
| GET    | `/api/download/quarantine` | Download `quarantined_errors.csv`        |

### POST /api/upload — Response

```json
{
  "total_rows": 20,
  "clean_count": 12,
  "quarantine_count": 8,
  "error_summary": {
    "Phone / Country Code": 3,
    "Invalid Date Format": 3,
    "Missing Field: product_id": 1,
    "Missing Field: payment_mode": 1
  }
}
```

---

## Cloud Deployment

### Backend → Render (Python Web Service)

| Setting        | Value                                           |
|----------------|-------------------------------------------------|
| Build Command  | `pip install -r requirements.txt`               |
| Start Command  | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Runtime        | Python 3                                        |

### Frontend → Vercel

1. Import the `frontend/` directory into Vercel
2. Add environment variable in Vercel dashboard:
   - `VITE_API_URL` = `https://your-service.onrender.com`
3. Deploy — no code changes needed

---

## Test Results (sample_test.csv — 20 rows)

```
[PASS] GET /  status: ok
[PASS] Has total_rows       → 20
[PASS] Has clean_count      → 12
[PASS] Has quarantine_count → 8
[PASS] Has error_summary    → {Invalid Date Format: 3, Phone/Country Code: 3, ...}
[PASS] ZIP contains chunk_0001.csv
[PASS] Quarantine CSV has Quarantine_Reason column with 8 rows
[PASS] Non-CSV upload rejected with HTTP 400

Results: 16/16 PASSED
```
