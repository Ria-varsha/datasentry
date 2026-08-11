"""
generate_test_data.py — DataSentry v2 Test Dataset Generator

Generates a CSV with a controllable mix of valid and invalid records.
All records use the canonical v2 schema:
  customer_id | full_name | email | phone_number | age | city | signup_date

Usage:
    python generate_test_data.py                    # 1000 rows → test_data.csv
    python generate_test_data.py --rows 5000 --out big_test.csv
"""

import argparse
import csv
import random
from datetime import date, timedelta

CITIES       = ["Chennai", "Bangalore", "Hyderabad", "Mumbai", "Delhi", "Kolkata", "Pune"]
FIRST_NAMES  = ["Arun", "Priya", "Ravi", "Meena", "John", "Mary", "Suresh", "Deepika",
                "Kiran", "Lakshmi", "Rohit", "Anita", "Vijay", "Sita", "Mohan", "Geeta",
                "Sanjay", "Pooja", "Arvind", "Nisha", "Harish", "Rekha", "Dinesh", "Lata"]
LAST_NAMES   = ["Kumar", "Sharma", "Nair", "Iyer", "Singh", "Patel", "Raj", "Devi",
                "Shah", "Rao", "Lal", "Watson", "O'Brien", "D'Cruz", "Verma", "Joshi"]
DOMAINS      = ["gmail.com", "outlook.com", "yahoo.com", "hotmail.com", "example.com"]


def random_date(start_year=2019, end_year=2024) -> str:
    start = date(start_year, 1, 1)
    end   = date(end_year, 12, 31)
    delta = (end - start).days
    d     = start + timedelta(days=random.randint(0, delta))
    # Randomly pick format to exercise both
    fmt   = "%d-%m-%Y" if random.random() < 0.6 else "%Y-%m-%d"
    return d.strftime(fmt)


def valid_row(customer_id: int) -> dict:
    fn = random.choice(FIRST_NAMES)
    ln = random.choice(LAST_NAMES)
    return {
        "customer_id":  str(customer_id),
        "full_name":    f"{fn} {ln}",
        "email":        f"{fn.lower()}.{ln.lower().replace(chr(39),'').replace('-','')}@{random.choice(DOMAINS)}",
        "phone_number": "".join([str(random.randint(0, 9)) for _ in range(10)]),
        "age":          str(random.randint(18, 100)),
        "city":         random.choice(CITIES),
        "signup_date":  random_date(),
    }


def invalid_row(customer_id: int, error_type: str) -> dict:
    row = valid_row(customer_id)
    if error_type == "bad_id":
        row["customer_id"] = str(random.randint(10, 999))           # too short
    elif error_type == "missing_name":
        row["full_name"] = ""
    elif error_type == "bad_email":
        row["email"] = f"notanemail{random.randint(1,99)}"
    elif error_type == "bad_phone":
        row["phone_number"] = "123"                                  # too short
    elif error_type == "age_low":
        row["age"] = str(random.randint(1, 17))
    elif error_type == "age_high":
        row["age"] = str(random.randint(101, 150))
    elif error_type == "bad_city":
        row["city"] = random.choice(["London", "Paris", "Tokyo", "NYC", "RandomCity"])
    elif error_type == "future_date":
        future = date.today() + timedelta(days=random.randint(1, 365))
        row["signup_date"] = future.strftime("%d-%m-%Y")
    elif error_type == "bad_date":
        row["signup_date"] = "not-a-date"
    return row


ERROR_TYPES = [
    "bad_id", "missing_name", "bad_email", "bad_phone",
    "age_low", "age_high", "bad_city", "future_date", "bad_date",
]

VALID_RATIO = 0.80   # 80% valid rows by default


def generate(num_rows: int, output_path: str, valid_ratio: float = VALID_RATIO,
             num_duplicates: int = 5) -> None:
    rows:        list[dict] = []
    used_ids:    set[int]   = set()
    valid_ids:   list[int]  = []      # to pick from for duplicates

    for i in range(num_rows):
        # Unique customer_id
        cid = random.randint(100000, 999999)
        while cid in used_ids:
            cid = random.randint(100000, 999999)
        used_ids.add(cid)

        if random.random() < valid_ratio:
            rows.append(valid_row(cid))
            valid_ids.append(cid)
        else:
            rows.append(invalid_row(cid, random.choice(ERROR_TYPES)))

    # Inject duplicate rows (reuse existing customer_ids)
    for _ in range(min(num_duplicates, len(valid_ids))):
        dup_id = random.choice(valid_ids)
        rows.append(valid_row(dup_id))  # same id → duplicate

    random.shuffle(rows)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "customer_id", "full_name", "email", "phone_number", "age", "city", "signup_date"
        ])
        writer.writeheader()
        writer.writerows(rows)

    n_invalid     = sum(1 for r in rows if int(r["customer_id"]) < 100000
                        or not r["full_name"] or "@" not in r.get("email", ""))
    print(f"[DataSentry] Generated {len(rows)} rows → {output_path}")
    print(f"  Approx valid ratio: {valid_ratio:.0%}")
    print(f"  Duplicate IDs injected: {num_duplicates}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DataSentry v2 test dataset generator")
    parser.add_argument("--rows",  type=int, default=1000,           help="Number of rows")
    parser.add_argument("--out",   type=str, default="test_data.csv", help="Output CSV path")
    parser.add_argument("--valid", type=float, default=0.80,         help="Valid row ratio (0–1)")
    parser.add_argument("--dups",  type=int, default=5,              help="Duplicate rows to inject")
    args = parser.parse_args()

    generate(args.rows, args.out, args.valid, args.dups)
