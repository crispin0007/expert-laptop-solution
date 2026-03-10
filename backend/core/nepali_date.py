"""
core/nepali_date.py
-------------------
Pure-Python Bikram Sambat (BS) ↔ Gregorian (AD) conversion utilities.

No external dependencies — uses a standard lookup table that covers
BS years 2000–2105 (AD 1943–2048).

Nepal Fiscal Year
-----------------
Nepal's fiscal year (FY) runs 1 Shrawan → 32 Ashadh (BS month 4 → 3).
e.g. FY 2081/082 = Shrawan 1, 2081 BS → Last day Ashadh, 2082 BS
                 ≈ July 17, 2024 AD → July 16, 2025 AD

Usage
-----
    from core.nepali_date import (
        ad_to_bs,          # date → NepaliDate
        bs_to_ad,          # (y, m, d) → date
        date_to_bs_str,    # date → "2081-04-15"
        date_to_bs_display,# date → {"bs": "२०८१ श्रावण १५", "ad": "2024-07-31", ...}
        current_bs_date,   # → NepaliDate (today in BS)
        fiscal_year_of,    # date → FiscalYear
        current_fiscal_year,
        fiscal_year_date_range,  # FiscalYear → (start_ad, end_ad)
    )
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Tuple

# ── Reference point ──────────────────────────────────────────────────────────
# Baisakh 1, 2000 BS  =  April 13, 1943 AD
_REFERENCE_AD = datetime.date(1943, 4, 13)
_REFERENCE_BS_YEAR = 2000

# ── Month names ───────────────────────────────────────────────────────────────
BS_MONTH_NAMES_EN = [
    "", "Baisakh", "Jestha", "Ashadh", "Shrawan",
    "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush",
    "Magh", "Falgun", "Chaitra",
]

BS_MONTH_NAMES_NP = [
    "", "बैशाख", "जेठ", "असार", "श्रावण",
    "भाद्र", "आश्विन", "कार्तिक", "मंसिर", "पौष",
    "माघ", "फागुन", "चैत",
]

NP_DIGITS = "०१२३४५६७८९"


def _to_np_numeral(n: int) -> str:
    return "".join(NP_DIGITS[int(d)] for d in str(n))


# ── BS calendar lookup table ─────────────────────────────────────────────────
# Format: bs_year → [days_in_month_1 … days_in_month_12]
# Covers BS 2000–2105 (AD 1943–2049)
_BS_CALENDAR: dict[int, list[int]] = {
    2000: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2001: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2002: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2003: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2004: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2005: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2006: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2007: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2008: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
    2009: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2010: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2011: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2012: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
    2013: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2014: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2015: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2016: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
    2017: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2018: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2019: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2020: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
    2021: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2022: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
    2023: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2024: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
    2025: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2026: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2027: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2028: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2029: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
    2030: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2031: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
    2032: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2033: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2034: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2035: [30, 32, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
    2036: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2037: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2038: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2039: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
    2040: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2041: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2042: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2043: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
    2044: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2045: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2046: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2047: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
    2048: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2049: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
    2050: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2051: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
    2052: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2053: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
    2054: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2055: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2056: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
    2057: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2058: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2059: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2060: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2061: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2062: [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31],
    2063: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2064: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2065: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2066: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
    2067: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2068: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2069: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2070: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
    2071: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2072: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2073: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2074: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
    2075: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
    2077: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
    2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
    2081: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 30, 30],  # 2024/25
    2082: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
    2083: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
    2084: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
    2085: [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30],
    2086: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
    2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
    2088: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 30, 30],
    2089: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2090: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
    2091: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
    2092: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2093: [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31],
    2094: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2095: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
    2096: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2097: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
    2098: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2099: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
    2100: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2101: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
    2102: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2103: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2104: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2105: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
}

# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class NepaliDate:
    year: int
    month: int
    day: int

    @property
    def month_name_en(self) -> str:
        return BS_MONTH_NAMES_EN[self.month]

    @property
    def month_name_np(self) -> str:
        return BS_MONTH_NAMES_NP[self.month]

    def isoformat(self) -> str:
        return f"{self.year:04d}-{self.month:02d}-{self.day:02d}"

    def display_en(self) -> str:
        """e.g.  '15 Shrawan 2081'"""
        return f"{self.day} {self.month_name_en} {self.year}"

    def display_np(self) -> str:
        """e.g.  '१५ श्रावण २०८१'"""
        return f"{_to_np_numeral(self.day)} {self.month_name_np} {_to_np_numeral(self.year)}"

    def __str__(self) -> str:
        return self.isoformat()


@dataclass(frozen=True)
class FiscalYear:
    """
    Nepal fiscal year.  FY 2081/082 = Shrawan 2081 → Ashadh end 2082.
    The ``label`` follows government convention: "2081/082".
    """
    bs_year: int  # The year FY starts (Shrawan)

    @property
    def label(self) -> str:
        return f"{self.bs_year}/{str(self.bs_year + 1)[-3:]}"

    @property
    def label_full(self) -> str:
        return f"{self.bs_year}/{self.bs_year + 1}"

    def __str__(self) -> str:
        return self.label


# ── Core conversion ───────────────────────────────────────────────────────────

def _total_days_in_bs_year(year: int) -> int:
    months = _BS_CALENDAR.get(year)
    if months is None:
        raise ValueError(f"BS year {year} is out of supported range (2000–2105)")
    return sum(months)


def ad_to_bs(ad_date: datetime.date) -> NepaliDate:
    """Convert a Gregorian date to a Bikram Sambat NepaliDate."""
    if isinstance(ad_date, datetime.datetime):
        ad_date = ad_date.date()

    total_days = (ad_date - _REFERENCE_AD).days
    if total_days < 0:
        raise ValueError(f"Date {ad_date} is before the reference date (1943-04-13)")

    bs_year = _REFERENCE_BS_YEAR
    bs_month = 1
    bs_day = 1

    # Advance whole BS years
    while True:
        days_in_year = _total_days_in_bs_year(bs_year)
        if total_days < days_in_year:
            break
        total_days -= days_in_year
        bs_year += 1

    # Advance whole BS months within the year
    months = _BS_CALENDAR[bs_year]
    for i, days_in_month in enumerate(months):
        if total_days < days_in_month:
            bs_month = i + 1
            bs_day = total_days + 1
            break
        total_days -= days_in_month

    return NepaliDate(year=bs_year, month=bs_month, day=bs_day)


def bs_to_ad(bs_year: int, bs_month: int, bs_day: int) -> datetime.date:
    """Convert a Bikram Sambat date to a Gregorian date."""
    if bs_year not in _BS_CALENDAR:
        raise ValueError(f"BS year {bs_year} is out of supported range (2000–2105)")
    months = _BS_CALENDAR[bs_year]
    if not (1 <= bs_month <= 12):
        raise ValueError(f"Invalid BS month {bs_month}")
    if not (1 <= bs_day <= months[bs_month - 1]):
        raise ValueError(f"Invalid BS day {bs_day} for month {bs_month} year {bs_year}")

    total_days = 0

    # Sum whole BS years before bs_year
    for y in range(_REFERENCE_BS_YEAR, bs_year):
        total_days += _total_days_in_bs_year(y)

    # Sum whole BS months before bs_month in bs_year
    for m in range(1, bs_month):
        total_days += months[m - 1]

    # Add remaining days
    total_days += bs_day - 1

    return _REFERENCE_AD + datetime.timedelta(days=total_days)


# ── Convenience helpers ───────────────────────────────────────────────────────

def current_bs_date() -> NepaliDate:
    """Return today's date in BS."""
    import datetime as _dt
    return ad_to_bs(_dt.date.today())


def date_to_bs_str(ad_date) -> str | None:
    """Return ISO-format BS string 'YYYY-MM-DD', or None if ad_date is None."""
    if ad_date is None:
        return None
    if isinstance(ad_date, datetime.datetime):
        ad_date = ad_date.date()
    return ad_to_bs(ad_date).isoformat()


def date_to_bs_display(ad_date) -> dict | None:
    """
    Return a rich display dict, or None if ad_date is None.

    Example::

        {
          "bs":      "2081-04-15",
          "bs_en":   "15 Shrawan 2081",
          "bs_np":   "१५ श्रावण २०८१",
          "ad":      "2024-07-31",
          "ad_iso":  "2024-07-31",
        }
    """
    if ad_date is None:
        return None
    if isinstance(ad_date, datetime.datetime):
        ad_date = ad_date.date()
    bs = ad_to_bs(ad_date)
    return {
        "bs":     bs.isoformat(),
        "bs_en":  bs.display_en(),
        "bs_np":  bs.display_np(),
        "ad":     str(ad_date),
        "ad_iso": ad_date.isoformat(),
    }


def datetime_to_bs_display(ad_datetime) -> dict | None:
    """
    Like date_to_bs_display but preserves time component.

    Example::

        {
          "bs":      "2081-04-15",
          "bs_en":   "15 Shrawan 2081 14:30",
          "bs_np":   "१५ श्रावण २०८१",
          "ad":      "2024-07-31T14:30:00+05:45",
          "ad_iso":  "2024-07-31",
          "time":    "14:30",
        }
    """
    if ad_datetime is None:
        return None
    result = date_to_bs_display(ad_datetime)
    if result and isinstance(ad_datetime, datetime.datetime):
        time_str = ad_datetime.strftime("%H:%M")
        result["time"] = time_str
        result["bs_en"] = f"{result['bs_en']} {time_str}"
    return result


# ── Fiscal Year ───────────────────────────────────────────────────────────────

def fiscal_year_of(ad_date: datetime.date) -> FiscalYear:
    """
    Return the Nepal Fiscal Year (FY) for a given AD date.

    FY starts on 1 Shrawan (BS month 4).  If the date is before 1 Shrawan
    of the current BS year, it belongs to the *previous* FY.
    """
    if isinstance(ad_date, datetime.datetime):
        ad_date = ad_date.date()
    bs = ad_to_bs(ad_date)
    # Shrawan = BS month 4
    if bs.month >= 4:
        return FiscalYear(bs_year=bs.year)
    else:
        return FiscalYear(bs_year=bs.year - 1)


def current_fiscal_year() -> FiscalYear:
    """Return the current Nepal Fiscal Year."""
    import datetime as _dt
    return fiscal_year_of(_dt.date.today())


def fiscal_year_date_range(fy: FiscalYear) -> Tuple[datetime.date, datetime.date]:
    """
    Return the AD (start, end) date range for a given FiscalYear.

    start = 1 Shrawan of fy.bs_year
    end   = last day of Ashadh of (fy.bs_year + 1)
    """
    start_ad = bs_to_ad(fy.bs_year, 4, 1)          # 1 Shrawan
    ashadh_days = _BS_CALENDAR[fy.bs_year + 1][2]  # index 2 = Ashadh (month 3)
    end_ad = bs_to_ad(fy.bs_year + 1, 3, ashadh_days)
    return start_ad, end_ad


def bs_year_from_ad(ad_date: datetime.date) -> int:
    """
    Return the Nepali BS year for an AD date.
    Replaces the legacy  year + 57 / year + 56  heuristic.
    """
    if isinstance(ad_date, datetime.datetime):
        ad_date = ad_date.date()
    return ad_to_bs(ad_date).year


def fiscal_year_label_for(ad_date: datetime.date) -> str:
    """Return e.g. '2081/082' for any given AD date."""
    return str(fiscal_year_of(ad_date))
