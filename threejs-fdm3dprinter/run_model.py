"""
run_model.py  --  3D Printer Fault Detector: Train → Save → Predict
====================================================================
Two modes:

  1. TRAIN  (run once, builds rf_fault_detector.pkl):
       python run_model.py --train

  2. PREDICT  (run on any new session DB):
       python run_model.py --predict path/to/session.db

  3. EVALUATE (run the full LOSO cross-validation and print a metrics report):
       python run_model.py --evaluate

Requirements:
  pip install scikit-learn pandas numpy joblib
  (optional, for XGBoost): pip install xgboost
"""
import sys, io
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)
except Exception:
    pass

import os
import time
import argparse
import sqlite3
import warnings
import numpy as np
import pandas as pd
import joblib

from sklearn.ensemble         import RandomForestClassifier
from sklearn.model_selection  import GroupKFold
from sklearn.metrics          import (classification_report, f1_score,
                                       accuracy_score, confusion_matrix)
from sklearn.utils.class_weight import compute_class_weight

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG  (mirrors labeling+supervised_learning.py)
# ─────────────────────────────────────────────────────────────────────────────
DATA_DIR   = "./outputs_db"
OUTPUT_DIR = "./ai_outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

MODEL_PATH   = os.path.join(OUTPUT_DIR, "rf_fault_detector.pkl")
MEDIANS_PATH = os.path.join(OUTPUT_DIR, "rf_imputer_medians.pkl")

FILE_MAP = {
    "normal":     ["telemetry_normal_flattened.db",
                   "telemetry_normal_2_flattened.db",
                   "telemetry_normal_3_flattened.db",
                   "telemetry_normal_4_flattened.db"],
    "heat_creep": ["telemetry_temp_err(heat_creep)_flattened.db"],
    "clog":       ["telemetry_(clog)_flattened.db"],
    "low_flow":   ["telemetry_low_flow(partial clog)_flattened.db",
                   "telemetry_low_flow_2(partial clog)_flattened.db",
                   "telemetry_low_flow_3(partial clog)_flattened.db"],
    "loose_belt": ["telemetry_calibration_error(loose_X_belt)_flattened.db"],
    "bad_print":  ["telemetry_bad_print_flattened.db"],
}

LABEL_MAP = {
    "pre_print":  0,
    "normal":     1,
    "heat_creep": 2,
    "clog":       3,
    "low_flow":   4,
    "loose_belt": 5,
    "bad_print":  6,
}
LABEL_NAMES = {v: k for k, v in LABEL_MAP.items()}

# Physics thresholds
HC_TEMP_THRESHOLDS    = {1: 44.7, 2: 52.1, 3: 61.3}
HC_RATE_THRESHOLDS    = {1: 1.8,  2: 3.2,  3: 5.7}
SLOPE_WINDOW_S        = 30
CLOG_NOZZLE_DEVIATION = 15
LOW_FLOW_E_RATIO      = 0.45
BAD_PRINT_ACC_PERCENTILE = 55
BAD_PRINT_E_DEVIATION    = 0.20
LOOSE_BELT_LAT_PERCENTILE = 55

# Session-invariant global feature set (used by the multi-class model)
FEATURE_COLS = [
    # Thermal deviation
    "nozzle_delta", "nozzle_error_abs", "bed_delta",
    "temp_c_rate", "temp_c_roll_std", "temp_c_zscore",
    "temp_c_from_baseline",    # NEW: drift from session-start cold-end temp
    "nozzle_delta_roll_min",   # NEW: rolling min nozzle drop (clog onset)
    # Extrusion
    "e", "f", "e_ratio", "e_roll_mean", "e_roll_std",
    # Motion
    "x", "y", "z_norm",
    # Vibration
    "acc_x", "acc_y", "acc_z",
    "acc_x_roll_std", "acc_y_roll_std", "acc_z_roll_std",
    "acc_mag", "acc_mag_roll_std",
    # Print state
    "progress", "is_printing",
]

# Physics-aware per-fault feature subsets for binary detectors.
# Each subset contains ONLY the features physically relevant to that fault.
# This prevents irrelevant features from diluting the signal.
FAULT_FEATURES = {
    "heat_creep": [
        # Cold-end thermal dynamics: rising trend + rate + drift from start
        "temp_c_rate", "temp_c_roll_std", "temp_c_zscore",
        "temp_c_from_baseline",
        "nozzle_error_abs",   # nozzle struggles to hold setpoint as cold end heats
        "progress", "z_norm", # fault worsens deeper into print
    ],
    "clog": [
        # Nozzle blockage = temp drop + extrusion stop
        "nozzle_delta", "nozzle_error_abs", "nozzle_delta_roll_min",
        "e", "e_ratio", "e_roll_std", "e_roll_mean",
        "f",
    ],
    "low_flow": [
        # Chronic under-extrusion: sustained low e relative to session median
        "e_ratio", "e_roll_mean", "e_roll_std", "e", "f",
        "nozzle_error_abs",  # partial blockage may also cause nozzle delta
    ],
    "loose_belt": [
        # Lateral vibration from belt slipping
        "acc_x", "acc_y", "acc_x_roll_std", "acc_y_roll_std",
        "acc_mag", "acc_mag_roll_std",
    ],
    "bad_print": [
        # Combined: erratic vibration + extrusion instability
        "acc_mag_roll_std", "acc_z_roll_std", "acc_x_roll_std", "acc_y_roll_std",
        "e_ratio", "e_roll_std",
        "nozzle_error_abs",
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS  (copied & fixed from main script)
# ─────────────────────────────────────────────────────────────────────────────
def rolling_temp_slope(group, window_s=SLOPE_WINDOW_S):
    dt_min = group["timestamp"].diff().dt.total_seconds().fillna(0.015) / 60.0
    dt_min = dt_min.replace(0, np.nan).fillna(0.015 / 60.0)
    dtemp  = group["temp_c"].diff().fillna(0)
    inst_rate = dtemp / dt_min
    median_dt = group["timestamp"].diff().dt.total_seconds().dropna().median()
    median_dt = median_dt if (median_dt and median_dt > 0) else 0.015
    win_rows  = max(3, int(window_s / median_dt))
    return inst_rate.rolling(win_rows, min_periods=1).mean()


def _rolling_std_series(arr, window=50):
    return pd.Series(arr).rolling(window, min_periods=5).std().fillna(0).values


def label_session(group):
    res_labels  = np.full(len(group), "normal", dtype=object)
    is_printing = (group["state"].str.lower() == "printing").values
    res_labels[~is_printing] = "pre_print"

    src = group["fault_source"].iloc[0]
    if src == "normal":
        return pd.Series(res_labels, index=group.index)

    n_act  = group["nozzle_actual"].values
    n_tgt  = group["nozzle_target"].values
    e_val  = group["e"].values
    temp_c = group["temp_c"].values

    printing_rows = is_printing & ~np.isnan(e_val)
    printing_e    = e_val[printing_rows]
    e_median      = np.median(printing_e) if len(printing_e) > 0 else np.nan
    e_p10         = np.percentile(printing_e, 10) if len(printing_e) > 0 else np.nan

    if src == "clog":
        clog_nozzle = (n_tgt - n_act > CLOG_NOZZLE_DEVIATION) & ~np.isnan(n_act) & ~np.isnan(n_tgt)
        clog_e      = (e_val <= e_p10) & (e_val < 2.0) & ~np.isnan(e_val) & ~np.isnan(e_p10)
        res_labels[is_printing & (clog_nozzle | clog_e)] = "clog"

    elif src == "heat_creep":
        slope = rolling_temp_slope(group).values
        tier  = np.zeros(len(group), dtype=int)
        for t in [1, 2, 3]:
            t_cond = (temp_c >= HC_TEMP_THRESHOLDS[t]) & ~np.isnan(temp_c)
            r_cond = (slope  >= HC_RATE_THRESHOLDS[t]) & ~np.isnan(slope)
            tier   = np.where(t_cond & r_cond, t, tier)
            tier   = np.where(t_cond & ~r_cond, np.maximum(tier, t - 1), tier)
        res_labels[is_printing & (tier >= 1)] = "heat_creep"

    elif src == "low_flow":
        # FIXED: signal-confirmed only (not blanket)
        if not np.isnan(e_median) and e_median > 0:
            fault_mask = is_printing & (e_val < e_median * LOW_FLOW_E_RATIO) & ~np.isnan(e_val)
            if fault_mask.sum() < max(10, 0.10 * is_printing.sum()):
                fault_mask = is_printing   # graceful fallback
            res_labels[fault_mask] = "low_flow"
        else:
            res_labels[is_printing] = "low_flow"

    elif src == "loose_belt":
        acc_x = np.nan_to_num(group["acc_x"].values)
        acc_y = np.nan_to_num(group["acc_y"].values)
        lateral      = np.abs(acc_x) + np.abs(acc_y)
        lat_roll_std = _rolling_std_series(lateral, window=50)
        printing_lat = lat_roll_std[is_printing]
        if len(printing_lat) > 0:
            threshold  = np.percentile(printing_lat, LOOSE_BELT_LAT_PERCENTILE)
            fault_mask = is_printing & (lat_roll_std > threshold)
        else:
            fault_mask = is_printing
        if fault_mask.sum() < max(10, 0.10 * is_printing.sum()):
            fault_mask = is_printing
        res_labels[fault_mask] = "loose_belt"

    elif src == "bad_print":
        acc_x   = np.nan_to_num(group["acc_x"].values)
        acc_y   = np.nan_to_num(group["acc_y"].values)
        acc_z   = np.nan_to_num(group["acc_z"].values)
        acc_mag = np.sqrt(acc_x**2 + acc_y**2 + acc_z**2)
        acc_roll_std = _rolling_std_series(acc_mag, window=50)
        if not np.isnan(e_median) and abs(e_median) > 1e-6:
            e_dev = np.where(~np.isnan(e_val),
                             np.abs(e_val - e_median) / (np.abs(e_median) + 1e-6), 0.0)
        else:
            e_dev = np.zeros(len(e_val))
        printing_acc  = acc_roll_std[is_printing]
        acc_threshold = np.percentile(printing_acc, BAD_PRINT_ACC_PERCENTILE) if len(printing_acc) > 0 else np.inf
        fault_mask    = is_printing & ((acc_roll_std > acc_threshold) | ((e_dev > BAD_PRINT_E_DEVIATION) & ~np.isnan(e_val)))
        if fault_mask.sum() < max(10, 0.15 * is_printing.sum()):
            fault_mask = is_printing
        res_labels[fault_mask] = "bad_print"

    return pd.Series(res_labels, index=group.index)


def engineer_features(df):
    def per_session(g):
        g    = g.copy().sort_values("timestamp")
        dt_s = g["timestamp"].diff().dt.total_seconds().fillna(0.015).replace(0, 0.015)

        # -- Thermal: deviation from setpoint --
        g["nozzle_delta"]     = g["nozzle_actual"] - g["nozzle_target"]
        g["nozzle_error_abs"] = g["nozzle_delta"].abs()
        g["bed_delta"]        = g["bed_actual"] - g["bed_target"]
        g["temp_c_rate"]      = (g["temp_c"].diff().fillna(0) / dt_s) * 60.0
        g["temp_c_roll_std"]  = g["temp_c"].rolling(30, min_periods=1).std().fillna(0)

        # Session z-score: removes absolute baseline, keeps shape
        tc_mean = g["temp_c"].mean()
        tc_std  = g["temp_c"].std()
        g["temp_c_zscore"] = (g["temp_c"] - tc_mean) / (tc_std + 1e-6)

        # Heat-creep onset: deviation from session-start cold-end temperature.
        # Uses first 120 rows (≈30–120s) as the stable baseline.
        # A rising temp_c_from_baseline = early heat creep signal.
        baseline_rows = min(120, max(5, len(g) // 20))
        tc_baseline   = g["temp_c"].iloc[:baseline_rows].mean()
        g["temp_c_from_baseline"] = g["temp_c"] - tc_baseline

        # Clog onset: rolling minimum of nozzle_delta over 60 rows.
        # A sustained large negative delta (nozzle can't reach setpoint)
        # is the earliest detectable clog signal.
        g["nozzle_delta_roll_min"] = g["nozzle_delta"].rolling(60, min_periods=5).min().fillna(0)

        # -- Extrusion --
        printing_mask    = g["state"].str.lower() == "printing"
        session_e_median = g.loc[printing_mask, "e"].median()
        if np.isnan(session_e_median):
            session_e_median = g["e"].median()
        g["e_ratio"]     = g["e"] / (session_e_median + 1e-6)
        g["e_roll_mean"] = g["e"].rolling(20, min_periods=1).mean()
        g["e_roll_std"]  = g["e"].rolling(20, min_periods=1).std().fillna(0)

        # -- Z: normalize 0-1 within session --
        z_max       = g["z"].max()
        g["z_norm"] = g["z"] / (z_max + 1e-6)

        # -- Vibration --
        g["acc_x_roll_std"]   = g["acc_x"].rolling(50, min_periods=1).std().fillna(0)
        g["acc_y_roll_std"]   = g["acc_y"].rolling(50, min_periods=1).std().fillna(0)
        g["acc_z_roll_std"]   = g["acc_z"].rolling(50, min_periods=1).std().fillna(0)
        g["acc_mag"]          = np.sqrt(
            g["acc_x"].fillna(0)**2 + g["acc_y"].fillna(0)**2 + g["acc_z"].fillna(0)**2
        )
        g["acc_mag_roll_std"] = g["acc_mag"].rolling(50, min_periods=1).std().fillna(0)
        g["is_printing"]      = printing_mask.astype(int)
        return g

    return df.groupby("session_id", group_keys=False).apply(per_session)


def load_all():
    dfs = []
    for fault, files in FILE_MAP.items():
        for fn in files:
            path = os.path.join(DATA_DIR, fn)
            if not os.path.exists(path):
                continue
            con = sqlite3.connect(path)
            df  = pd.read_sql("SELECT * FROM telemetry_flat", con)
            con.close()
            df["fault_source"] = fault
            df["session_id"]   = fn
            dfs.append(df)
    if not dfs:
        raise FileNotFoundError(f"No DB files found in '{DATA_DIR}'")
    combined = pd.concat(dfs, ignore_index=True)
    combined["timestamp"] = pd.to_datetime(combined["timestamp"], format="mixed")
    num_cols = ["nozzle_actual", "nozzle_target", "bed_actual", "bed_target",
                "temp_c", "e", "f", "acc_x", "acc_y", "acc_z",
                "progress", "layer_current", "x", "y", "z"]
    for col in num_cols:
        if col in combined.columns:
            combined[col] = pd.to_numeric(combined[col], errors="coerce")
    return combined.sort_values(["session_id", "timestamp"]).reset_index(drop=True)


def load_session_db(db_path: str, fault_source: str = "unknown") -> pd.DataFrame:
    """Load a single session DB file for prediction."""
    con = sqlite3.connect(db_path)
    df  = pd.read_sql("SELECT * FROM telemetry_flat", con)
    con.close()
    df["fault_source"] = fault_source
    df["session_id"]   = os.path.basename(db_path)
    df["timestamp"]    = pd.to_datetime(df["timestamp"], format="mixed")
    num_cols = ["nozzle_actual", "nozzle_target", "bed_actual", "bed_target",
                "temp_c", "e", "f", "acc_x", "acc_y", "acc_z",
                "progress", "layer_current", "x", "y", "z"]
    for col in num_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df.sort_values("timestamp").reset_index(drop=True)


# ─────────────────────────────────────────────────────────────────────────────
# MODE 1: TRAIN  — train RF on full dataset and save to disk
# ─────────────────────────────────────────────────────────────────────────────
def train_and_save():
    print("\n[TRAIN] Loading all sessions...")
    df = load_all()
    print(f"  Loaded {len(df):,} rows from {df['session_id'].nunique()} sessions.")

    print("[TRAIN] Labeling...")
    df["label_str"] = df.groupby("session_id", group_keys=False).apply(label_session)
    df["label"]     = df["label_str"].map(LABEL_MAP)

    print("[TRAIN] Engineering features...")
    df = engineer_features(df)

    ml_df = df[df["is_printing"] == 1].copy()
    X     = ml_df[FEATURE_COLS].copy()
    y     = ml_df["label"].copy()

    print(f"\n  Training matrix: {X.shape[0]:,} rows × {X.shape[1]} features")
    print("  Label distribution:")
    for lbl, count in y.value_counts().sort_index().items():
        print(f"    {LABEL_NAMES.get(lbl, str(lbl)):15s}: {count:6,d} ({count/len(y)*100:.1f}%)")

    medians = X.median(numeric_only=True)
    X_imp   = X.fillna(medians).fillna(0)

    classes = np.unique(y)
    cw_arr  = compute_class_weight("balanced", classes=classes, y=y)
    cw_dict = dict(zip(classes.tolist(), cw_arr.tolist()))

    print("\n[TRAIN] Training Random Forest (200 trees)...")
    t0 = time.time()
    rf = RandomForestClassifier(
        n_estimators=200, max_depth=None, min_samples_leaf=5,
        class_weight=cw_dict, n_jobs=-1, random_state=42
    )
    rf.fit(X_imp, y)
    print(f"  Done in {time.time()-t0:.1f}s")

    joblib.dump(rf,      MODEL_PATH)
    joblib.dump(medians, MEDIANS_PATH)
    print(f"\n  ✓ Model saved  -> {MODEL_PATH}")
    print(f"  ✓ Medians saved-> {MEDIANS_PATH}")

    print("\n--- Top 15 Feature Importances ---")
    indices = np.argsort(rf.feature_importances_)[::-1][:15]
    for rank, idx in enumerate(indices, 1):
        print(f"  {rank:2d}. {FEATURE_COLS[idx]:<25} {rf.feature_importances_[idx]:.4f}")


# ─────────────────────────────────────────────────────────────────────────────
# MODE 2: PREDICT  — load saved model, run on a new session DB
# ─────────────────────────────────────────────────────────────────────────────
def predict(db_path: str):
    if not os.path.exists(MODEL_PATH):
        print(f"[ERROR] Model not found at {MODEL_PATH}. Run with --train first.")
        return

    print(f"\n[PREDICT] Loading model from {MODEL_PATH}...")
    rf      = joblib.load(MODEL_PATH)
    medians = joblib.load(MEDIANS_PATH)

    print(f"[PREDICT] Loading session: {db_path}")
    df = load_session_db(db_path)
    df = engineer_features(df)

    printing_df = df[df["is_printing"] == 1].copy()
    if printing_df.empty:
        print("[WARN] No printing rows found in this session.")
        return

    X = printing_df[FEATURE_COLS].copy()
    X = X.fillna(medians).fillna(0)

    print(f"  Predicting on {len(X):,} printing rows...")
    preds   = rf.predict(X)
    probas  = rf.predict_proba(X)

    printing_df = printing_df.copy()
    printing_df["predicted_label"] = [LABEL_NAMES.get(p, str(p)) for p in preds]
    printing_df["confidence"]      = probas.max(axis=1)

    print("\n--- Prediction Summary ---")
    counts = pd.Series(printing_df["predicted_label"]).value_counts()
    for cls, cnt in counts.items():
        avg_conf = printing_df.loc[printing_df["predicted_label"] == cls, "confidence"].mean()
        print(f"  {cls:<15} : {cnt:6,d} rows ({cnt/len(printing_df)*100:.1f}%) | avg confidence: {avg_conf:.3f}")

    # Majority vote — overall session diagnosis
    dominant = counts.index[0]
    print(f"\n  >>> Session diagnosis: [{dominant.upper()}]")
    print(f"      Confidence: {printing_df.loc[printing_df['predicted_label']==dominant, 'confidence'].mean():.3f}")

    # Save predictions
    out_name = os.path.splitext(os.path.basename(db_path))[0] + "_predictions.csv"
    out_path = os.path.join(OUTPUT_DIR, out_name)
    printing_df[["timestamp", "predicted_label", "confidence"]].to_csv(out_path, index=False)
    print(f"\n  Predictions saved -> {out_path}")


# ─────────────────────────────────────────────────────────────────────────────
# MODE 3: EVALUATE  — LOSO cross-validation with macro + weighted F1, fold std
# ─────────────────────────────────────────────────────────────────────────────
def evaluate():
    print("\n[EVALUATE] Loading and labeling all sessions...")
    df = load_all()
    df["label_str"] = df.groupby("session_id", group_keys=False).apply(label_session)
    df["label"]     = df["label_str"].map(LABEL_MAP)
    df = engineer_features(df)

    ml_df = df[df["is_printing"] == 1].copy()
    X     = ml_df[FEATURE_COLS].copy()
    y     = ml_df["label"].copy()
    groups = ml_df["session_id"].values

    n_sessions = ml_df["session_id"].nunique()
    gkf        = GroupKFold(n_splits=n_sessions)

    print(f"\n[EVALUATE] Leave-One-Session-Out ({n_sessions} folds)...\n")

    y_true_all, y_pred_all = [], []
    fold_acc, fold_wf1, fold_mf1 = [], [], []

    for fold_i, (train_idx, test_idx) in enumerate(gkf.split(X, y, groups=groups), 1):
        X_tr, X_te = X.iloc[train_idx].copy(), X.iloc[test_idx].copy()
        y_tr, y_te = y.iloc[train_idx], y.iloc[test_idx]

        medians = X_tr.median(numeric_only=True)
        X_tr    = X_tr.fillna(medians).fillna(0)
        X_te    = X_te.fillna(medians).fillna(0)

        classes = np.unique(y_tr)
        cw_dict = dict(zip(classes.tolist(),
                           compute_class_weight("balanced", classes=classes, y=y_tr).tolist()))

        rf = RandomForestClassifier(
            n_estimators=200, max_depth=None, min_samples_leaf=5,
            class_weight=cw_dict, n_jobs=-1, random_state=42
        )
        rf.fit(X_tr, y_tr)
        y_pred = rf.predict(X_te)

        acc = accuracy_score(y_te, y_pred)
        wf1 = f1_score(y_te, y_pred, average="weighted", zero_division=0)
        mf1 = f1_score(y_te, y_pred, average="macro", zero_division=0)

        fold_acc.append(acc);  fold_wf1.append(wf1);  fold_mf1.append(mf1)
        y_true_all.append(y_te.values);  y_pred_all.append(y_pred)

        test_session = ml_df["session_id"].iloc[test_idx].iloc[0]
        print(f"  Fold {fold_i:02d}/{n_sessions} | {test_session:<55} "
              f"Acc={acc:.4f}  wF1={wf1:.4f}  mF1={mf1:.4f}")

    y_true = np.concatenate(y_true_all)
    y_pred = np.concatenate(y_pred_all)
    present = sorted(set(y_true))

    print("\n" + "=" * 70)
    print("  AGGREGATED RESULTS  (across all folds)")
    print("=" * 70)
    print(f"  Accuracy      :  {accuracy_score(y_true, y_pred):.4f}")
    print(f"  Weighted F1   :  {f1_score(y_true, y_pred, average='weighted', zero_division=0):.4f}")
    print(f"  Macro F1      :  {f1_score(y_true, y_pred, average='macro', zero_division=0):.4f}")
    print(f"\n  Per-fold Accuracy   mean={np.mean(fold_acc):.4f}  std={np.std(fold_acc):.4f}")
    print(f"  Per-fold Weighted F1 mean={np.mean(fold_wf1):.4f}  std={np.std(fold_wf1):.4f}")
    print(f"  Per-fold Macro F1    mean={np.mean(fold_mf1):.4f}  std={np.std(fold_mf1):.4f}")

    print("\n--- Per-class Report ---")
    print(classification_report(
        y_true, y_pred,
        target_names=[LABEL_NAMES.get(c, str(c)) for c in present],
        labels=present, zero_division=0
    ))

    print("--- Confusion Matrix ---")
    class_names = [LABEL_NAMES.get(c, str(c)) for c in present]
    cm = confusion_matrix(y_true, y_pred, labels=present)
    col_w = max(12, max(len(n) for n in class_names) + 2)
    print("Actual \\ Pred" + "".join(f"{n:>{col_w}}" for n in class_names))
    print("-" * (16 + col_w * len(class_names)))
    for i, rn in enumerate(class_names):
        print(f"{rn:<16}" + "".join(f"{v:>{col_w}}" for v in cm[i]))

    # Save results CSV
    results_df = pd.DataFrame({
        "fold": list(range(1, n_sessions + 1)),
        "accuracy": fold_acc,
        "weighted_f1": fold_wf1,
        "macro_f1": fold_mf1,
    })
    out_path = os.path.join(OUTPUT_DIR, "loso_fold_results.csv")
    results_df.to_csv(out_path, index=False)
    print(f"\n  Fold results saved -> {out_path}")


# ─────────────────────────────────────────────────────────────────────────────
# MODE 4: EVALUATE-TEMPORAL  — multi-model comparison on temporal holdout
# ─────────────────────────────────────────────────────────────────────────────
def evaluate_temporal(holdout_frac: float = 0.20):
    """
    Within-session 80/20 temporal split evaluated across 4 models.

    Why this complements LOSO:
      LOSO creates zero-shot scenarios for fault classes with only 1 session.
      Temporal holdout ensures all classes appear in both train and test by
      using the FIRST 80% of each session as training and the LAST 20% as test.
      This simulates real deployment: model learns early fault signatures,
      then detects worsening faults later — no temporal leakage.

    Models: Random Forest, XGBoost (optional), MLP, Logistic Regression
    """
    from sklearn.preprocessing  import StandardScaler
    from sklearn.linear_model   import LogisticRegression
    from sklearn.neural_network import MLPClassifier
    from sklearn.pipeline       import Pipeline

    try:
        from xgboost import XGBClassifier
        HAS_XGB = True
    except ImportError:
        HAS_XGB = False
        print("  [INFO] xgboost not installed. Run: pip install xgboost")

    print(f"\n[TEMPORAL HOLDOUT] Loading and labeling all sessions...")
    df = load_all()
    df["label_str"] = df.groupby("session_id", group_keys=False).apply(label_session)
    df["label"]     = df["label_str"].map(LABEL_MAP)
    df = engineer_features(df)

    # -- 80/20 temporal split per session ------------------------------------
    train_parts, test_parts = [], []
    print(f"\n  Per-session split (first 80% train / last 20% test):")
    for sid, grp in df.groupby("session_id"):
        grp    = grp.sort_values("timestamp")
        cutoff = int(len(grp) * (1 - holdout_frac))
        train_parts.append(grp.iloc[:cutoff])
        test_parts.append(grp.iloc[cutoff:])
        src = grp["fault_source"].iloc[0]
        print(f"    {sid:<55}  train={cutoff:6,}  test={len(grp)-cutoff:6,}  [{src}]")

    train_df = pd.concat(train_parts).reset_index(drop=True)
    test_df  = pd.concat(test_parts).reset_index(drop=True)

    train_ml = train_df[train_df["is_printing"] == 1].copy()
    test_ml  = test_df [test_df ["is_printing"] == 1].copy()

    X_train, y_train = train_ml[FEATURE_COLS].copy(), train_ml["label"].copy()
    X_test,  y_test  = test_ml [FEATURE_COLS].copy(), test_ml ["label"].copy()

    print(f"\n  Train printing rows: {len(X_train):,}  |  Test printing rows: {len(X_test):,}")
    print("  Test label distribution:")
    for lbl, cnt in y_test.value_counts().sort_index().items():
        print(f"    {LABEL_NAMES.get(lbl, str(lbl)):15s}: {cnt:6,d} ({cnt/len(y_test)*100:.1f}%)")

    # Imputation from training split only
    medians = X_train.median(numeric_only=True)
    X_train = X_train.fillna(medians).fillna(0)
    X_test  = X_test .fillna(medians).fillna(0)

    classes = np.unique(y_train)
    cw_arr  = compute_class_weight("balanced", classes=classes, y=y_train)
    cw_dict = dict(zip(classes.tolist(), cw_arr.tolist()))

    # -- Build model zoo -----------------------------------------------------
    zoo = {
        "Random Forest": RandomForestClassifier(
            n_estimators=200, max_depth=None, min_samples_leaf=5,
            class_weight=cw_dict, n_jobs=-1, random_state=42),
        "Logistic Regression": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(
                max_iter=1000, class_weight=cw_dict,
                solver="lbfgs", C=1.0, multi_class="multinomial", n_jobs=-1))]),
        "MLP (Neural Net)": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", MLPClassifier(
                hidden_layer_sizes=(256, 128, 64), activation="relu",
                max_iter=300, early_stopping=True, validation_fraction=0.1,
                learning_rate="adaptive", learning_rate_init=0.001, random_state=42))]),
    }
    if HAS_XGB:
        label_set   = sorted(classes)
        label_remap = {old: new for new, old in enumerate(label_set)}
        label_unmap = {new: old for old, new in label_remap.items()}
        zoo["XGBoost"] = ("xgb",
            XGBClassifier(n_estimators=300, max_depth=6, learning_rate=0.05,
                          subsample=0.8, colsample_bytree=0.8,
                          use_label_encoder=False, eval_metric="mlogloss",
                          n_jobs=-1, random_state=42),
            y_train.map(label_remap), y_test.map(label_remap),
            y_train.map(cw_dict).values, label_unmap)

    # -- Train & evaluate each model -----------------------------------------
    results = {}
    print("\n" + "=" * 72)
    print("  TRAINING MODELS  (80% temporal train split)...")
    print("=" * 72)

    for name, spec in zoo.items():
        if isinstance(spec, tuple) and spec[0] == "xgb":
            _, clf, y_tr_xgb, y_te_xgb, sw, unmap = spec
            t0 = time.time()
            clf.fit(X_train, y_tr_xgb, sample_weight=sw)
            y_pred = np.array([unmap[v] for v in clf.predict(X_test)])
        else:
            clf = spec
            t0  = time.time()
            clf.fit(X_train, y_train)
            y_pred = clf.predict(X_test)
        elapsed = time.time() - t0

        acc = accuracy_score(y_test, y_pred)
        wf1 = f1_score(y_test, y_pred, average="weighted", zero_division=0)
        mf1 = f1_score(y_test, y_pred, average="macro",    zero_division=0)
        results[name] = {"acc": acc, "wf1": wf1, "mf1": mf1,
                         "time": elapsed, "clf": clf, "y_pred": y_pred}
        print(f"  {name:<22}  Acc={acc:.4f}  wF1={wf1:.4f}  mF1={mf1:.4f}  ({elapsed:.1f}s)")

    # -- Summary table -------------------------------------------------------
    present   = sorted(set(y_test))
    best_name = max(results, key=lambda n: results[n]["mf1"])
    best_pred = results[best_name]["y_pred"]

    print("\n" + "=" * 72)
    print("  MODEL COMPARISON — Temporal Holdout (last 20% of each session)")
    print("=" * 72)
    print(f"  {'Classifier':<22}  {'Accuracy':>10}  {'Weighted F1':>12}  {'Macro F1':>10}  {'Time':>8}")
    print("  " + "-" * 68)
    for name, r in sorted(results.items(), key=lambda x: -x[1]["mf1"]):
        star = "  ★" if name == best_name else ""
        print(f"  {name:<22}  {r['acc']:>10.4f}  {r['wf1']:>12.4f}  {r['mf1']:>10.4f}  {r['time']:>6.1f}s{star}")
    print("=" * 72)

    # -- Detailed report for best model --------------------------------------
    print(f"\n  ════ BEST MODEL: {best_name} ════")
    print("\n--- Per-class Report ---")
    print(classification_report(
        y_test, best_pred,
        target_names=[LABEL_NAMES.get(c, str(c)) for c in present],
        labels=present, zero_division=0))

    print("--- Confusion Matrix (rows=actual, cols=predicted) ---")
    class_names = [LABEL_NAMES.get(c, str(c)) for c in present]
    cm    = confusion_matrix(y_test, best_pred, labels=present)
    col_w = max(12, max(len(n) for n in class_names) + 2)
    print("Actual \\ Pred" + "".join(f"{n:>{col_w}}" for n in class_names))
    print("-" * (16 + col_w * len(class_names)))
    for i, rn in enumerate(class_names):
        print(f"{rn:<16}" + "".join(f"{v:>{col_w}}" for v in cm[i]))

    # -- Feature importance (RF) ---------------------------------------------
    if "Random Forest" in results:
        rf_clf = results["Random Forest"]["clf"]
        idxs   = np.argsort(rf_clf.feature_importances_)[::-1][:15]
        print("\n--- Top 15 Feature Importances (Random Forest) ---")
        print(f"  {'Rank':<5} {'Feature':<25} {'Importance':>12}")
        print("  " + "-" * 44)
        for rank, idx in enumerate(idxs, 1):
            print(f"  {rank:<5} {FEATURE_COLS[idx]:<25} {rf_clf.feature_importances_[idx]:>12.4f}")

    # -- Save results --------------------------------------------------------
    summary = [{"model": n, "accuracy": r["acc"], "weighted_f1": r["wf1"],
                 "macro_f1": r["mf1"], "train_time_s": r["time"]}
               for n, r in results.items()]
    pd.DataFrame(summary).to_csv(
        os.path.join(OUTPUT_DIR, "temporal_model_comparison.csv"), index=False)
    pd.DataFrame({
        "y_true": y_test.values, "y_pred": best_pred,
        "y_true_name": [LABEL_NAMES.get(v, str(v)) for v in y_test.values],
        "y_pred_name": [LABEL_NAMES.get(v, str(v)) for v in best_pred],
    }).to_csv(os.path.join(OUTPUT_DIR, "temporal_best_predictions.csv"), index=False)

    print(f"\n  Comparison CSV -> {OUTPUT_DIR}/temporal_model_comparison.csv")
    print(f"  Predictions CSV-> {OUTPUT_DIR}/temporal_best_predictions.csv")
    print(f"\n  Report note: LOSO (--evaluate) = cross-session generalization bound")
    print(f"               Temporal (this)   = practical within-deployment performance")


# ─────────────────────────────────────────────────────────────────────────────
# MODE 5: EVALUATE-BINARY  — per-fault binary detectors (physics-aware)
# ─────────────────────────────────────────────────────────────────────────────
def evaluate_binary(holdout_frac: float = 0.20):
    """
    Per-fault binary detector evaluation.

    One binary Random Forest is trained per fault class using ONLY the
    physics-relevant features for that fault (defined in FAULT_FEATURES).
    Each detector outputs: P(this row = fault_X).

    Final class decision = the fault detector with highest confidence >=0.5.
    If none fire >= 0.5 → predict 'normal'.

    Split: same 80/20 temporal holdout as --evaluate-temporal.
    """
    from sklearn.metrics import precision_score, recall_score

    print("\n[BINARY DETECTORS] Loading and labeling all sessions...")
    df = load_all()
    df["label_str"] = df.groupby("session_id", group_keys=False).apply(label_session)
    df["label"]     = df["label_str"].map(LABEL_MAP)
    df = engineer_features(df)

    # 80/20 temporal split
    train_parts, test_parts = [], []
    for sid, grp in df.groupby("session_id"):
        grp    = grp.sort_values("timestamp")
        cutoff = int(len(grp) * (1 - holdout_frac))
        train_parts.append(grp.iloc[:cutoff])
        test_parts.append(grp.iloc[cutoff:])

    train_df = pd.concat(train_parts).reset_index(drop=True)
    test_df  = pd.concat(test_parts).reset_index(drop=True)

    train_ml = train_df[train_df["is_printing"] == 1].copy()
    test_ml  = test_df [test_df ["is_printing"] == 1].copy()

    y_train_full = train_ml["label"].copy()
    y_test_full  = test_ml ["label"].copy()

    print(f"  Train: {len(train_ml):,} rows | Test: {len(test_ml):,} rows\n")

    # -- Train one binary RF per fault class ---------------------------------
    detectors   = {}
    test_probas = {}
    binary_results = {}

    print("=" * 72)
    print("  BINARY DETECTOR TRAINING (one RF per fault, physics features only)")
    print("=" * 72)

    for fault_name, feat_cols in FAULT_FEATURES.items():
        fault_label = LABEL_MAP.get(fault_name)
        if fault_label is None:
            continue

        y_tr_bin = (y_train_full == fault_label).astype(int)
        y_te_bin = (y_test_full  == fault_label).astype(int)

        X_tr = train_ml[feat_cols].copy()
        X_te = test_ml [feat_cols].copy()

        medians = X_tr.median(numeric_only=True)
        X_tr    = X_tr.fillna(medians).fillna(0)
        X_te    = X_te.fillna(medians).fillna(0)

        classes = np.unique(y_tr_bin)
        cw_dict = dict(zip(classes.tolist(),
                           compute_class_weight("balanced", classes=classes, y=y_tr_bin).tolist()))

        t0  = time.time()
        clf = RandomForestClassifier(n_estimators=200, max_depth=None,
                                     min_samples_leaf=5, class_weight=cw_dict,
                                     n_jobs=-1, random_state=42)
        clf.fit(X_tr, y_tr_bin)
        elapsed    = time.time() - t0
        y_pred_bin = clf.predict(X_te)
        proba_pos  = clf.predict_proba(X_te)[:, 1]

        prec    = precision_score(y_te_bin, y_pred_bin, zero_division=0)
        rec     = recall_score   (y_te_bin, y_pred_bin, zero_division=0)
        f1b     = f1_score       (y_te_bin, y_pred_bin, zero_division=0)
        support = int(y_te_bin.sum())

        detectors[fault_name]      = clf
        test_probas[fault_name]    = proba_pos
        binary_results[fault_name] = {"precision": prec, "recall": rec,
                                       "f1": f1b, "support": support,
                                       "features": len(feat_cols), "time_s": elapsed}

        print(f"  {fault_name:<12}  Prec={prec:.4f}  Rec={rec:.4f}  F1={f1b:.4f}  "
              f"support={support:6,}  features={len(feat_cols)}  ({elapsed:.1f}s)")

    # -- Combine: argmax over per-fault P(fault) -----------------------------
    fault_names  = list(test_probas.keys())
    fault_labels = [LABEL_MAP[fn] for fn in fault_names]
    proba_matrix = np.column_stack([test_probas[fn] for fn in fault_names])
    max_proba    = proba_matrix.max(axis=1)
    best_col     = proba_matrix.argmax(axis=1)
    y_pred_final = np.where(max_proba >= 0.5,
                            np.array(fault_labels)[best_col],
                            LABEL_MAP["normal"])

    present     = sorted(set(y_test_full.values) | set(y_pred_final))
    class_names = [LABEL_NAMES.get(c, str(c)) for c in present]
    acc = accuracy_score(y_test_full, y_pred_final)
    wf1 = f1_score(y_test_full, y_pred_final, average="weighted", zero_division=0)
    mf1 = f1_score(y_test_full, y_pred_final, average="macro",    zero_division=0)

    print("\n" + "=" * 72)
    print("  COMBINED BINARY ENSEMBLE RESULTS")
    print("=" * 72)
    print(f"  Accuracy    :  {acc:.4f}")
    print(f"  Weighted F1 :  {wf1:.4f}")
    print(f"  Macro F1    :  {mf1:.4f}")

    print("\n--- Per-class Report ---")
    print(classification_report(y_test_full, y_pred_final,
                                target_names=class_names, labels=present,
                                zero_division=0))

    print("--- Confusion Matrix ---")
    cm    = confusion_matrix(y_test_full, y_pred_final, labels=present)
    col_w = max(12, max(len(n) for n in class_names) + 2)
    print("Actual \\ Pred" + "".join(f"{n:>{col_w}}" for n in class_names))
    print("-" * (16 + col_w * len(class_names)))
    for i, rn in enumerate(class_names):
        print(f"{rn:<16}" + "".join(f"{v:>{col_w}}" for v in cm[i]))

    print("\n--- Per-fault Binary Detector Summary ---")
    print(f"  {'Fault':<12}  {'Precision':>10}  {'Recall':>8}  {'F1':>8}  {'Support':>9}  {'Features':>9}")
    print("  " + "-" * 60)
    for fn, r in binary_results.items():
        print(f"  {fn:<12}  {r['precision']:>10.4f}  {r['recall']:>8.4f}  "
              f"{r['f1']:>8.4f}  {r['support']:>9,}  {r['features']:>9}")

    print("\n--- Top Feature Importances per Detector ---")
    for fn, clf in detectors.items():
        feat_cols = FAULT_FEATURES[fn]
        idxs      = np.argsort(clf.feature_importances_)[::-1]
        print(f"\n  [{fn}]  (features: {', '.join(feat_cols)})")
        for rank, idx in enumerate(idxs, 1):
            print(f"    {rank}. {feat_cols[idx]:<30} {clf.feature_importances_[idx]:.4f}")

    # -- Save Models and Summaries -------------------------------------------
    models_dir = os.path.join(OUTPUT_DIR, "binary_models")
    os.makedirs(models_dir, exist_ok=True)
    
    for fn, clf in detectors.items():
        model_path = os.path.join(models_dir, f"rf_{fn}.pkl")
        joblib.dump(clf, model_path)
    print(f"\n  Saved {len(detectors)} binary models to -> {models_dir}/")

    pd.DataFrame([{"fault": fn, **{k: v for k, v in r.items() if k != "time_s"}}
                  for fn, r in binary_results.items()])\
      .to_csv(os.path.join(OUTPUT_DIR, "binary_detector_summary.csv"), index=False)
    pd.DataFrame({
        "y_true": y_test_full.values, "y_pred": y_pred_final,
        "y_true_name": [LABEL_NAMES.get(v, str(v)) for v in y_test_full.values],
        "y_pred_name": [LABEL_NAMES.get(v, str(v)) for v in y_pred_final],
        "max_confidence": max_proba,
    }).to_csv(os.path.join(OUTPUT_DIR, "binary_predictions.csv"), index=False)

    print(f"  Detector summary -> {OUTPUT_DIR}/binary_detector_summary.csv")
    print(f"  Predictions      -> {OUTPUT_DIR}/binary_predictions.csv")


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="3D Printer Fault Detector")
    group  = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--train",             action="store_true",
                       help="Train RF on full dataset and save model to disk")
    group.add_argument("--predict",           metavar="DB_PATH",
                       help="Predict faults for a new session DB file")
    group.add_argument("--evaluate",          action="store_true",
                       help="LOSO: strict cross-session generalization bound")
    group.add_argument("--evaluate-temporal", action="store_true",
                       help="80/20 temporal holdout: multi-model comparison")
    group.add_argument("--evaluate-binary",   action="store_true",
                       help="Per-fault binary detectors with physics-aware feature subsets")
    args = parser.parse_args()

    if args.train:
        train_and_save()
    elif args.predict:
        predict(args.predict)
    elif args.evaluate:
        evaluate()
    elif args.evaluate_temporal:
        evaluate_temporal()
    elif args.evaluate_binary:
        evaluate_binary()


