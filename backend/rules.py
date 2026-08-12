"""
DataSentry - Rule Engine  backend/rules.py
Defines all validation rules as reusable, toggle-able dataclasses.
"""

from __future__ import annotations
import re
from dataclasses import dataclass, field
from datetime import datetime, date
from typing import Any
import pandas as pd

EMAIL_RE    = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
PHONE_RE    = re.compile(r"^\d{10}$")
FULLNAME_RE = re.compile(r"^[A-Za-z\s'\\-]{2,50}$")
DATE_FMTS   = ["%d-%m-%Y", "%Y-%m-%d"]

ALLOWED_CITIES = {"Chennai", "Bangalore", "Hyderabad", "Mumbai", "Delhi", "Kolkata", "Pune"}

CANONICAL_COLUMNS = ["customer_id","full_name","email","phone_number","age","city","signup_date"]


@dataclass
class ValidationError:
    field:   str
    value:   Any
    rule:    str
    message: str

    def to_dict(self) -> dict:
        return {"field": self.field, "value": str(self.value) if self.value is not None else "",
                "rule": self.rule, "message": self.message}


def _is_empty(val: Any) -> bool:
    if val is None: return True
    if isinstance(val, float) and pd.isna(val): return True
    return str(val).strip() == ""


@dataclass
class Rule:
    id:          str
    field:       str
    rule_type:   str
    description: str
    enabled:     bool = True
    severity:    str  = "error"
    def validate(self, value: Any, row: dict | None = None) -> list[ValidationError]:
        raise NotImplementedError


@dataclass
class RequiredRule(Rule):
    rule_type: str = field(default="required", init=False)
    def validate(self, value, row=None) -> list[ValidationError]:
        if not self.enabled: return []
        if _is_empty(value):
            return [ValidationError(field=self.field, value=value, rule="required",
                                    message=f"{self.field} is required")]
        return []


@dataclass
class FormatRule(Rule):
    pattern:   re.Pattern = field(default=None)
    rule_type: str        = field(default="format", init=False)
    def validate(self, value, row=None) -> list[ValidationError]:
        if not self.enabled or _is_empty(value): return []
        s = str(value).strip()
        if not self.pattern.match(s):
            return [ValidationError(field=self.field, value=s, rule="format",
                                    message=f"{self.description} -- got '{s}'")]
        return []


@dataclass
class RangeRule(Rule):
    min_val:   int | float = None
    max_val:   int | float = None
    rule_type: str         = field(default="range", init=False)
    def validate(self, value, row=None) -> list[ValidationError]:
        if not self.enabled or _is_empty(value): return []
        s = str(value).strip()
        s = s[:-2] if s.endswith(".0") else s
        try: num = int(s)
        except ValueError: return []
        errors = []
        if self.min_val is not None and num < self.min_val:
            errors.append(ValidationError(field=self.field, value=num, rule="range",
                                          message=f"{self.field} below minimum ({self.min_val}) -- got {num}"))
        if self.max_val is not None and num > self.max_val:
            errors.append(ValidationError(field=self.field, value=num, rule="range",
                                          message=f"{self.field} above maximum ({self.max_val}) -- got {num}"))
        return errors


@dataclass
class TypeRule(Rule):
    expected_type: str = "int"
    rule_type:     str = field(default="type", init=False)
    def validate(self, value, row=None) -> list[ValidationError]:
        if not self.enabled or _is_empty(value): return []
        s = str(value).strip()
        if self.expected_type == "int":
            norm = s[:-2] if s.endswith(".0") else s
            if not re.match(r"^\d+$", norm):
                return [ValidationError(field=self.field, value=s, rule="type",
                                        message=f"{self.field} must be an integer -- got '{s}'")]
        elif self.expected_type == "date":
            parsed = None
            for fmt in DATE_FMTS:
                try: parsed = datetime.strptime(s, fmt).date(); break
                except ValueError: continue
            if parsed is None:
                return [ValidationError(field=self.field, value=s, rule="type",
                                        message=f"{self.field} must be DD-MM-YYYY or YYYY-MM-DD -- got '{s}'")]
            if parsed > date.today():
                return [ValidationError(field=self.field, value=s, rule="type",
                                        message=f"{self.field} cannot be a future date -- got '{s}'")]
        return []


@dataclass
class AllowedValuesRule(Rule):
    allowed:   set = field(default_factory=set)
    rule_type: str = field(default="allowed_values", init=False)
    def validate(self, value, row=None) -> list[ValidationError]:
        if not self.enabled or _is_empty(value): return []
        s = str(value).strip()
        if s not in self.allowed:
            return [ValidationError(field=self.field, value=s, rule="allowed_values",
                                    message=f"{self.field} '{s}' not in allowed list ({', '.join(sorted(self.allowed))})")]
        return []


@dataclass
class CustomerIdRule(Rule):
    rule_type: str = field(default="format", init=False)
    def validate(self, value, row=None) -> list[ValidationError]:
        if not self.enabled: return []
        if _is_empty(value):
            return [ValidationError(field="customer_id", value=value, rule="required", message="customer_id is required")]
        s = str(value).strip()
        if s.endswith(".0"): s = s[:-2]
        if not re.match(r"^\d+$", s):
            return [ValidationError(field="customer_id", value=s, rule="type", message=f"customer_id must be numeric -- got '{s}'")]
        if len(s) != 6:
            return [ValidationError(field="customer_id", value=s, rule="format", message=f"customer_id must be exactly 6 digits -- got {len(s)} digit(s)")]
        num = int(s)
        if not (100000 <= num <= 999999):
            return [ValidationError(field="customer_id", value=num, rule="range", message=f"customer_id must be 100000-999999 -- got {num}")]
        return []


@dataclass
class PhoneRule(Rule):
    rule_type: str = field(default="format", init=False)
    def validate(self, value, row=None) -> list[ValidationError]:
        if not self.enabled: return []
        if _is_empty(value):
            return [ValidationError(field="phone_number", value=value, rule="required", message="phone_number is required")]
        s = str(value).strip()
        cleaned = re.sub(r"[\s\-\(\)\+]", "", s)
        if not PHONE_RE.match(cleaned):
            return [ValidationError(field="phone_number", value=s, rule="format", message=f"phone_number must be exactly 10 digits -- got '{s}'")]
        return []


@dataclass
class ChennaiAgeRule(Rule):
    min_age:   int = 30
    rule_type: str = field(default="cross_column", init=False)
    def validate(self, value, row=None) -> list[ValidationError]:
        if not self.enabled or row is None: return []
        city = str(value).strip().title() if not _is_empty(value) else ""
        if city != "Chennai": return []
        age_raw = row.get("age")
        if _is_empty(age_raw): return []
        s = str(age_raw).strip()
        s = s[:-2] if s.endswith(".0") else s
        try: age_val = int(s)
        except ValueError: return []
        if age_val < self.min_age:
            return [ValidationError(field="age", value=age_val, rule="cross_column",
                                    message=f"Chennai customers must be at least {self.min_age} years old -- got {age_val}")]
        return []


def build_default_rules() -> list[Rule]:
    return [
        CustomerIdRule(id="customer_id_format", field="customer_id",
                       description="Required, numeric, exactly 6 digits (100000-999999), unique"),
        RequiredRule(id="full_name_required", field="full_name", description="full_name is required"),
        FormatRule(id="full_name_format", field="full_name", pattern=FULLNAME_RE,
                   description="full_name: 2-50 chars, letters/spaces/hyphens/apostrophes"),
        RequiredRule(id="email_required", field="email", description="email is required"),
        FormatRule(id="email_format", field="email", pattern=EMAIL_RE,
                   description="email must be a valid email address"),
        PhoneRule(id="phone_format", field="phone_number", description="Required, exactly 10 digits"),
        RequiredRule(id="age_required", field="age", description="age is required"),
        TypeRule(id="age_type", field="age", expected_type="int", description="age must be a whole number"),
        RangeRule(id="age_range", field="age", min_val=18, max_val=100, description="age must be 18-100"),
        RequiredRule(id="city_required", field="city", description="city is required"),
        AllowedValuesRule(id="city_allowed", field="city", allowed=ALLOWED_CITIES,
                          description=f"city must be one of: {', '.join(sorted(ALLOWED_CITIES))}"),
        RequiredRule(id="signup_date_required", field="signup_date", description="signup_date is required"),
        TypeRule(id="signup_date_type", field="signup_date", expected_type="date",
                 description="signup_date: DD-MM-YYYY or YYYY-MM-DD, not in future"),
        ChennaiAgeRule(id="chennai_age_rule", field="city", min_age=30,
                       description="[AI Stage 3] Chennai customers must be aged 30 or older"),
    ]


def rules_to_manifest(rules: list[Rule]) -> list[dict]:
    return [{"id": r.id, "field": r.field, "rule_type": r.rule_type,
             "description": r.description, "enabled": r.enabled, "severity": r.severity}
            for r in rules]
