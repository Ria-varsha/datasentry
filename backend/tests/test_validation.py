"""
DataSentry v2 - Comprehensive Pytest Test Suite
tests/test_validation.py

Covers all 18 improvement requirements:
  1.  Health check
  2.  File validation (empty, wrong type, too large, header-only)
  3.  Schema validation (missing columns, extra columns OK)
  4.  Profile response structure (dtypes, missing_pct, stats, duplicate_count)
  5.  Rule manifest GET /api/rules
  6.  Rule toggle POST /api/rules (disable rule -> rows pass, re-enable)
  7.  All-valid dataset
  8.  All-invalid dataset
  9.  Per-field failures (all 7 canonical fields)
  10. Boundary values (age 17/18/100/101, customer_id boundaries)
  11. Duplicate detection (all occurrences flagged)
  12. Mixed valid/invalid dataset
  13. Cross-column validation (Chennai age >= 30)
  14. Explainable errors (field/value/rule/message structure)
  15. Quality score formula verification
  16. Deliberate Red/Green run (inject-bug -> Red -> fix-bug -> Green)
  17. Large dataset (1000 rows, mixed)
  18. Download endpoints (clean ZIP, quarantine CSV, 404s)
"""

import io
import csv
import zipfile
import random
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import app, _rules
from rules import build_default_rules

client = TestClient(app)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

CANONICAL_COLS = ["customer_id","full_name","email","phone_number","age","city","signup_date"]
PAST = (date.today() - timedelta(days=365)).strftime("%d-%m-%Y")


def _valid_row(cid: int = 100001) -> dict:
    return {
        "customer_id":  str(cid),
        "full_name":    "Arun Kumar",
        "email":        "arun.kumar@gmail.com",
        "phone_number": "9876543210",
        "age":          "28",
        "city":         "Bangalore",
        "signup_date":  PAST,
    }


def _make_csv(rows: list, columns: list = None) -> bytes:
    cols = columns or CANONICAL_COLS
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def _profile(csv_bytes: bytes, filename: str = "test.csv"):
    return client.post("/api/datasets/profile",
                       files={"file": (filename, csv_bytes, "text/csv")})


def _validate(dataset_id: str):
    return client.post(f"/api/datasets/{dataset_id}/validate")


def _pipeline(csv_bytes: bytes, filename: str = "test.csv"):
    pr = _profile(csv_bytes, filename)
    if pr.status_code != 200:
        return pr, None
    return pr, _validate(pr.json()["dataset_id"])


def _reset_rules():
    """Restore all rules to default enabled/values."""
    defaults = build_default_rules()
    defaults_by_id = {d.id: d for d in defaults}
    for rule in _rules:
        if rule.id in defaults_by_id:
            rule.enabled = True
            default = defaults_by_id[rule.id]
            if hasattr(rule, "min_val") and hasattr(default, "min_val"):
                rule.min_val = default.min_val
            if hasattr(rule, "max_val") and hasattr(default, "max_val"):
                rule.max_val = default.max_val


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
    r = _profile(b"%PDF-1.4 content", "report.pdf")
    assert r.status_code == 400
    detail = r.json()["detail"].lower()
    assert "csv" in detail or "excel" in detail


def test_reject_empty_file():
    r = _profile(b"", "empty.csv")
    assert r.status_code == 422


def test_reject_header_only():
    r = _profile(",".join(CANONICAL_COLS).encode(), "header_only.csv")
    assert r.status_code == 422


def test_reject_file_too_large():
    big = b"customer_id\n" + b"x" * (26 * 1024 * 1024)
    r = _profile(big, "huge.csv")
    assert r.status_code in (400, 413, 422)


# ---------------------------------------------------------------------------
# 3. Schema validation
# ---------------------------------------------------------------------------

def test_missing_columns_rejected():
    csv_bytes = _make_csv([{"name": "test"}], columns=["name"])
    r = _profile(csv_bytes, "bad_schema.csv")
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert isinstance(detail, dict)
    assert "missing_columns" in detail
    for col in CANONICAL_COLS:
        if col != "name":
            assert col in detail["missing_columns"]


def test_extra_columns_accepted():
    row = _valid_row()
    row["extra_col"] = "bonus"
    r = _profile(_make_csv([row], CANONICAL_COLS + ["extra_col"]))
    assert r.status_code == 200
    assert "extra_col" in r.json()["extra_columns"]


# ---------------------------------------------------------------------------
# 4. Profile response structure
# ---------------------------------------------------------------------------

def test_profile_response_structure():
    r = _profile(_make_csv([_valid_row()]))
    assert r.status_code == 200
    data = r.json()
    assert "dataset_id" in data
    assert data["dataset_id"].startswith("ds_")
    assert data["total_rows"] == 1
    assert data["total_columns"] == 7
    assert set(data["columns"]) == set(CANONICAL_COLS)
    assert "missing_pct" in data
    assert "duplicate_count" in data
    assert "column_rules" in data
    assert "uploaded_at" in data


def test_profile_missing_pct():
    row = _valid_row()
    row["email"] = ""
    r = _profile(_make_csv([row]))
    assert r.status_code == 200
    assert r.json()["missing_pct"]["email"] == 100.0


def test_profile_duplicate_detection():
    rows = [_valid_row(100001), _valid_row(100001)]
    r = _profile(_make_csv(rows))
    assert r.status_code == 200
    assert r.json()["duplicate_count"] == 2


# ---------------------------------------------------------------------------
# 5 and 6. Rule manifest and toggle
# ---------------------------------------------------------------------------

def test_get_rules_manifest():
    r = client.get("/api/rules")
    assert r.status_code == 200
    rules = r.json()["rules"]
    assert isinstance(rules, list)
    assert len(rules) >= 10
    ids = [rule["id"] for rule in rules]
    assert "age_range" in ids
    assert "chennai_age_rule" in ids
    for rule in rules:
        for key in ["id", "field", "rule_type", "description", "enabled"]:
            assert key in rule


def test_toggle_rule_off_and_on():
    _reset_rules()
    # Disable age_range
    r = client.post("/api/rules", json={"age_range": False})
    assert r.status_code == 200
    assert "age_range" in r.json()["updated"]

    # Row with age=10 should pass now (age_range disabled)
    row = {**_valid_row(), "age": "10"}
    _, vr = _pipeline(_make_csv([row]))
    assert vr.status_code == 200
    assert vr.json()["clean_count"] == 1

    # Re-enable
    client.post("/api/rules", json={"age_range": True})
    _reset_rules()


# ---------------------------------------------------------------------------
# 7. All-valid dataset
# ---------------------------------------------------------------------------

def test_all_valid():
    _reset_rules()
    rows = [_valid_row(100001 + i) for i in range(5)]
    pr, vr = _pipeline(_make_csv(rows))
    assert pr.status_code == 200
    assert vr.status_code == 200
    data = vr.json()
    assert data["clean_count"] == 5
    assert data["quarantine_count"] == 0
    assert data["quality_score"] == 100.0
    assert data["duplicate_count"] == 0
    assert "quality_formula" in data
    assert data["sample_invalid"] == []


# ---------------------------------------------------------------------------
# 8. All-invalid dataset
# ---------------------------------------------------------------------------

def test_all_invalid():
    _reset_rules()
    rows = [{
        "customer_id":  "",
        "full_name":    "",
        "email":        "not-an-email",
        "phone_number": "123",
        "age":          "abc",
        "city":         "Mars",
        "signup_date":  "99-99-9999",
    }]
    _, vr = _pipeline(_make_csv(rows))
    assert vr.status_code == 200
    data = vr.json()
    assert data["clean_count"] == 0
    assert data["quarantine_count"] == 1
    assert data["quality_score"] == 0.0


# ---------------------------------------------------------------------------
# 9. Per-field failure scenarios
# ---------------------------------------------------------------------------

def _field_fails(field, value, expected_keyword):
    _reset_rules()
    row = {**_valid_row(), field: value}
    _, vr = _pipeline(_make_csv([row]))
    assert vr.status_code == 200
    data = vr.json()
    assert data["quarantine_count"] == 1, f"Expected quarantine for {field}={value!r}"
    invalid = data["sample_invalid"][0]
    messages = " ".join(e["message"] for e in invalid["errors"]).lower()
    assert expected_keyword.lower() in messages, f"Expected '{expected_keyword}' in: {messages}"


def test_missing_customer_id():       _field_fails("customer_id", "", "required")
def test_invalid_customer_id_alpha(): _field_fails("customer_id", "ABCDEF", "numeric")
def test_invalid_customer_id_short(): _field_fails("customer_id", "12345", "6 digit")
def test_invalid_customer_id_range(): _field_fails("customer_id", "99999", "6 digit")
def test_missing_full_name():         _field_fails("full_name", "", "required")
def test_invalid_full_name():         _field_fails("full_name", "A", "2")
def test_missing_email():             _field_fails("email", "", "required")
def test_invalid_email():             _field_fails("email", "not@valid", "email")
def test_missing_phone():             _field_fails("phone_number", "", "required")
def test_invalid_phone():             _field_fails("phone_number", "123", "10 digit")
def test_missing_age():               _field_fails("age", "", "required")
def test_invalid_age_not_int():       _field_fails("age", "twenty", "integer")
def test_missing_city():              _field_fails("city", "", "required")
def test_invalid_city():              _field_fails("city", "Atlantis", "not in allowed")
def test_missing_signup_date():       _field_fails("signup_date", "", "required")
def test_invalid_signup_date():       _field_fails("signup_date", "12/25/2024", "DD-MM-YYYY")
def test_future_signup_date():
    future = (date.today() + timedelta(days=10)).strftime("%d-%m-%Y")
    _field_fails("signup_date", future, "future")


# ---------------------------------------------------------------------------
# 10. Boundary values
# ---------------------------------------------------------------------------

def test_age_17_rejected():
    _reset_rules()
    _, vr = _pipeline(_make_csv([{**_valid_row(), "age": "17"}]))
    assert vr.json()["quarantine_count"] == 1

def test_age_18_accepted():
    _reset_rules()
    _, vr = _pipeline(_make_csv([{**_valid_row(), "age": "18"}]))
    assert vr.json()["clean_count"] == 1

def test_age_100_accepted():
    _reset_rules()
    _, vr = _pipeline(_make_csv([{**_valid_row(), "age": "100"}]))
    assert vr.json()["clean_count"] == 1

def test_age_101_rejected():
    _reset_rules()
    _, vr = _pipeline(_make_csv([{**_valid_row(), "age": "101"}]))
    assert vr.json()["quarantine_count"] == 1

def test_customer_id_100000_accepted():
    _reset_rules()
    _, vr = _pipeline(_make_csv([{**_valid_row(), "customer_id": "100000"}]))
    assert vr.json()["clean_count"] == 1

def test_customer_id_999999_accepted():
    _reset_rules()
    _, vr = _pipeline(_make_csv([{**_valid_row(), "customer_id": "999999"}]))
    assert vr.json()["clean_count"] == 1

def test_customer_id_99999_rejected():
    _reset_rules()
    _, vr = _pipeline(_make_csv([{**_valid_row(), "customer_id": "99999"}]))
    assert vr.json()["quarantine_count"] == 1

def test_customer_id_1000000_rejected():
    _reset_rules()
    _, vr = _pipeline(_make_csv([{**_valid_row(), "customer_id": "1000000"}]))
    assert vr.json()["quarantine_count"] == 1


# ---------------------------------------------------------------------------
# 11. Duplicate detection
# ---------------------------------------------------------------------------

def test_duplicates_both_flagged():
    _reset_rules()
    rows = [_valid_row(100001), _valid_row(100001), _valid_row(100002)]
    _, vr = _pipeline(_make_csv(rows))
    data = vr.json()
    assert data["quarantine_count"] == 2
    assert data["clean_count"] == 1
    assert data["duplicate_count"] == 2

def test_three_duplicates_all_flagged():
    _reset_rules()
    rows = [_valid_row(100001)] * 3
    _, vr = _pipeline(_make_csv(rows))
    assert vr.json()["quarantine_count"] == 3


# ---------------------------------------------------------------------------
# 12. Mixed valid/invalid
# ---------------------------------------------------------------------------

def test_mixed_dataset():
    _reset_rules()
    rows = [
        _valid_row(100001),
        {**_valid_row(100002), "email": "bad-email"},
        _valid_row(100003),
        {**_valid_row(100004), "age": "17"},
        _valid_row(100005),
    ]
    _, vr = _pipeline(_make_csv(rows))
    data = vr.json()
    assert data["clean_count"] == 3
    assert data["quarantine_count"] == 2
    assert round(data["quality_score"], 1) == 60.0


# ---------------------------------------------------------------------------
# 13. Cross-column validation (Chennai age >= 30)
# ---------------------------------------------------------------------------

def test_chennai_age_below_30_quarantined():
    _reset_rules()
    row = {**_valid_row(), "city": "Chennai", "age": "25"}
    _, vr = _pipeline(_make_csv([row]))
    data = vr.json()
    assert data["quarantine_count"] == 1
    err_messages = " ".join(
        e["message"] for e in data["sample_invalid"][0]["errors"]
    ).lower()
    assert "chennai" in err_messages
    assert "30" in err_messages

def test_chennai_age_30_accepted():
    _reset_rules()
    row = {**_valid_row(), "city": "Chennai", "age": "30"}
    _, vr = _pipeline(_make_csv([row]))
    assert vr.json()["clean_count"] == 1

def test_chennai_age_above_30_accepted():
    _reset_rules()
    row = {**_valid_row(), "city": "Chennai", "age": "45"}
    _, vr = _pipeline(_make_csv([row]))
    assert vr.json()["clean_count"] == 1

def test_non_chennai_age_22_accepted():
    _reset_rules()
    row = {**_valid_row(), "city": "Bangalore", "age": "22"}
    _, vr = _pipeline(_make_csv([row]))
    assert vr.json()["clean_count"] == 1


# ---------------------------------------------------------------------------
# 14. Explainable errors
# ---------------------------------------------------------------------------

def test_errors_are_structured():
    _reset_rules()
    row = {**_valid_row(), "email": "bad-email", "age": "200"}
    _, vr = _pipeline(_make_csv([row]))
    sample = vr.json()["sample_invalid"]
    assert len(sample) == 1
    for err in sample[0]["errors"]:
        assert "field" in err
        assert "value" in err
        assert "rule" in err
        assert "message" in err
        assert err["field"] in CANONICAL_COLS
        assert len(err["message"]) > 0

def test_error_contains_actual_value():
    _reset_rules()
    row = {**_valid_row(), "age": "999"}
    _, vr = _pipeline(_make_csv([row]))
    sample = vr.json()["sample_invalid"][0]
    age_errors = [e for e in sample["errors"] if e["field"] == "age"]
    assert len(age_errors) > 0
    assert "999" in str(age_errors[0]["value"])

def test_error_has_rule_type():
    _reset_rules()
    row = {**_valid_row(), "email": "notvalid"}
    _, vr = _pipeline(_make_csv([row]))
    sample = vr.json()["sample_invalid"][0]
    email_errs = [e for e in sample["errors"] if e["field"] == "email"]
    assert any(e["rule"] in ("format", "required", "type") for e in email_errs)


# ---------------------------------------------------------------------------
# 15. Quality score formula
# ---------------------------------------------------------------------------

def test_quality_score_formula():
    _reset_rules()
    rows = [_valid_row(100001 + i) for i in range(7)]
    rows[0]["email"] = "bad"
    rows[1]["age"]   = "5"
    rows[2]["city"]  = "Mars"
    pr, vr = _pipeline(_make_csv(rows))
    data = vr.json()
    expected = round(data["clean_count"] / data["total_rows"] * 100, 1)
    assert data["quality_score"] == expected
    assert "quality_formula" in data


# ---------------------------------------------------------------------------
# 16. Deliberate Red/Green run
# ---------------------------------------------------------------------------

def test_red_green_inject_and_fix():
    _reset_rules()
    row_18 = {**_valid_row(), "age": "18"}

    # Baseline: age 18 is CLEAN
    _, vr_before = _pipeline(_make_csv([row_18]))
    assert vr_before.json()["clean_count"] == 1, "Age 18 should be CLEAN before bug injection"

    # Inject bug (age min: 18 -> 25)
    inj = client.post("/api/debug/inject-bug?token=datasentry-debug")
    assert inj.status_code == 200
    assert inj.json()["status"] == "bug_injected"

    # Red run: age=18 now FAILS
    _, vr_red = _pipeline(_make_csv([row_18]))
    assert vr_red.json()["quarantine_count"] == 1, "Age 18 should FAIL after bug injection (Red)"

    # Fix
    fix = client.post("/api/debug/fix-bug?token=datasentry-debug")
    assert fix.status_code == 200
    assert fix.json()["status"] == "bug_fixed"

    # Green run: age=18 PASSES again
    _, vr_green = _pipeline(_make_csv([row_18]))
    assert vr_green.json()["clean_count"] == 1, "Age 18 should be CLEAN after fix (Green)"

    _reset_rules()

def test_debug_status_endpoint():
    r = client.get("/api/debug/status")
    assert r.status_code == 200
    assert "rules" in r.json()


# ---------------------------------------------------------------------------
# 17. Large dataset
# ---------------------------------------------------------------------------

def test_large_dataset_1000_rows():
    _reset_rules()
    random.seed(42)
    rows = []
    for i in range(900):
        rows.append(_valid_row(100001 + i))
    for i in range(100):
        row = _valid_row(200001 + i)
        row["email"] = "invalid"
        rows.append(row)
    random.shuffle(rows)
    pr, vr = _pipeline(_make_csv(rows))
    assert pr.status_code == 200
    assert pr.json()["total_rows"] == 1000
    assert vr.status_code == 200
    data = vr.json()
    assert data["total_rows"] == 1000
    assert data["clean_count"] == 900
    assert data["quarantine_count"] == 100
    assert data["quality_score"] == 90.0


# ---------------------------------------------------------------------------
# 18. Download endpoints
# ---------------------------------------------------------------------------

def test_download_clean_zip():
    _reset_rules()
    rows = [_valid_row(100001 + i) for i in range(3)]
    pr, vr = _pipeline(_make_csv(rows))
    assert vr.status_code == 200
    dataset_id = pr.json()["dataset_id"]
    dl = client.get(f"/api/datasets/{dataset_id}/download/clean")
    assert dl.status_code == 200
    assert dl.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(dl.content)) as z:
        assert any(n.endswith(".csv") for n in z.namelist())

def test_download_quarantine_csv():
    _reset_rules()
    row = {**_valid_row(), "email": "bad"}
    pr, vr = _pipeline(_make_csv([row]))
    assert vr.status_code == 200
    dl = client.get(f"/api/datasets/{pr.json()['dataset_id']}/download/quarantine")
    assert dl.status_code == 200
    assert "csv" in dl.headers["content-type"]
    assert "Quarantine_Reason" in dl.content.decode("utf-8")

def test_download_before_validate_is_404():
    _reset_rules()
    pr = _profile(_make_csv([_valid_row()]))
    r = client.get(f"/api/datasets/{pr.json()['dataset_id']}/download/clean")
    assert r.status_code == 404

def test_validate_nonexistent_dataset_is_404():
    r = client.post("/api/datasets/ds_doesnotexist/validate")
    assert r.status_code == 404

def test_clean_zip_chunks_for_1500_rows():
    _reset_rules()
    rows = [_valid_row(100001 + i) for i in range(1500)]
    pr, vr = _pipeline(_make_csv(rows))
    assert vr.json()["clean_count"] == 1500
    dl = client.get(f"/api/datasets/{pr.json()['dataset_id']}/download/clean")
    assert dl.status_code == 200
    with zipfile.ZipFile(io.BytesIO(dl.content)) as z:
        csv_files = [n for n in z.namelist() if n.endswith(".csv")]
        assert len(csv_files) == 2
