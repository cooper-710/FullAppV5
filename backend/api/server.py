
from fastapi import FastAPI, Query, HTTPException
import requests
import re
from typing import Dict, Any, List, Literal, Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

import numpy as np
import pandas as pd

# Sequence fetcher (your trusted source)
from backend.sequence_src.scrape_savant import fetch_hitter_statcast, summarize_hitter_seasons
from sequence_biolab_api.deep_dive import build_pitcher_deep_dive

app = FastAPI(title="Biolab API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ---------- utils ----------

def _json_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    if df.empty:
        return []
    # Replace NaN -> None, and let FastAPI encode numpy/pandas dtypes safely
    df = df.replace({np.nan: None})
    return jsonable_encoder(df.to_dict(orient="records"))

# Map common Statcast pitch names to families (extend as needed)
_PITCH_FAMILY_MAP = {
    "4-Seam Fastball":"fastball", "4-Seam":"fastball", "FF":"fastball", "Fastball":"fastball",
    "Sinker":"sinker", "SI":"sinker", "Two-Seam Fastball":"sinker", "FT":"sinker",
    "Cutter":"cutter", "FC":"cutter",
    "Slider":"slider", "SL":"slider",
    "Curveball":"curveball", "CU":"curveball", "Knuckle Curve":"curveball", "KC":"curveball",
    "Sweeper":"slider", "SV":"slider",  # treat sweeper as slider fam for now
    "Changeup":"changeup", "CH":"changeup",
    "Splitter":"splitter", "FS":"splitter",
    "Knuckleball":"knuckleball", "KN":"knuckleball",
}

def _add_pitch_family(df: pd.DataFrame) -> pd.DataFrame:
    if "pitch_name" not in df.columns:
        df["pitch_name"] = None
    fam = df["pitch_name"].map(_PITCH_FAMILY_MAP).fillna("unknown")
    return df.assign(pitch_family=fam)

def _last_pitch_per_PA(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    tmp = df.sort_values(["game_pk","at_bat_number","pitch_number"])
    return tmp.drop_duplicates(["game_pk","at_bat_number","batter"], keep="last")

def _normalize_season_counts(events: pd.Series) -> pd.Series:
    # Count AB as PAs that are official at-bats (exclude BB, HBP, IBB, catcher interference, sacrifices)
    if events.empty:
        return pd.Series({"AB":0, "H":0})
    ev = events.fillna("")
    hits = ev.isin(["single","double","triple","home_run"]).sum()
    non_ab = ev.isin(["walk","intent_walk","hit_by_pitch","catcher_interf","sac_bunt","sac_fly"]).sum()
    ab = len(ev) - non_ab
    return pd.Series({"AB": int(ab), "H": int(hits)})

def _season_table(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["batter","player_name","season","PA","AB","H","AVG","OBP","SLG"])

    df = df.copy()
    df["season"] = pd.to_datetime(df["game_date"]).dt.year

    pa_last = _last_pitch_per_PA(df)
    g = pa_last.groupby(["batter","player_name","season"], dropna=False)

    out = g.agg(
        PA=("pitch_number","count"),
        ABH=("events", _normalize_season_counts)
    ).reset_index()

    # expand AB/H from the dict column
    out["AB"] = out["ABH"].apply(lambda d: int(d["AB"]))
    out["H"]  = out["ABH"].apply(lambda d: int(d["H"]))
    out = out.drop(columns=["ABH"])

    # Simple rate stats
    out["AVG"] = (out["H"] / out["AB"].replace(0, np.nan)).round(3)
    # OBP approx from events (walks/HBP captured in non-AB; recompute directly)
    pa = pa_last
    walks = pa["events"].isin(["walk","intent_walk"]).sum()
    hbp   = pa["events"].eq("hit_by_pitch").sum()
    # If grouping per player-season, recompute per row:
    def _row_obp(r):
        pid, yr = r["batter"], r["season"]
        sel = (pa["batter"]==pid) & (pd.to_datetime(pa["game_date"]).dt.year==yr)
        pa_sel = pa.loc[sel]
        w = pa_sel["events"].isin(["walk","intent_walk"]).sum()
        hb = pa_sel["events"].eq("hit_by_pitch").sum()
        h  = r["H"]
        denom = r["PA"]
        return round((h + w + hb) / denom, 3) if denom else 0.0
    out["OBP"] = out.apply(_row_obp, axis=1)

    # SLG: total bases / AB; approximate TB from events
    tb_map = {"single":1, "double":2, "triple":3, "home_run":4}
    def _row_slg(r):
        pid, yr = r["batter"], r["season"]
        sel = (pa_last["batter"]==pid) & (pd.to_datetime(pa_last["game_date"]).dt.year==yr)
        ev = pa_last.loc[sel, "events"].fillna("")
        tb = sum(tb_map.get(x, 0) for x in ev)
        return round(tb / r["AB"], 3) if r["AB"] else 0.0
    out["SLG"] = out.apply(_row_slg, axis=1)

    # Clean types for JSON
    out[["batter","season","PA","AB","H"]] = out[["batter","season","PA","AB","H"]].astype(int, errors="ignore")
    return out

# ---------- routes ----------


@app.get("/hitters/{bid}/season")
async def hitters_season(bid: int, season: int):
    
    try:
        from fastapi import Request
        # normalize inputs
        bid = int(bid)
        season = int(season)
        include = str(request.query_params.get("include_postseason", "true")).lower() in ("1","true","yes")

        row = summarize_hitter_seasons(bid=bid, season=season, include_postseason=include)

        if hasattr(row, "empty") and row.empty:
            return {"data": []}
        if hasattr(row, "to_dict"):
            return {"data": row.head(1).to_dict(orient="records")}
        if isinstance(row, dict) and "data" in row:
            return row
        return {"data": []}
    except Exception as e:
        print("hitters/season error", bid, season, e)
        return {"data": []}


@app.get("/hitters/{bid}/splits")
def hitter_splits(
    bid: int,
    season: Optional[int] = Query(None),
    split: Literal["pitch_family","pitch_type","stand","count","zone"] = "pitch_family",
    include_postseason: bool = Query(False)
) -> Dict[str, Any]:
    if season:
        start_dt, end_dt = f"{season}-03-01", f"{season}-10-31"
    else:
        start_dt, end_dt = None, None

    df = fetch_hitter_statcast(bid, start_dt, end_dt)
    if not include_postseason:
        df = df[df["game_type"].fillna("") != "P"]

    if split in ("pitch_family","pitch_type"):
        df = _add_pitch_family(df)

    pa = _last_pitch_per_PA(df)
    key = {"pitch_family":"pitch_family", "pitch_type":"pitch_name",
           "stand":"stand", "count":"balls", "zone":"zone"}[split]

    grp = pa.groupby(key, dropna=False)["events"].apply(
        lambda s: _normalize_season_counts(s)["AB"]
    ).reset_index(name="AB")
    # Hits per split
    hits = pa.groupby(key, dropna=False)["events"].apply(
        lambda s: _normalize_season_counts(s)["H"]
    ).reset_index(name="H")
    out = pd.merge(grp, hits, on=key, how="outer").fillna(0)
    out["AVG"] = (out["H"] / out["AB"].replace(0, np.nan)).round(3)
    out = out.sort_values("AB", ascending=False)

    return {"bid": bid, "season": season, "split": split, "data": _json_records(out)}

@app.get("/hitters/{bid}/heatmap")
def hitter_heatmap(
    bid: int,
    season: Optional[int] = Query(None),
    pitch_family: Optional[str] = Query(None),
    pitch_type: Optional[str] = Query(None),
    include_postseason: bool = Query(False)
) -> Dict[str, Any]:
    if season:
        start_dt, end_dt = f"{season}-03-01", f"{season}-10-31"
    else:
        start_dt, end_dt = None, None

    df = fetch_hitter_statcast(bid, start_dt, end_dt)
    if not include_postseason:
        df = df[df["game_type"].fillna("") != "P"]

    df = _add_pitch_family(df)

    if pitch_family:
        want = pitch_family.strip().lower()
        df = df[df["pitch_family"].str.lower()==want]
    if pitch_type:
        # allow friendly like "slider" or Statcast "Slider"
        want = pitch_type.strip().lower()
        df = df[df["pitch_name"].str.lower()==want]

    # 9x9 bins on plate_x [-0.85, 0.85], plate_z [1.0, 4.0]
    if df.empty:
        grid = [[0]*9 for _ in range(9)]
        return {"bid": bid, "season": season, "grid": grid}

    xb = pd.cut(df["plate_x"], bins=np.linspace(-0.85, 0.85, 10), labels=False, include_lowest=True)
    zb = pd.cut(df["plate_z"], bins=np.linspace(1.0, 4.0, 10),  labels=False, include_lowest=True)
    tmp = df.assign(xb=xb, zb=zb).dropna(subset=["xb","zb"])
    pivot = tmp.pivot_table(index="zb", columns="xb", values="pitch_number", aggfunc="count", fill_value=0)

    # Ensure 9x9 shape and python ints
    pivot = pivot.reindex(index=range(0,9), columns=range(0,9), fill_value=0)
    grid = pivot.astype(int).values.tolist()
    return {"bid": bid, "season": season, "grid": grid}

@app.get("/api/deep-dive/pitcher/full")
async def pitcher_deep_dive_full(
    mlbam: int = Query(..., ge=1),
    year: int = Query(..., ge=1900),
    span: Literal["regular", "postseason", "total"] = Query("regular"),
    rollup: Literal["season", "last3", "career"] = Query("season"),
) -> Dict[str, Any]:
    try:
        payload = await build_pitcher_deep_dive(
            mlbam=mlbam,
            year=year,
            span=span,
            rollup=rollup,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc))
    return JSONResponse(content=jsonable_encoder(payload))

from pathlib import Path as _Path

def _local_player_search(q: str):
    try:
        import pandas as _pd
        csv = _Path(__file__).resolve().parents[2] / "data" / "processed" / "hitters_season.csv"
        if not csv.exists():
            return []
        df = _pd.read_csv(csv, dtype={"batter":"Int64","player_name":"string","season":"Int64"})
        if df.empty:
            return []
        qtok = [t for t in q.lower().split() if t]
        def _ok(name: str) -> bool:
            n = str(name or "").lower()
            return all(t in n for t in qtok)
        sub = df.loc[df["player_name"].apply(_ok), ["batter","player_name"]].dropna()
        sub = sub.drop_duplicates(subset=["batter"])
        out = [{"id": int(r["batter"]), "name": str(r["player_name"])} for _, r in sub.iterrows()]
        return out[:10]
    except Exception:
        return []

def _mlb_people_search(q: str) -> List[Dict[str, Any]]:
    url = "https://statsapi.mlb.com/api/v1/people/search"
    r = requests.get(url, params={"q": q}, timeout=10)
    r.raise_for_status()
    data = r.json() or {}
    out: List[Dict[str, Any]] = []
    for p in data.get("people", []):
        out.append({
            "id": p.get("id"),
            "name": f"{p.get('lastName', '')}, {p.get('firstName', '')}".strip(", "),
        })
    return out

@app.get("/players/search")
def players_search(q: str):
    import pandas as pd, re, unicodedata
    from pathlib import Path

    def _norm(x: str) -> str:
        x = unicodedata.normalize("NFKD", str(x)).encode("ascii","ignore").decode()
        x = re.sub(r"[^a-z0-9\s]", " ", x.lower())
        return re.sub(r"\s+", " ", x).strip()

    def _tokens(x: str):
        return [t for t in _norm(x).split() if t]

    processed = Path("data/processed")
    csv = processed / "hitters_season.csv"
    if not csv.exists():
        return {"items": []}

    g = pd.read_csv(csv, usecols=["batter","player_name"]).drop_duplicates()
    g["__norm"] = g["player_name"].map(_norm)

    nq = _norm(q)
    qswap = " ".join(reversed(nq.split()))
    qtok = set(_tokens(q))

    def score(row):
        ns = row["__norm"]
        if ns == nq or ns == qswap:
            return 100
        hits = sum(1 for t in qtok if t in ns)
        if qtok and hits == len(qtok):
            return 90
        if hits > 0:
            return 60
        return 0

    g["__score"] = g.apply(score, axis=1)
    g = g.sort_values(["__score","player_name"], ascending=[False, True])
    out = [{"id": int(r.batter), "name": str(r.player_name)} for r in g.itertuples() if r.__score > 0]
    return {"items": out[:10]}
@app.get("/pitchers/search")
def pitchers_search(q: str):
    try:
        pid = lookup_pitcher_id(q)
    except Exception:
        pid = None
    items = []
    try:
        qn = int(q)
        items.append({"id": qn, "name": str(qn)})
    except Exception:
        pass
    if pid and not any(it["id"] == int(pid) for it in items):
        items.append({"id": int(pid), "name": q})
    return {"items": items}


@app.get("/pitchers/{pid}/season")
def pitcher_season(pid: int, season: int):
    import pandas as pd
    from fastapi import HTTPException

    start = f"{season}-03-01"
    end = f"{season}-10-31"

    try:
        df = fetch_pitcher_statcast(int(pid), start, end)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"on-demand compute failed: {e}")

    if df is None or len(df) == 0:
        raise HTTPException(status_code=404, detail="No data for this player/season")

    tmp = df.copy()
    tmp["season"] = pd.to_datetime(tmp["game_date"]).dt.year

    last = (
        tmp.sort_values(["game_pk","at_bat_number","pitch_number"])
           .drop_duplicates(["game_pk","at_bat_number","pitcher"], keep="last")
    )

    ev = (last["events"].fillna("")).astype(str)

    def ct(name: str):
        return (ev == name).sum()

    singles = ct("single")
    doubles = ct("double")
    triples = ct("triple")
    homers = ct("home_run")
    hits = singles + doubles + triples + homers

    walks = ct("walk") + ct("intent_walk")
    hbp = ct("hit_by_pitch")
    sf = ct("sac_fly")

    non_ab = set(["walk","intent_walk","hit_by_pitch","sac_fly","sac_bunt","catcher_interference"])
    ab_mask = ~ev.isin(list(non_ab))
    AB = int(ab_mask.sum())
    PA = int(len(last))
    H = int(hits)

    AVG = float(H / AB) if AB > 0 else 0.0
    OBP = float((H + walks + hbp) / (AB + walks + hbp + sf)) if (AB + walks + hbp + sf) > 0 else 0.0
    TB = int(singles + 2*doubles + 3*triples + 4*homers)
    SLG = float(TB / AB) if AB > 0 else 0.0

    pname = None
    if "pitcher_name" in tmp.columns:
        try:
            pname = str(tmp["pitcher_name"].dropna().unique().tolist()[:1][0])
        except Exception:
            pname = None

    out = {
        "pitcher": int(pid),
        "player_name": pname,
        "season": int(season),
        "BF": PA,
        "AB": AB,
        "H": H,
        "AVG_against": round(AVG, 3),
        "OBP_against": round(OBP, 3),
        "SLG_against": round(SLG, 3),
        "HR": int(homers),
        "BB": int(walks),
        "HBP": int(hbp)
    }
    return {"data": out}


from typing import Optional
from fastapi import Query
import pandas as pd

def _compute_batter_metrics(g: pd.DataFrame) -> pd.DataFrame:
    g = g.copy()
    # safe gets
    for c in ['PA','AB','H','2B','3B','HR','BB','K','HBP','SF','OBP','SLG','AVG']:
        if c not in g.columns: g[c] = 0
    # singles, TB
    g['1B'] = g['H'] - g['2B'] - g['3B'] - g['HR']
    g['TB'] = g['1B'] + 2*g['2B'] + 3*g['3B'] + 4*g['HR']
    # rate helpers
    def div(a,b): 
        import numpy as np
        with np.errstate(divide="ignore", invalid="ignore"):
            x = (a.astype(float) / b.astype(float))
            x = x.fillna(0.0).replace([float('inf'), float('-inf')], 0.0)
        return x
    # classic rates (recompute defensively)
    g['AVG'] = div(g['H'], g['AB']).round(3)
    g['OBP'] = div(g['H'] + g['BB'] + g['HBP'], g['AB'] + g['BB'] + g['HBP'] + g['SF']).round(3)
    g['SLG'] = div(g['TB'], g['AB']).round(3)
    g['OPS'] = (g['OBP'] + g['SLG']).round(3)
    g['ISO'] = (g['SLG'] - g['AVG']).round(3)
    # BABIP
    babip_denom = (g['AB'] - g['HR'] - g['K'] + g['SF'])
    g['BABIP'] = div(g['H'] - g['HR'], babip_denom).round(3)
    # K% / BB%
    g['K%'] = div(g['K'], g['PA']).round(3)
    g['BB%'] = div(g['BB'], g['PA']).round(3)
    return g

@app.get("/hitters/{bid}/season_all")
def hitters_season_all(
    bid: int,
    seasons: Optional[str] = Query(None, description="Comma sep years, e.g. 2019,2021,2025"),
    include_postseason: bool = False,
    min_pa: int = 0,
    count: Optional[str] = Query(None, description="comma sep counts like 0-0,1-2,3-2"),
    pitch_family: Optional[str] = None,
    pitch_type: Optional[str] = None,
    zone: Optional[str] = None,
    group_by: Optional[str] = Query('season', description="season|total"),
):
    try:
        from backend.sequence_src.scrape_savant import fetch_hitter_statcast, summarize_hitter_seasons
        years = [int(x) for x in seasons.split(',')] if seasons else []
        if not years:
            years = [pd.Timestamp.today().year]
        frames = []
        for y in years:
            # regular season
            ev = fetch_hitter_statcast(start=f"{y}-03-01", end=f"{y}-12-31", bid=bid, season_type="regular", cache=True)
            df = _normalize_hitters(ev)
            if include_postseason:
                post = fetch_hitter_statcast(start=f"{y}-10-01", end=f"{y}-12-31", bid=bid, season_type="postseason", cache=True)
                if not post.empty:
                    df = pd.concat([df, _normalize_hitters(post)], ignore_index=True)
            if df.empty:
                continue
            # optional filters
            if count:
                keep = {c.strip() for c in count.split(',') if c.strip()}
                if 'count' in df.columns and keep:
                    df = df[df['count'].isin(keep)]
            if pitch_family and 'pitch_family' in df.columns:
                df = df[df['pitch_family'] == pitch_family]
            if pitch_type and 'pitch_type' in df.columns:
                df = df[df['pitch_type'] == pitch_type]
            if zone and 'zone' in df.columns:
                df = df[df['zone'] == zone]
            if df.empty:
                continue
            # aggregate to season
            agg_spec = {c:'sum' for c in ['PA','AB','H','2B','3B','HR','BB','K','HBP','SF']}
            g = df.agg(agg_spec).to_frame().T
            g['season'] = y
            g['batter'] = bid
            g = _compute_batter_metrics(g)
            if int(g['PA'].iloc[0]) >= int(min_pa):
                frames.append(g)
        if not frames:
            return {"data":[]}
        out = pd.concat(frames, ignore_index=True)
        if group_by == 'season':
            return {"data": out.to_dict(orient='records')}
        # total across seasons
        tot = out.select_dtypes(include='number').sum(numeric_only=True).to_frame().T
        tot['season'] = 'total'
        tot['batter'] = bid
        tot = _compute_batter_metrics(tot)
        return {"data": tot.to_dict(orient='records')}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))
