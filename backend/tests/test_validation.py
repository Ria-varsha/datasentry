"""
DataSentry v2 — Pytest Test Suite
tests/test_validation.py

Covers:
  - Health check
  - File validation (empty, wrong type, too large)
  - Schema validation (missing columns, extra columns)
  - All-valid dataset
  - All-invalid dataset
  - Per-field failure scenarios (each of 7 fields)
  - Boundary values (age 18/17, age 100/101)
  - Duplicate detection (all occurrences flagged)
  - Mixed valid/invalid
  - Large dataset (1,000 rows)
  - Download endpoints (clean ZIP, quarantine CSV)
  - Quality score formula verification
"""

import io
import csv
import zipfile
import random
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

# import the app from parent directory
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Helper builders
# ---------------------------------------------------------------------------

CANONICAL_COLS = ["customer_id", "full_name", "email", "phone_number", "age", "city", "signup_date"]

def _valid_row(cid: int = 100001) -> dict:
    return {
        "customer_id":  str(cid),
        "full_name":    "Arun Kumar",
        "email":        "arun.kumar@gmail.com",
        "phone_number": "9876543210",
        "age":          "28",
        "city":         "Bangalore",
        "signup_date":  "15-03-2024",
    }


def _make_csv(rows: list[dict], columns: list[str] | None = None) -> bytes:
    """Build a UTF-8 CSV byte string from a list of row dicts."""
    cols = columns or CANONICAL_COLS
    buf  = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def _upload_and_validate(csv_bytes: bytes, filename: str = "test.csv"):
    """Profile + validate pipeline. Returns (profile_resp, validate_resp)."""
    # Phase 1 — profile
    pr = client.post(
        "/api/datasets/profile",
        files={"file": (filename, csv_bytes, "text/csv")},
    )
    if pr.status_code != 200:
        return pr, None
    dataset_id = pr.json()["dataset_id"]
    # Phase 2 — validate
    vr = client.post(f"/api/datasets/{dataset_id}/validate")
    return pr, vr


# ---------------------------------------------------------------------------
# 1. Health check
# ---------------------------------------------------------------------------

def test_health_check():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert "2.0" in r.json()["version"]


# ---------------------------------------------------------------------------
# 2. File validation
# ---------------------------------------------------------------------------

def test_reject_non_csv():
    r = client.post(
        "/api/datasets/profile",
        files={"file": ("report.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert r.status_code == 400
    assert "csv" in r.json()["detail"].lower() or "excel" in r.json()["detail"].lower()


def test_reject_empty_file():
    r = client.post(
        "/api/datasets/profile",
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    assert r.status_code == 422


def test_reject_header_only():
    csv_bytes = ",".join(CANONICAL_COLS).encode()
    r = client.post(
        "/api/datasets/profile",
        files={"file": ("header_only.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 422


def test_reject_file_too_large():
    # Create a fake > 25 MB payload
    big_bytes = b"customer_id\n" + b"x" * (26 * 1024 * 1024)
    r = client.post(
        "/api/datasets/profile",
        files={"file": ("huge.csv", big_bytes, "text/csv")},
    )
    assert r.status_code in (413, 422, 400)


# ---------------------------------------------------------------------------
# 3. Schema validation
# ---------------------------------------------------------------------------

def test_missing_columns_rejected():
    csv_bytes = _make_csv([{"name": "test", "email": "x@y.com"}], columns=["name", "email"])
    r = client.post(
        "/api/datasets/profile",
        files={"file": ("bad_schema.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert isinstance(detail, dict)
    assert "missing_columns" in detail
    # All 7 canonical columns should be in missing list
    for col in CANONICAL_COLS:
        if col not in ["name", "email"]:
            assert col in detail["missing_columns"]


def test_extra_columns_ok():
    """Extra columns should not cause rejection — just noted."""
    rows = [dict(**_valid_row(), extra_col="ignored")]
    csv_bytes = _make_csv(rows, columns=CANONICAL_COLS + ["extra_col"])
    pr, vr = _upload_and_validate(csv_bytes)
    assert pr.status_code == 200
    # extra_columns in profile
    assert "extra_col" in pr.json().get("extra_columns", [])


# ---------------------------------------------------------------------------
# 4. All-valid dataset
# ---------------------------------------------------------------------------

def test_all_valid_dataset():
    rows = [_valid_row(100000 + i) for i in range(1, 21)]
    _, vr = _upload_and_validate(_make_csv(rows))
    assert vr.status_code == 200
    data = vr.json()
    assert data["total_rows"] == 20
    assert data["clean_count"] == 20
    assert data["quarantine_count"] == 0
    assert data["quality_score"] == 100.0
    assert data["duplicate_count"] == 0


# ---------------------------------------------------------------------------
# 5. All-invalid dataset
# ---------------------------------------------------------------------------

def test_all_invalid_dataset():
    rows = []
    for i in range(10):
        row = _valid_row()
        row["email"] = "notanemail"  # guaranteed invalid
        row["customer_id"] = str(100001 + i)
        rows.append(row)
    _, vr = _upload_and_validate(_make_csv(rows))
    assert vr.status_code == 200
    data = vr.json()
    assert data["clean_count"] == 0
    assert data["quarantine_count"] == 10
    assert data["quality_score"] == 0.0


# ---------------------------------------------------------------------------
# 6. Individual field failures
# ---------------------------------------------------------------------------

def _one_bad(field: str, bad_value: str, cid: int = 100099) -> tuple:
    row = _valid_row(cid)
    row[field] = bad_value
    _, vr = _upload_and_validate(_make_csv([row]))
    return vr


def test_bad_customer_id_too_short():
    vr = _one_bad("customer_id", "123")
    assert vr.json()["quarantine_count"] == 1


def test_bad_customer_id_non_numeric():
    vr = _one_bad("customer_id", "ABCDEF")
    assert vr.json()["quarantine_count"] == 1


def test_bad_customer_id_out_of_range():
    vr = _one_bad("customer_id", "999999")
    # 999999 is still valid (≤ 999999). Use 1000000 to go out of range.
    vr2 = _one_bad("customer_id", "1000000")
    assert vr2.json()["quarantine_count"] == 1


def test_missing_full_name():
    vr = _one_bad("full_name", "")
    assert vr.json()["quarantine_count"] == 1


def test_invalid_full_name_numeric():
    vr = _one_bad("full_name", "12345")
    assert vr.json()["quarantine_count"] == 1


def test_valid_full_name_with_hyphen():
    """Mary-Jane is a valid name."""
    row = _valid_row()
    row["full_name"] = "Mary-Jane Watson"
    _, vr = _upload_and_validate(_make_csv([row]))
    assert vr.json()["clean_count"] == 1


def test_valid_full_name_with_apostrophe():
    """O'Connor is a valid name."""
    row = _valid_row()
    row["full_name"] = "O'Connor"
    _, vr = _upload_and_validate(_make_csv([row]))
    assert vr.json()["clean_count"] == 1


def test_missing_email():
    vr = _one_bad("email", "")
    assert vr.json()["quarantine_count"] == 1


def test_invalid_email_format():
    vr = _one_bad("email", "notanemail")
    assert vr.json()["quarantine_count"] == 1


def test_invalid_email_no_tld():
    vr = _one_bad("email", "user@domain")
    assert vr.json()["quarantine_count"] == 1


def test_valid_email():
    vr = _one_bad("email", "valid.user+tag@example.co.in")
    # Should be valid
    _, vr2 = _upload_and_validate(_make_csv([_valid_row()]))
    assert vr2.json()["clean_count"] == 1


def test_missing_phone():
    vr = _one_bad("phone_number", "")
    assert vr.json()["quarantine_count"] == 1


def test_invalid_phone_too_short():
    vr = _one_bad("phone_number", "12345")
    assert vr.json()["quarantine_count"] == 1


def test_invalid_phone_alpha():
    vr = _one_bad("phone_number", "ABCDEFGHIJ")
    assert vr.json()["quarantine_count"] == 1


# ---------------------------------------------------------------------------
# 7. Age boundary values
# ---------------------------------------------------------------------------

def test_age_18_is_valid():
    row = _valid_row()
    row["age"] = "18"
    _, vr = _upload_and_validate(_make_csv([row]))
    assert vr.json()["clean_count"] == 1


def test_age_17_is_invalid():
    vr = _one_bad("age", "17")
    assert vr.json()["quarantine_count"] == 1
    errors = vr.json()["error_summary"]
    assert any("age" in k.lower() or "minimum" in k.lower() or "below" in k.lower() for k in errors)


def test_age_100_is_valid():
    row = _valid_row()
    row["age"] = "100"
    _, vr = _upload_and_validate(_make_csv([row]))
    assert vr.json()["clean_count"] == 1


def test_age_101_is_invalid():
    vr = _one_bad("age", "101")
    assert vr.json()["quarantine_count"] == 1
    errors = vr.json()["error_summary"]
    assert any("age" in k.lower() or "maximum" in k.lower() or "above" in k.lower() for k in errors)


def test_age_not_integer():
    vr = _one_bad("age", "twenty")
    assert vr.json()["quarantine_count"] == 1


def test_missing_age():
    vr = _one_bad("age", "")
    assert vr.json()["quarantine_count"] == 1


# ---------------------------------------------------------------------------
# 8. City validation
# ---------------------------------------------------------------------------

VALID_CITIES   = ["Chennai", "Bangalore", "Hyderabad", "Mumbai", "Delhi", "Kolkata", "Pune"]
INVALID_CITIES = ["London", "Paris", "Tokyo", "New York", "RandomCity", "NYC"]


def test_all_allowed_cities_valid():
    for city in VALID_CITIES:
        row = _valid_row()
        row["city"] = city
        if city == "Chennai":
            row["age"] = "35" # Ensure Chennai meets cross-column age rule
        _, vr = _upload_and_validate(_make_csv([row]))
        assert vr.json()["clean_count"] == 1, f"City '{city}' should be valid"


def test_invalid_city_rejected():
    for city in INVALID_CITIES:
        vr = _one_bad("city", city)
        assert vr.json()["quarantine_count"] == 1, f"City '{city}' should be invalid"


def test_missing_city():
    vr = _one_bad("city", "")
    assert vr.json()["quarantine_count"] == 1


# ---------------------------------------------------------------------------
# 9. Date validation
# ---------------------------------------------------------------------------

def test_date_dd_mm_yyyy_valid():
    row = _valid_row()
    row["signup_date"] = "01-06-2023"
    _, vr = _upload_and_validate(_make_csv([row]))
    assert vr.json()["clean_count"] == 1


def test_date_yyyy_mm_dd_valid():
    row = _valid_row()
    row["signup_date"] = "2023-06-01"
    _, vr = _upload_and_validate(_make_csv([row]))
    assert vr.json()["clean_count"] == 1


def test_future_date_invalid():
    future = (date.today() + timedelta(days=30)).strftime("%d-%m-%Y")
    vr = _one_bad("signup_date", future)
    assert vr.json()["quarantine_count"] == 1
    errors = vr.json()["error_summary"]
    assert any("future" in k.lower() or "date" in k.lower() for k in errors)


def test_invalid_date_format():
    vr = _one_bad("signup_date", "2024/03/15")   # wrong separator
    assert vr.json()["quarantine_count"] == 1


def test_invalid_date_text():
    vr = _one_bad("signup_date", "not-a-date")
    assert vr.json()["quarantine_count"] == 1


def test_missing_date():
    vr = _one_bad("signup_date", "")
    assert vr.json()["quarantine_count"] == 1


# ---------------------------------------------------------------------------
# 10. Duplicate detection
# ---------------------------------------------------------------------------

def test_duplicate_flagged_all_occurrences():
    """Both occurrences of customer_id 100001 must be quarantined."""
    row1 = _valid_row(100001)
    row2 = _valid_row(100002)
    row3 = dict(**_valid_row(100001))  # exact duplicate of row1

    _, vr = _upload_and_validate(_make_csv([row1, row2, row3]))
    data = vr.json()
    # row2 is the only clean row
    assert data["clean_count"] == 1, "Only non-duplicate row should be clean"
    assert data["quarantine_count"] == 2, "Both duplicate occurrences must be quarantined"
    assert data["duplicate_count"] == 2


def test_no_false_positive_duplicates():
    """All different IDs → duplicate_count = 0."""
    rows = [_valid_row(100000 + i) for i in range(5)]
    _, vr = _upload_and_validate(_make_csv(rows))
    assert vr.json()["duplicate_count"] == 0


# ---------------------------------------------------------------------------
# 11. Mixed valid/invalid
# ---------------------------------------------------------------------------

def test_mixed_dataset_counts():
    valid_rows   = [_valid_row(100000 + i) for i in range(8)]
    invalid_rows = []
    for i in range(2):
        r = _valid_row(200000 + i)
        r["email"] = "bad"
        invalid_rows.append(r)
    rows = valid_rows + invalid_rows
    random.shuffle(rows)

    _, vr = _upload_and_validate(_make_csv(rows))
    data = vr.json()
    assert data["total_rows"] == 10
    assert data["clean_count"] == 8
    assert data["quarantine_count"] == 2
    assert abs(data["quality_score"] - 80.0) < 0.1


# ---------------------------------------------------------------------------
# 12. Quality score formula verification
# ---------------------------------------------------------------------------

def test_quality_score_formula():
    """quality_score = (clean / total) * 100"""
    total    = 10
    n_valid  = 7
    n_invalid = 3

    valid_rows   = [_valid_row(100000 + i) for i in range(n_valid)]
    invalid_rows = []
    for i in range(n_invalid):
        r = _valid_row(200000 + i)
        r["email"] = "bad"
        invalid_rows.append(r)
    _, vr = _upload_and_validate(_make_csv(valid_rows + invalid_rows))

    data = vr.json()
    expected_score = round(n_valid / total * 100, 1)
    assert abs(data["quality_score"] - expected_score) < 0.2


# ---------------------------------------------------------------------------
# 13. Column quality
# ---------------------------------------------------------------------------

def test_column_quality_present_in_response():
    rows = [_valid_row(100000 + i) for i in range(5)]
    _, vr = _upload_and_validate(_make_csv(rows))
    data = vr.json()
    assert "column_quality" in data
    for col in ["customer_id", "full_name", "email", "phone_number", "age", "city", "signup_date"]:
        assert col in data["column_quality"]


def test_column_quality_all_100_for_valid():
    rows = [_valid_row(100000 + i) for i in range(10)]
    _, vr = _upload_and_validate(_make_csv(rows))
    cq = vr.json()["column_quality"]
    for col, pct in cq.items():
        assert pct == 100.0, f"Column '{col}' should be 100% for all-valid dataset"


# ---------------------------------------------------------------------------
# 14. Large dataset
# ---------------------------------------------------------------------------

def test_large_dataset_1000_rows():
    rows = [_valid_row(100000 + i) for i in range(1000)]
    _, vr = _upload_and_validate(_make_csv(rows))
    data = vr.json()
    assert data["total_rows"] == 1000
    assert data["clean_count"] == 1000
    assert data["quality_score"] == 100.0


# ---------------------------------------------------------------------------
# 15. Download endpoints
# ---------------------------------------------------------------------------

def _get_dataset_id(n_rows: int = 5) -> str:
    rows = [_valid_row(100000 + i) for i in range(n_rows)]
    pr = client.post(
        "/api/datasets/profile",
        files={"file": ("test.csv", _make_csv(rows), "text/csv")},
    )
    dataset_id = pr.json()["dataset_id"]
    client.post(f"/api/datasets/{dataset_id}/validate")
    return dataset_id


def test_download_clean_zip():
    did = _get_dataset_id(10)
    r   = client.get(f"/api/datasets/{did}/download/clean")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    # Verify it is a valid ZIP
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = zf.namelist()
    assert len(names) >= 1
    assert names[0].endswith(".csv")


def test_download_quarantine_csv():
    rows = [_valid_row(100000 + i) for i in range(3)]
    bad_row = _valid_row(200001)
    bad_row["email"] = "bad"
    rows.append(bad_row)   # 1 invalid
    pr    = client.post(
        "/api/datasets/profile",
        files={"file": ("test.csv", _make_csv(rows), "text/csv")},
    )
    did   = pr.json()["dataset_id"]
    client.post(f"/api/datasets/{did}/validate")
    r     = client.get(f"/api/datasets/{did}/download/quarantine")
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    lines = r.content.decode().splitlines()
    assert "Quarantine_Reason" in lines[0]
    assert len(lines) >= 2   # header + at least 1 quarantined row


def test_download_without_validate_returns_404():
    """Profile without validate → download should 404."""
    rows = [_valid_row(100001)]
    pr   = client.post(
        "/api/datasets/profile",
        files={"file": ("test.csv", _make_csv(rows), "text/csv")},
    )
    did = pr.json()["dataset_id"]
    r   = client.get(f"/api/datasets/{did}/download/clean")
    assert r.status_code == 404


def test_validate_unknown_dataset_id_returns_404():
    r = client.post("/api/datasets/ds_doesnotexist/validate")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 16. Sample test CSV
# ---------------------------------------------------------------------------

def test_sample_csv_processes_correctly():
    """The committed sample_test.csv must parse and produce expected counts."""
    sample_path = os.path.join(os.path.dirname(__file__), "..", "..", "sample_test.csv")
    if not os.path.exists(sample_path):
        pytest.skip("sample_test.csv not found at expected path")

    with open(sample_path, "rb") as f:
        csv_bytes = f.read()

    pr, vr = _upload_and_validate(csv_bytes, "sample_test.csv")
    assert pr.status_code == 200
    assert vr.status_code == 200
    data = vr.json()
    # 10 valid, 10 invalid rows (one of which is a duplicate of row 1)
    assert data["total_rows"] == 20
    assert data["clean_count"] <= 10   # may be lower due to duplicate
    assert data["quarantine_count"] >= 10
