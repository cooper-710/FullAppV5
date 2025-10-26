from __future__ import annotations

import asyncio
import math
import re
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple

import httpx
import numpy as np
import pandas as pd
from fastapi import HTTPException
from pybaseball import playerid_reverse_lookup, statcast_pitcher

SpanLiteral = Literal["regular", "postseason", "total"]
RollupLiteral = Literal["season", "last3", "career"]

FG_API_BASE = "https://www.fangraphs.com/api/players/stats"
FG_SEASON_TYPE = {"regular": 1, "postseason": 2}  # combine manually for total

# Columns that remain strings (avoid numeric coercion)
FG_STRING_COLS = {
    "Season",
    "Team",
    "ateam",
    "AbbName",
    "AbbLevel",
    "leagueUrl",
    "FB%1",
}

# Columns treated as additive when combining spans
ADDITIVE_COLS = {
    "W",
    "L",
    "G",
    "GS",
    "CG",
    "ShO",
    "SV",
    "BS",
    "IP",
    "TBF",
    "H",
    "R",
    "ER",
    "HR",
    "BB",
    "IBB",
    "HBP",
    "SO",
    "GB",
    "FB",
    "LD",
    "IFFB",
    "Balls",
    "Strikes",
    "Pitches",
    "Events",
    "HardHit",
    "Barrels",
    "QS",
    "RS",
    "IFH",
    "BU",
    "BUH",
    "Start-IP",
    "RAR",
    "WAR",
    "Dollars",
    "WPA",
    "-WPA",
    "+WPA",
    "RE24",
    "REW",
    "pLI",
    "inLI",
    "gmLI",
    "Balls",
    "Strikes",
    "Pitches",
    "Pulls",
}

# Weighted rate columns keyed by their weighting basis
IP_WEIGHT_COLS = {
    "ERA",
    "FIP",
    "xFIP",
    "SIERA",
    "tERA",
    "WHIP",
    "K/9",
    "BB/9",
    "HR/9",
    "K/BB",
    "pLI",
    "inLI",
    "gmLI",
}

TBF_WEIGHT_COLS = {
    "K%",
    "BB%",
    "K-BB%",
    "O-Swing%",
    "Z-Swing%",
    "Swing%",
    "O-Contact%",
    "Z-Contact%",
    "Contact%",
    "Zone%",
    "F-Strike%",
    "SwStr%",
    "CStr%",
    "C+SwStr%",
    "Pull%",
    "Cent%",
    "Oppo%",
}

EVENT_WEIGHT_COLS = {
    "EV",
    "maxEV",
    "LA",
    "HardHit%",
    "Barrel%",
}

BBALL_RATE_COLS = {
    "GB%",
    "FB%",
    "LD%",
    "IFFB%",
    "HR/FB",
    "GB/FB",
    "Soft%",
    "Med%",
    "Hard%",
}

PITCH_TYPE_RATE_COLS = {
    "FB%",
    "SL%",
    "CT%",
    "CB%",
    "CH%",
    "XX%",
    "pfxFA%",
    "pfxSI%",
    "pfxSL%",
    "pfxKC%",
    "pfxCH%",
    "pfxFC%",
    "piFA%",
    "piSI%",
    "piSL%",
    "piCH%",
    "piCU%",
    "piFC%",
    "piFS%",
    "piXX%",
}

VELOCITY_COLS = {
    "FBv",
    "SLv",
    "CTv",
    "CBv",
    "CHv",
    "pivFA",
    "pivSI",
    "pivSL",
    "pivCH",
    "pivCU",
    "pivFC",
    "pivFS",
    "pivXX",
    "pfxvFA",
    "pfxvSI",
    "pfxvSL",
    "pfxvKC",
    "pfxvCH",
    "pfxvFC",
}

RUN_VALUE_COLS = {
    "wFB",
    "wSL",
    "wCB",
    "wCH",
    "wCT",
    "wFB/C",
    "wSL/C",
    "wCB/C",
    "wCH/C",
    "wCT/C",
    "pfxwFA",
    "pfxwSI",
    "pfxwSL",
    "pfxwKC",
    "pfxwCH",
    "pfxwFC",
    "pfxwFA/C",
    "pfxwSI/C",
    "pfxwSL/C",
    "pfxwKC/C",
    "pfxwCH/C",
    "pfxwFC/C",
    "piwFA",
    "piwSI",
    "piwSL",
    "piwCH",
    "piwCU",
    "piwFC",
    "piwFS",
    "piwXX",
    "piwFA/C",
    "piwSI/C",
    "piwSL/C",
    "piwCH/C",
    "piwCU/C",
    "piwFC/C",
    "piwFS/C",
    "piwXX/C",
}


def _strip_html(text: Any) -> str:
    if text is None:
        return ""
    return re.sub(r"<.*?>", "", str(text))


def _ip_to_outs(ip_val: Any) -> int:
    if ip_val is None or (isinstance(ip_val, float) and math.isnan(ip_val)):
        return 0
    try:
        ip_float = float(ip_val)
    except (TypeError, ValueError):
        return 0
    whole = int(math.floor(ip_float))
    frac = int(round((ip_float - whole) * 10))
    frac = min(max(frac, 0), 2)
    return whole * 3 + frac


def _outs_to_ip(outs: int) -> float:
    whole = outs // 3
    rem = outs % 3
    return round(whole + rem / 10.0, 1)


def _safe_div(num: float, denom: float) -> Optional[float]:
    if denom in (None, 0):
        return None
    try:
        return float(num) / float(denom)
    except (TypeError, ZeroDivisionError, ValueError):
        return None


def _safe_pct(num: float, denom: float) -> Optional[float]:
    val = _safe_div(num, denom)
    return val if val is None else float(val)


def _weighted_average(pairs: Iterable[Tuple[Optional[float], float]]) -> Optional[float]:
    total_weight = 0.0
    total = 0.0
    for value, weight in pairs:
        if value is None:
            continue
        if weight <= 0:
            continue
        total += float(value) * weight
        total_weight += weight
    if total_weight <= 0:
        return None
    return total / total_weight


class TTLCache:
    """Very small async-safe TTL cache for expensive network responses."""

    def __init__(self, ttl_seconds: float = 1800.0) -> None:
        self.ttl = ttl_seconds
        self._data: Dict[Any, Tuple[float, Any]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: Any) -> Optional[Any]:
        async with self._lock:
            entry = self._data.get(key)
            if not entry:
                return None
            expires_at, value = entry
            if expires_at < time.time():
                del self._data[key]
                return None
            return value

    async def set(self, key: Any, value: Any) -> None:
        async with self._lock:
            self._data[key] = (time.time() + self.ttl, value)


_fg_cache = TTLCache(ttl_seconds=1800.0)


async def _http_get_json(url: str, params: Dict[str, Any], timeout: float = 20.0) -> Dict[str, Any]:
    cache_key = (url, tuple(sorted(params.items())))
    cached = await _fg_cache.get(cache_key)
    if cached is not None:
        return cached

    backoff = 0.75
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(5):
            try:
                response = await client.get(url, params=params)
                if response.status_code in (429, 500, 502, 503, 504):
                    await asyncio.sleep(backoff * (attempt + 1))
                    continue
                response.raise_for_status()
                data = response.json()
                await _fg_cache.set(cache_key, data)
                return data
            except (httpx.TimeoutException, httpx.NetworkError):
                if attempt == 4:
                    raise
                await asyncio.sleep(backoff * (attempt + 1))
    raise RuntimeError("unreachable")


@lru_cache(maxsize=512)
def _lookup_fg_id(mlbam: int) -> int:
    df = playerid_reverse_lookup([mlbam], key_type="mlbam")
    if df.empty or "key_fangraphs" not in df.columns:
        raise ValueError(f"No FanGraphs id for MLBAM {mlbam}")
    fg_id = int(df.iloc[0]["key_fangraphs"])
    return fg_id


def _coerce_numeric(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.columns:
        if col in FG_STRING_COLS:
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            continue
        converted = pd.to_numeric(df[col], errors="coerce")
        if converted.notna().sum():
            df[col] = converted
    return df


def _season_label_from_row(row: pd.Series) -> Tuple[Optional[int], str]:
    row_type = row.get("type")
    season_int = None
    if pd.notna(row.get("aseason")):
        try:
            season_int = int(row["aseason"])
        except Exception:
            season_int = None

    if row_type == -1:
        return season_int, "Career"
    if row_type == -2:
        return season_int, "Postseason"
    label = season_int if season_int is not None else _strip_html(row.get("Season"))
    return season_int, str(label)


def _normalize_fg_data(raw: List[Dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame(raw or [])
    if df.empty:
        return df
    df = _coerce_numeric(df)
    seasons: List[str] = []
    season_ints: List[Optional[int]] = []
    for _, row in df.iterrows():
        season_int, label = _season_label_from_row(row)
        season_ints.append(season_int)
        seasons.append(label)
    return df.assign(season_label=seasons, season_int=season_ints)


async def _fetch_fg_table(fg_id: int, year: int, span: SpanLiteral) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    seasontype = FG_SEASON_TYPE.get(span, 1)
    params = {
        "playerid": fg_id,
        "position": "P",
        "stats": "pit",
        "season": year,
        "grid": "season",
        "seasontype": seasontype,
    }
    data = await _http_get_json(FG_API_BASE, params)
    df = _normalize_fg_data(data.get("data") or [])
    meta = data.get("playerInfo") or {}
    return df, meta


def _split_regular_post(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    mask = (df.get("AbbLevel") == "MLB") | df["type"].isin({-1, -2})
    # Some postseason aggregates do not have AbbLevel; keep -2 regardless
    return df.loc[mask].copy()


def _series_to_dict(row: Optional[pd.Series]) -> Dict[str, Any]:
    if row is None:
        return {}
    out: Dict[str, Any] = {}
    for key, value in row.items():
        if isinstance(value, (np.generic,)):
            value = value.item()
        out[key] = value
    return out


def _merge_dicts(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(a)
    for key, value in b.items():
        if key not in merged or merged[key] is None:
            merged[key] = value
    return merged


@dataclass
class SeasonSlice:
    label: str
    season: Optional[int]
    span: SpanLiteral
    regular: Dict[str, Any]
    postseason: Dict[str, Any]
    totals: Dict[str, float]


def _compute_totals(regular: Dict[str, Any], postseason: Dict[str, Any]) -> Dict[str, float]:
    def g(src: Dict[str, Any], key: str) -> float:
        val = src.get(key)
        if val is None:
            return 0.0
        try:
            return float(val)
        except (TypeError, ValueError):
            return 0.0

    outs_reg = _ip_to_outs(regular.get("IP"))
    outs_post = _ip_to_outs(postseason.get("IP"))
    outs_total = outs_reg + outs_post
    totals: Dict[str, float] = {
        "outs": float(outs_total),
        "ip_inn": outs_total / 3.0 if outs_total else 0.0,
        "ip_display": _outs_to_ip(outs_total),
        "IP": _outs_to_ip(outs_total),
        "TBF": g(regular, "TBF") + g(postseason, "TBF"),
        "H": g(regular, "H") + g(postseason, "H"),
        "R": g(regular, "R") + g(postseason, "R"),
        "ER": g(regular, "ER") + g(postseason, "ER"),
        "HR": g(regular, "HR") + g(postseason, "HR"),
        "BB": g(regular, "BB") + g(postseason, "BB"),
        "IBB": g(regular, "IBB") + g(postseason, "IBB"),
        "HBP": g(regular, "HBP") + g(postseason, "HBP"),
        "SO": g(regular, "SO") + g(postseason, "SO"),
        "Balls": g(regular, "Balls") + g(postseason, "Balls"),
        "Strikes": g(regular, "Strikes") + g(postseason, "Strikes"),
        "Pitches": g(regular, "Pitches") + g(postseason, "Pitches"),
        "Events": g(regular, "Events") + g(postseason, "Events"),
        "HardHit": g(regular, "HardHit") + g(postseason, "HardHit"),
        "Barrels": g(regular, "Barrels") + g(postseason, "Barrels"),
        "GB": g(regular, "GB") + g(postseason, "GB"),
        "FB": g(regular, "FB") + g(postseason, "FB"),
        "LD": g(regular, "LD") + g(postseason, "LD"),
        "IFFB": g(regular, "IFFB") + g(postseason, "IFFB"),
        "W": g(regular, "W") + g(postseason, "W"),
        "L": g(regular, "L") + g(postseason, "L"),
        "G": g(regular, "G") + g(postseason, "G"),
        "GS": g(regular, "GS") + g(postseason, "GS"),
        "SV": g(regular, "SV") + g(postseason, "SV"),
        "QS": g(regular, "QS") + g(postseason, "QS"),
        "RS": g(regular, "RS") + g(postseason, "RS"),
        "RAR": g(regular, "RAR") + g(postseason, "RAR"),
        "WAR": g(regular, "WAR") + g(postseason, "WAR"),
        "Dollars": g(regular, "Dollars") + g(postseason, "Dollars"),
        "WPA": g(regular, "WPA") + g(postseason, "WPA"),
        "-WPA": g(regular, "-WPA") + g(postseason, "-WPA"),
        "+WPA": g(regular, "+WPA") + g(postseason, "+WPA"),
        "RE24": g(regular, "RE24") + g(postseason, "RE24"),
        "REW": g(regular, "REW") + g(postseason, "REW"),
        "pLI_sum": g(regular, "pLI") * g(regular, "G") + g(postseason, "pLI") * g(postseason, "G"),
        "inLI_sum": g(regular, "inLI") * g(regular, "G") + g(postseason, "inLI") * g(postseason, "G"),
        "gmLI_sum": g(regular, "gmLI") * g(regular, "G") + g(postseason, "gmLI") * g(postseason, "G"),
    }
    return totals


def _build_slice(label: str, season: Optional[int], span: SpanLiteral, regular: Dict[str, Any], postseason: Dict[str, Any]) -> SeasonSlice:
    totals = _compute_totals(regular, postseason)
    return SeasonSlice(label=label, season=season, span=span, regular=regular, postseason=postseason, totals=totals)


def _select_rows(
    df_regular: pd.DataFrame,
    df_post: pd.DataFrame,
    span: SpanLiteral,
    rollup: RollupLiteral,
    year: int,
) -> List[SeasonSlice]:
    rows: List[SeasonSlice] = []

    reg_map: Dict[int, Dict[str, Any]] = {}
    if not df_regular.empty:
        for _, row in df_regular.iterrows():
            if row["type"] == 0 and pd.notna(row["season_int"]):
                reg_map[int(row["season_int"])] = _series_to_dict(row)
    post_map: Dict[int, Dict[str, Any]] = {}
    if not df_post.empty:
        for _, row in df_post.iterrows():
            if row["type"] == 0 and pd.notna(row["season_int"]):
                post_map[int(row["season_int"])] = _series_to_dict(row)

    if rollup == "season":
        if span == "regular":
            data = reg_map.get(year)
            if data:
                rows.append(_build_slice(str(year), year, span, data, {}))
        elif span == "postseason":
            data = post_map.get(year)
            if data:
                rows.append(_build_slice(f"{year} PS", year, span, {}, data))
        else:  # total
            reg = reg_map.get(year, {})
            post = post_map.get(year, {})
            if reg or post:
                rows.append(_build_slice(str(year), year, span, reg, post))
        return rows

    if rollup == "last3":
        if span == "regular":
            years = sorted([y for y in reg_map if y <= year], reverse=True)[:3]
            for y in sorted(years):
                rows.append(_build_slice(str(y), y, span, reg_map[y], {}))
        elif span == "postseason":
            years = sorted([y for y in post_map if y <= year], reverse=True)[:3]
            for y in sorted(years):
                rows.append(_build_slice(f"{y} PS", y, span, {}, post_map[y]))
        else:
            years = sorted({y for y in reg_map if y <= year} | {y for y in post_map if y <= year}, reverse=True)[:3]
            for y in sorted(years):
                rows.append(_build_slice(str(y), y, span, reg_map.get(y, {}), post_map.get(y, {})))
        return rows

    # career
    if span == "regular":
        total_row = df_regular.loc[df_regular["type"] == -1].head(1)
        data = _series_to_dict(total_row.iloc[0]) if not total_row.empty else {}
        if data:
            rows.append(_build_slice("Career", None, span, data, {}))
    elif span == "postseason":
        total_row = df_post.loc[df_post["type"] == -2].head(1)
        data = _series_to_dict(total_row.iloc[0]) if not total_row.empty else {}
        if data:
            rows.append(_build_slice("Career (PS)", None, span, {}, data))
    else:
        reg_total = df_regular.loc[df_regular["type"] == -1].head(1)
        post_total = df_post.loc[df_post["type"] == -2].head(1)
        reg_dict = _series_to_dict(reg_total.iloc[0]) if not reg_total.empty else {}
        post_dict = _series_to_dict(post_total.iloc[0]) if not post_total.empty else {}
        if reg_dict or post_dict:
            rows.append(_build_slice("Career", None, span, reg_dict, post_dict))
    return rows


def _value_from_slice(s: SeasonSlice, key: str) -> Optional[float]:
    if s.span == "regular":
        return s.regular.get(key)
    if s.span == "postseason":
        return s.postseason.get(key)

    reg_val = s.regular.get(key)
    post_val = s.postseason.get(key)
    if key in ADDITIVE_COLS:
        return (reg_val or 0) + (post_val or 0)

    if key in IP_WEIGHT_COLS:
        weights = []
        ip_reg = _safe_div(_ip_to_outs(s.regular.get("IP")), 3.0) or 0.0
        ip_post = _safe_div(_ip_to_outs(s.postseason.get("IP")), 3.0) or 0.0
        weights.append((reg_val, ip_reg))
        weights.append((post_val, ip_post))
        return _weighted_average(weights)

    if key in TBF_WEIGHT_COLS:
        weights = []
        weights.append((reg_val, s.regular.get("TBF", 0) or 0.0))
        weights.append((post_val, s.postseason.get("TBF", 0) or 0.0))
        return _weighted_average(weights)

    if key in EVENT_WEIGHT_COLS:
        weights = []
        weights.append((reg_val, s.regular.get("Events", 0) or 0.0))
        weights.append((post_val, s.postseason.get("Events", 0) or 0.0))
        return _weighted_average(weights)

    if key in BBALL_RATE_COLS:
        # Compute from totals when possible
        gb = s.totals.get("GB", 0.0)
        fb = s.totals.get("FB", 0.0)
        ld = s.totals.get("LD", 0.0)
        iffb = s.totals.get("IFFB", 0.0)
        denom = gb + fb + ld + iffb
        if key == "GB%" and denom:
            return gb / denom
        if key == "FB%" and denom:
            return fb / denom
        if key == "LD%" and denom:
            return ld / denom
        if key == "IFFB%" and denom:
            return iffb / denom
        if key == "GB/FB" and fb:
            return gb / fb
        if key == "HR/FB" and fb:
            return s.totals.get("HR", 0.0) / fb
        if key == "Soft%" or key == "Med%" or key == "Hard%":
            weights = [
                (reg_val, s.regular.get("BIP", s.regular.get("Events", 0) or 0.0)),
                (post_val, s.postseason.get("BIP", s.postseason.get("Events", 0) or 0.0)),
            ]
            return _weighted_average(weights)
        return None

    if key in VELOCITY_COLS or key in RUN_VALUE_COLS or key in PITCH_TYPE_RATE_COLS:
        weights = [
            (reg_val, s.regular.get("Pitches", 0) or s.totals.get("Pitches", 0.0)),
            (post_val, s.postseason.get("Pitches", 0) or 0.0),
        ]
        return _weighted_average(weights)

    # default weighted by games
    weights = [
        (reg_val, s.regular.get("G", 0) or 0.0),
        (post_val, s.postseason.get("G", 0) or 0.0),
    ]
    return _weighted_average(weights)


def _standard_section(rows: List[SeasonSlice]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for s in rows:
        ip_inn = s.totals.get("ip_inn")
        er = s.totals.get("ER")
        bb = s.totals.get("BB")
        h = s.totals.get("H")
        tbf = s.totals.get("TBF")
        hr = s.totals.get("HR")
        so = s.totals.get("SO")
        avg_ab = s.totals.get("TBF") - s.totals.get("BB") - s.totals.get("IBB") - s.totals.get("HBP")
        standard = {
            "season": s.label,
            "W": s.totals.get("W"),
            "L": s.totals.get("L"),
            "G": s.totals.get("G"),
            "GS": s.totals.get("GS"),
            "SV": s.totals.get("SV"),
            "IP": s.totals.get("IP"),
            "TBF": tbf,
            "H": s.totals.get("H"),
            "R": s.totals.get("R"),
            "ER": er,
            "HR": hr,
            "BB": bb,
            "SO": so,
            "ERA": _safe_div(er * 9.0, ip_inn) if ip_inn else None,
            "WHIP": _safe_div(h + bb, ip_inn) if ip_inn else None,
            "AVG": _safe_div(s.totals.get("H"), avg_ab) if avg_ab else None,
        }
        out.append(standard)
    return out


def _advanced_section(rows: List[SeasonSlice]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for s in rows:
        ip_inn = s.totals.get("ip_inn")
        so = s.totals.get("SO")
        bb = s.totals.get("BB")
        hr = s.totals.get("HR")
        tbf = s.totals.get("TBF")
        advanced = {
            "season": s.label,
            "K/9": _safe_div(so * 9.0, ip_inn) if ip_inn else None,
            "BB/9": _safe_div(bb * 9.0, ip_inn) if ip_inn else None,
            "K%": _safe_pct(so, tbf),
            "BB%": _safe_pct(bb, tbf),
            "K-BB%": None,
            "HR/9": _safe_div(hr * 9.0, ip_inn) if ip_inn else None,
            "FIP": _value_from_slice(s, "FIP"),
            "xFIP": _value_from_slice(s, "xFIP"),
            "SIERA": _value_from_slice(s, "SIERA"),
            "WAR": s.totals.get("WAR"),
        }
        if advanced["K%"] is not None and advanced["BB%"] is not None:
            advanced["K-BB%"] = advanced["K%"] - advanced["BB%"]
        out.append(advanced)
    return out


def _statcast_section(rows: List[SeasonSlice]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for s in rows:
        events = s.totals.get("Events")
        statcast = {
            "season": s.label,
            "Events": events,
            "EV": _value_from_slice(s, "EV"),
            "maxEV": _value_from_slice(s, "maxEV"),
            "LA": _value_from_slice(s, "LA"),
            "HardHit": s.totals.get("HardHit"),
            "HardHit%": _safe_pct(s.totals.get("HardHit"), events),
            "Barrels": s.totals.get("Barrels"),
            "Barrel%": _safe_pct(s.totals.get("Barrels"), events),
            "xERA": _value_from_slice(s, "xERA"),
        }
        out.append(statcast)
    return out


def _batted_ball_section(rows: List[SeasonSlice]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for s in rows:
        bb = {
            "season": s.label,
            "GB%": _value_from_slice(s, "GB%"),
            "FB%": _value_from_slice(s, "FB%"),
            "LD%": _value_from_slice(s, "LD%"),
            "IFFB%": _value_from_slice(s, "IFFB%"),
            "HR/FB": _value_from_slice(s, "HR/FB"),
            "GB/FB": _value_from_slice(s, "GB/FB"),
            "Soft%": _value_from_slice(s, "Soft%"),
            "Med%": _value_from_slice(s, "Med%"),
            "Hard%": _value_from_slice(s, "Hard%"),
        }
        out.append(bb)
    return out


def _win_prob_section(rows: List[SeasonSlice]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for s in rows:
        wp = {
            "season": s.label,
            "WPA": _value_from_slice(s, "WPA"),
            "+WPA": _value_from_slice(s, "+WPA"),
            "-WPA": _value_from_slice(s, "-WPA"),
            "WPA/LI": _value_from_slice(s, "WPA/LI"),
            "Clutch": _value_from_slice(s, "Clutch"),
            "RE24": _value_from_slice(s, "RE24"),
            "REW": _value_from_slice(s, "REW"),
        }
        out.append(wp)
    return out


def _pitch_values_section(rows: List[SeasonSlice]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    keys = ["wFB", "wFB/C", "wSL", "wSL/C", "wCB", "wCB/C", "wCH", "wCH/C", "wCT", "wCT/C"]
    for s in rows:
        entry = {"season": s.label}
        for key in keys:
            entry[key] = _value_from_slice(s, key)
        out.append(entry)
    return out


def _pitch_type_velo_section(rows: List[SeasonSlice]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    keys = ["FB%", "FBv", "SL%", "SLv", "CT%", "CTv", "CB%", "CBv", "CH%", "CHv", "XX%", "pivFA", "pivSI", "pivSL", "pivCH", "pivCU", "pivFC", "pivFS", "pivXX"]
    for s in rows:
        entry = {"season": s.label}
        for key in keys:
            entry[key] = _value_from_slice(s, key)
        out.append(entry)
    return out


def _plate_discipline_section(rows: List[SeasonSlice]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    keys = ["O-Swing%", "Z-Swing%", "Swing%", "O-Contact%", "Z-Contact%", "Contact%", "Zone%", "F-Strike%", "SwStr%", "CStr%", "C+SwStr%"]
    for s in rows:
        entry = {"season": s.label}
        for key in keys:
            entry[key] = _value_from_slice(s, key)
        out.append(entry)
    return out


def _pitchingbot_section(rows: List[SeasonSlice]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    keys = [
        "pb_overall",
        "pb_stuff",
        "pb_command",
        "pb_ERA",
        "pb_xRV100",
        "pb_o_FF",
        "pb_s_FF",
        "pb_c_FF",
        "pb_o_SI",
        "pb_s_SI",
        "pb_c_SI",
        "pb_o_SL",
        "pb_s_SL",
        "pb_c_SL",
        "pb_o_CH",
        "pb_s_CH",
        "pb_c_CH",
        "pb_o_KC",
        "pb_s_KC",
        "pb_c_KC",
    ]
    for s in rows:
        entry = {"season": s.label}
        for key in keys:
            entry[key] = _value_from_slice(s, key)
        out.append(entry)
    return out


def _fielding_pitcher_section(rows: List[SeasonSlice]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    keys = ["RA9-Wins", "BIP-Wins", "LOB-Wins", "BS-Wins", "CFraming", "Pull%", "Cent%", "Oppo%"]
    for s in rows:
        entry = {"season": s.label}
        for key in keys:
            entry[key] = _value_from_slice(s, key)
        out.append(entry)
    return out


def _value_section(rows: List[SeasonSlice]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for s in rows:
        entry = {
            "season": s.label,
            "WAR": s.totals.get("WAR"),
            "RAR": s.totals.get("RAR"),
            "Dollars": s.totals.get("Dollars"),
            "Start-IP": s.totals.get("Start-IP"),
            "QS": s.totals.get("QS"),
            "RS": s.totals.get("RS"),
            "tERA": _value_from_slice(s, "tERA"),
            "xERA": _value_from_slice(s, "xERA"),
            "SIERA": _value_from_slice(s, "SIERA"),
        }
        out.append(entry)
    return out


def _clean_section(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    for row in rows:
        normalized = {}
        for key, value in row.items():
            if isinstance(value, (np.generic,)):
                value = value.item()
            if isinstance(value, float):
                if math.isfinite(value):
                    normalized[key] = value
                else:
                    normalized[key] = None
            else:
                normalized[key] = value
        cleaned.append(normalized)
    return cleaned


async def _fetch_statcast(mlbam: int, seasons: List[int], span: SpanLiteral) -> pd.DataFrame:
    if not seasons:
        return pd.DataFrame()

    async def run(year: int) -> pd.DataFrame:
        start = f"{year}-03-01"
        end = f"{year}-11-30"
        return await asyncio.to_thread(statcast_pitcher, start, end, mlbam)

    dfs = await asyncio.gather(*[run(year) for year in seasons])
    combined = pd.concat([df for df in dfs if df is not None and not df.empty], ignore_index=True) if dfs else pd.DataFrame()
    if combined.empty:
        return combined

    if "game_type" in combined.columns:
        if span == "regular":
            combined = combined.loc[combined["game_type"].isin(["R", "S"])].copy()
        elif span == "postseason":
            combined = combined.loc[combined["game_type"].isin(["P", "W", "D", "L"])].copy()
        else:
            combined = combined.loc[combined["game_type"].isin(["R", "S", "P", "W", "D", "L"])].copy()
    return combined


def _pitch_mix_from_statcast(df: pd.DataFrame) -> List[Dict[str, Any]]:
    if df.empty:
        return []
    counts = df.groupby("pitch_type").size().rename("count")
    total = counts.sum()
    velo = df.groupby("pitch_type")["release_speed"].mean().rename("v_avg")
    whiff = (
        df.assign(is_whiff=df["description"].str.contains("swinging_strike", case=False, na=False))
        .groupby("pitch_type")["is_whiff"]
        .mean()
        .rename("whiff_rate")
    )
    out: List[Dict[str, Any]] = []
    for pitch in counts.index:
        out.append(
            {
                "pitch_type": pitch,
                "usage_pct": (counts[pitch] / total) if total else 0.0,
                "avg_velo": float(velo.get(pitch, np.nan)),
                "whiff_rate": float(whiff.get(pitch, np.nan)),
                "count": int(counts[pitch]),
            }
        )
    out.sort(key=lambda r: r["usage_pct"], reverse=True)
    return out


def _movement_scatter(df: pd.DataFrame) -> List[Dict[str, Any]]:
    if df.empty:
        return []
    grouped = df.groupby("pitch_type").agg(
        horz=("pfx_x", "mean"),
        vert=("pfx_z", "mean"),
        vel=("release_speed", "mean"),
        count=("pitch_type", "size"),
    )
    out: List[Dict[str, Any]] = []
    for pitch, row in grouped.iterrows():
        out.append(
            {
                "pitch_type": pitch,
                "horz": float(row["horz"]),
                "vert": float(row["vert"]),
                "velo": float(row["vel"]),
                "count": int(row["count"]),
            }
        )
    return out


def _velocity_trend(df: pd.DataFrame) -> List[Dict[str, Any]]:
    if df.empty or "game_date" not in df.columns:
        return []
    df = df.copy()
    df["date"] = pd.to_datetime(df["game_date"])
    grouped = df.groupby(["date", "pitch_type"])["release_speed"].mean().reset_index()
    grouped.sort_values("date", inplace=True)
    out: List[Dict[str, Any]] = []
    for _, row in grouped.iterrows():
        out.append(
            {
                "date": row["date"].strftime("%Y-%m-%d"),
                "pitch_type": row["pitch_type"],
                "velo": float(row["release_speed"]),
            }
        )
    return out


def _pitch_type_splits(df: pd.DataFrame) -> List[Dict[str, Any]]:
    if df.empty:
        return []
    grouped = df.groupby("pitch_type").agg(
        count=("pitch_type", "size"),
        avg_velo=("release_speed", "mean"),
        avg_spin=("release_spin_rate", "mean"),
        whiff_rate=("description", lambda x: np.mean(x.str.contains("swinging_strike", case=False, na=False))),
        csw=("description", lambda x: np.mean(x.str.contains("called_strike|swinging_strike", case=False, na=False))),
        avg_iva=("launch_speed", "mean"),
    )
    total = grouped["count"].sum()
    grouped["usage"] = grouped["count"] / total if total else 0.0
    grouped.reset_index(inplace=True)
    grouped.rename(columns={"pitch_type": "pitch_type"}, inplace=True)
    for col in grouped.columns:
        if col != "pitch_type":
            grouped[col] = grouped[col].astype(float, errors="ignore")
    return grouped.to_dict(orient="records")


def _splits_from_statcast(df: pd.DataFrame) -> List[Dict[str, Any]]:
    if df.empty:
        return []
    df = df.copy()
    df["is_whiff"] = df["description"].str.contains("swinging_strike", case=False, na=False)
    df["is_contact"] = df["description"].str.contains("in_play", case=False, na=False)
    grouped = df.groupby("stand").agg(
        pitches=("stand", "size"),
        whiff_rate=("is_whiff", "mean"),
        contact_rate=("is_contact", "mean"),
        avg_velo=("release_speed", "mean"),
        avg_ev=("launch_speed", "mean"),
    )
    grouped.reset_index(inplace=True)
    grouped.rename(columns={"stand": "handedness"}, inplace=True)
    return grouped.to_dict(orient="records")


def _game_log_from_statcast(df: pd.DataFrame) -> List[Dict[str, Any]]:
    if df.empty:
        return []
    df = df.copy()
    df["date"] = pd.to_datetime(df["game_date"])
    df["is_whiff"] = df["description"].str.contains("swinging_strike", case=False, na=False)
    df["is_contact"] = df["description"].str.contains("in_play", case=False, na=False)
    grouped = df.groupby(["game_pk", "date"]).agg(
        pitches=("pitch_type", "size"),
        whiffs=("is_whiff", "sum"),
        contacts=("is_contact", "sum"),
        avg_velo=("release_speed", "mean"),
        avg_launch_speed=("launch_speed", "mean"),
        avg_launch_angle=("launch_angle", "mean"),
    ).reset_index()
    grouped.sort_values("date", inplace=True)
    out: List[Dict[str, Any]] = []
    for _, row in grouped.iterrows():
        out.append(
            {
                "game_pk": int(row["game_pk"]),
                "date": row["date"].strftime("%Y-%m-%d"),
                "pitches": int(row["pitches"]),
                "whiffs": float(row["whiffs"]),
                "contacts": float(row["contacts"]),
                "avg_velo": float(row["avg_velo"]),
                "avg_launch_speed": float(row["avg_launch_speed"]) if not math.isnan(row["avg_launch_speed"]) else None,
                "avg_launch_angle": float(row["avg_launch_angle"]) if not math.isnan(row["avg_launch_angle"]) else None,
            }
        )
    return out


def _player_graphs(rows: List[SeasonSlice]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for s in rows:
        ip_inn = s.totals.get("ip_inn")
        er = s.totals.get("ER")
        entry = {
            "season": s.label,
            "ERA": _safe_div(er * 9.0, ip_inn) if ip_inn else None,
            "FIP": _value_from_slice(s, "FIP"),
            "xFIP": _value_from_slice(s, "xFIP"),
            "WAR": s.totals.get("WAR"),
        }
        out.append(entry)
    return out


async def build_pitcher_deep_dive(
    mlbam: int,
    year: int,
    span: SpanLiteral,
    rollup: RollupLiteral,
) -> Dict[str, Any]:
    if span not in {"regular", "postseason", "total"}:
        raise HTTPException(status_code=400, detail="invalid span")
    if rollup not in {"season", "last3", "career"}:
        raise HTTPException(status_code=400, detail="invalid rollup")

    try:
        fg_id = _lookup_fg_id(mlbam)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    df_regular = pd.DataFrame()
    df_post = pd.DataFrame()
    meta: Dict[str, Any] = {}

    if span in ("regular", "total"):
        df_regular, meta = await _fetch_fg_table(fg_id, year, "regular")
        df_regular = _split_regular_post(df_regular)
    if span in ("postseason", "total"):
        df_post, meta_post = await _fetch_fg_table(fg_id, year, "postseason")
        df_post = _split_regular_post(df_post)
        if not meta:
            meta = meta_post

    slices = _select_rows(df_regular, df_post, span, rollup, year)
    sections: Dict[str, List[Dict[str, Any]]] = {}
    missing: Dict[str, bool] = {}

    def add_section(name: str, builder):
        try:
            data = builder(slices)
            data = _clean_section(data)
            sections[name] = data
            missing[name] = len(data) == 0
        except Exception:
            sections[name] = []
            missing[name] = True

    add_section("standard", _standard_section)
    add_section("advanced", _advanced_section)
    add_section("statcast", _statcast_section)
    add_section("batted_ball", _batted_ball_section)
    add_section("win_prob", _win_prob_section)
    add_section("pitch_values", _pitch_values_section)
    add_section("pitch_type_velo", _pitch_type_velo_section)
    add_section("plate_discipline", _plate_discipline_section)
    add_section("pitchingbot", _pitchingbot_section)
    add_section("fielding_pitcher", _fielding_pitcher_section)
    add_section("value", _value_section)
    add_section("player_graphs", _player_graphs)

    # Savant-driven sections
    seasons_for_statcast: List[int] = []
    if rollup == "season":
        seasons_for_statcast = [year]
    elif rollup == "last3":
        seasons_for_statcast = [y for y in range(year - 2, year + 1) if y > 1900]
    else:
        if not slices:
            seasons_for_statcast = []
        else:
            years = []
            for s in slices:
                if s.season:
                    years.append(s.season)
            if years:
                seasons_for_statcast = list(range(min(years), year + 1))

    statcast_df = await _fetch_statcast(mlbam, seasons_for_statcast, span) if seasons_for_statcast else pd.DataFrame()

    sections["pitch_type_splits"] = _pitch_type_splits(statcast_df)
    missing["pitch_type_splits"] = len(sections["pitch_type_splits"]) == 0

    sections["splits"] = _splits_from_statcast(statcast_df)
    missing["splits"] = len(sections["splits"]) == 0

    sections["pitch_velocity"] = _velocity_trend(statcast_df)
    missing["pitch_velocity"] = len(sections["pitch_velocity"]) == 0

    sections["pitch_type_mix"] = _pitch_mix_from_statcast(statcast_df)
    sections["movement_scatter"] = _movement_scatter(statcast_df)
    sections["velo_trend"] = sections["pitch_velocity"]

    sections["game_log"] = _game_log_from_statcast(statcast_df)
    missing["game_log"] = len(sections["game_log"]) == 0

    meta_block = {
        "player": {
            "fg_id": fg_id,
            "mlbam": mlbam,
            "name": f"{meta.get('FirstName', '')} {meta.get('LastName', '')}".strip(),
            "throws": meta.get("Throws"),
            "bats": meta.get("Bats"),
            "height": meta.get("HeightDisplay"),
            "weight": meta.get("Weight"),
            "birthdate": meta.get("BirthDate"),
            "age": meta.get("Age"),
        },
        "missing": missing,
        "source": {
            "fangraphs": FG_API_BASE,
            "statcast": "statcast_pitcher",
        },
    }

    payload = {"meta": meta_block}
    payload.update(sections)
    return payload
