"""
data_service.py — Data loading, filtering, and cleaning logic
Extracted from main.py for the FastAPI backend.
"""

import os
import math
import random
from io import StringIO
from collections import deque
from typing import Optional, Dict, Any, List

import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, MinMaxScaler, Binarizer, LabelEncoder
from sklearn.feature_selection import SelectKBest, chi2, mutual_info_classif, VarianceThreshold, RFE
from sklearn.decomposition import PCA
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.linear_model import LinearRegression, LogisticRegression, Lasso
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.datasets import load_iris, load_breast_cancer, load_digits


# ─── Global state (per-session, in-process) ────────────────────────────────────
class DataStore:
    def __init__(self):
        self.df: Optional[pd.DataFrame] = None
        self.df_cleaned: Optional[pd.DataFrame] = None
        self.df_filtered: Optional[pd.DataFrame] = None
        self.source_name: str = ""
        self.active_filters: Dict[str, str] = {}

    def reset(self):
        self.df = None
        self.df_cleaned = None
        self.df_filtered = None
        self.source_name = ""
        self.active_filters = {}

    def on_data_loaded(self, df: pd.DataFrame, source_name: str):
        self.df = df
        self.df_cleaned = df.copy()
        self.df_filtered = df.copy()
        self.source_name = source_name
        self.active_filters = {}

    def get_info(self) -> Dict[str, Any]:
        if self.df is None:
            return {"loaded": False}
        df = self.df
        null_counts = df.isnull().sum().to_dict()
        dtypes = {col: str(dtype) for col, dtype in df.dtypes.items()}
        return {
            "loaded": True,
            "source": self.source_name,
            "rows": len(df),
            "cols": len(df.columns),
            "columns": list(df.columns),
            "dtypes": dtypes,
            "null_counts": {k: int(v) for k, v in null_counts.items()},
            "active_filters": self.active_filters,
            "filtered_rows": len(self.df_filtered) if self.df_filtered is not None else 0,
        }


store = DataStore()


# ─── Loading ────────────────────────────────────────────────────────────────────

def load_from_path(file_path: str, ext: str = None) -> pd.DataFrame:
    if ext is None:
        ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return pd.read_csv(file_path)
    elif ext in (".xlsx", ".xls"):
        return pd.read_excel(file_path)
    elif ext == ".json":
        return pd.read_json(file_path)
    elif ext == ".tsv":
        return pd.read_csv(file_path, sep="\t")
    elif ext == ".parquet":
        return pd.read_parquet(file_path)
    else:
        return pd.read_csv(file_path)


def load_from_bytes(content: bytes, filename: str) -> pd.DataFrame:
    ext = os.path.splitext(filename)[1].lower()
    from io import BytesIO
    bio = BytesIO(content)
    if ext == ".csv":
        return pd.read_csv(bio)
    elif ext in (".xlsx", ".xls"):
        return pd.read_excel(bio)
    elif ext == ".json":
        return pd.read_json(bio)
    elif ext == ".tsv":
        return pd.read_csv(bio, sep="\t")
    elif ext == ".parquet":
        return pd.read_parquet(bio)
    else:
        return pd.read_csv(bio)


def load_from_url(url: str, fmt: str = "auto") -> pd.DataFrame:
    if fmt == "auto":
        if url.endswith(".json"):
            fmt = "json"
        elif url.endswith(".tsv"):
            fmt = "tsv"
        elif url.endswith((".xlsx", ".xls")):
            fmt = "excel"
        else:
            fmt = "csv"
    if fmt == "csv":
        return pd.read_csv(url)
    elif fmt == "json":
        return pd.read_json(url)
    elif fmt == "tsv":
        return pd.read_csv(url, sep="\t")
    elif fmt == "excel":
        return pd.read_excel(url)
    raise ValueError(f"Unknown format: {fmt}")


def load_from_text(text: str) -> pd.DataFrame:
    if "\t" in text:
        return pd.read_csv(StringIO(text), sep="\t")
    elif "," in text:
        return pd.read_csv(StringIO(text))
    else:
        return pd.read_csv(StringIO(text), sep=r"\s+")


def load_sample(choice: str) -> pd.DataFrame:
    np.random.seed(42)
    if choice == "iris":
        data = load_iris()
        df = pd.DataFrame(data.data, columns=data.feature_names)
        df["target"] = data.target
        return df
    elif choice == "breast_cancer":
        data = load_breast_cancer()
        df = pd.DataFrame(data.data, columns=data.feature_names)
        df["target"] = data.target
        return df
    elif choice == "digits":
        data = load_digits()
        df = pd.DataFrame(data.data, columns=[f"pixel_{i}" for i in range(data.data.shape[1])])
        df["target"] = data.target
        return df
    elif choice == "sales":
        n = 200
        return pd.DataFrame({
            "Date": [str(d.date()) for d in pd.date_range("2024-01-01", periods=n, freq="D")],
            "Sales": np.random.randint(5000, 50000, n).tolist(),
            "Profit": np.random.randint(1000, 15000, n).tolist(),
            "Category": np.random.choice(["Electronics", "Clothing", "Home", "Sports"], n).tolist(),
            "Region": np.random.choice(["North", "South", "East", "West"], n).tolist(),
        })
    elif choice == "weather":
        n = 365
        return pd.DataFrame({
            "Date": [str(d.date()) for d in pd.date_range("2024-01-01", periods=n, freq="D")],
            "Temperature": np.clip(20 + 10 * np.sin(np.arange(n) * 2 * np.pi / 365) + np.random.normal(0, 3, n), -10, 40).tolist(),
            "Humidity": np.clip(50 + 20 * np.sin(np.arange(n) * 2 * np.pi / 365) + np.random.normal(0, 5, n), 20, 100).tolist(),
            "Precipitation": np.random.exponential(5, n).tolist(),
            "Wind_Speed": np.random.gamma(2, 2, n).tolist(),
            "Condition": np.random.choice(["Sunny", "Cloudy", "Rainy", "Snowy"], n).tolist(),
        })
    elif choice == "ecommerce":
        n = 300
        return pd.DataFrame({
            "Product_ID": list(range(1, n + 1)),
            "Price": np.random.randint(10, 1000, n).tolist(),
            "Units_Sold": np.random.randint(5, 500, n).tolist(),
            "Rating": np.round(np.random.uniform(1, 5, n), 1).tolist(),
            "Category": np.random.choice(["Electronics", "Books", "Clothing", "Home", "Sports"], n).tolist(),
            "Customer_Age": np.random.randint(18, 75, n).tolist(),
        })
    raise ValueError(f"Unknown sample: {choice}")


# ─── Filtering ──────────────────────────────────────────────────────────────────

def apply_filter(col: str, condition: str, value: str) -> Dict[str, Any]:
    if store.df is None:
        raise ValueError("No data loaded")
    if col not in store.df.columns:
        raise ValueError(f"Column '{col}' not found")

    if store.df_filtered is None:
        store.df_filtered = store.df.copy()

    col_data = store.df_filtered[col]

    try:
        num_val = float(value)
        is_numeric = True
    except ValueError:
        num_val = None
        is_numeric = False

    if condition == "equals":
        mask = pd.to_numeric(col_data, errors="coerce") == num_val if is_numeric else col_data.astype(str) == value
    elif condition == "not_equals":
        mask = pd.to_numeric(col_data, errors="coerce") != num_val if is_numeric else col_data.astype(str) != value
    elif condition == "gt":
        mask = pd.to_numeric(col_data, errors="coerce") > num_val
    elif condition == "lt":
        mask = pd.to_numeric(col_data, errors="coerce") < num_val
    elif condition == "gte":
        mask = pd.to_numeric(col_data, errors="coerce") >= num_val
    elif condition == "lte":
        mask = pd.to_numeric(col_data, errors="coerce") <= num_val
    elif condition == "contains":
        mask = col_data.astype(str).str.contains(value, case=False, na=False)
    elif condition == "in_range":
        parts = value.split(",")
        lo, hi = float(parts[0].strip()), float(parts[1].strip())
        numeric_col = pd.to_numeric(col_data, errors="coerce")
        mask = (numeric_col >= lo) & (numeric_col <= hi)
    else:
        raise ValueError(f"Unknown condition: {condition}")

    store.df_filtered = store.df_filtered[mask].reset_index(drop=True)
    filter_desc = f"{col} {condition} '{value}'"
    store.active_filters[col] = filter_desc

    return {
        "filtered_rows": len(store.df_filtered),
        "filter_desc": filter_desc,
        "active_filters": store.active_filters,
    }


def clear_filters() -> Dict[str, Any]:
    if store.df is not None:
        store.df_filtered = store.df.copy()
    store.active_filters = {}
    return {"filtered_rows": len(store.df_filtered) if store.df_filtered is not None else 0}


def get_column_unique_values(col: str) -> List[str]:
    if store.df is None or col not in store.df.columns:
        return []
    unique = store.df[col].dropna().unique()
    if len(unique) <= 100:
        return [str(v) for v in sorted(unique, key=str)]
    return []


def get_preview_rows(n: int = 20, use_cleaned: bool = False) -> Dict[str, Any]:
    df = store.df_cleaned if use_cleaned else store.df
    if df is None:
        return {"columns": [], "rows": []}
    preview = df.head(n)
    return {
        "columns": list(preview.columns),
        "rows": [[str(v)[:50] for v in row] for row in preview.values.tolist()],
    }


# ─── Cleaning ───────────────────────────────────────────────────────────────────

def _numeric_frame(df: pd.DataFrame, exclude: Optional[str] = None) -> pd.DataFrame:
    cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if exclude in cols:
        cols.remove(exclude)
    X = df[cols].replace([np.inf, -np.inf], np.nan)
    return X.fillna(X.mean(numeric_only=True)).fillna(0)


def _prepare_target(series: pd.Series):
    if pd.api.types.is_numeric_dtype(series):
        return series.fillna(series.median())
    mode = series.mode(dropna=True)
    fallback = mode.iloc[0] if not mode.empty else "Unknown"
    return series.fillna(fallback)


def _is_classification_target(series: pd.Series) -> bool:
    if not pd.api.types.is_numeric_dtype(series):
        return True
    return series.nunique(dropna=True) <= min(20, max(2, int(len(series) * 0.2)))


def _as_class_labels(series: pd.Series) -> np.ndarray:
    return LabelEncoder().fit_transform(_prepare_target(series).astype(str))


def _safe_k(k: int, available: int) -> int:
    return max(1, min(int(k), int(available)))


def _rename_selected(columns: List[str], suffix: str) -> List[str]:
    return [f"{col}{suffix}" for col in columns]


def _distribution_fill(df: pd.DataFrame, log: List[str]) -> pd.DataFrame:
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    mean_cols, median_cols, mode_cols = [], [], []

    for col in numeric_cols:
        if not df[col].isna().any():
            continue
        skew = float(df[col].skew(skipna=True)) if df[col].notna().sum() > 2 else 0.0
        if abs(skew) <= 0.75:
            df[col] = df[col].fillna(df[col].mean())
            mean_cols.append(col)
        else:
            df[col] = df[col].fillna(df[col].median())
            median_cols.append(col)

    for col in df.columns.difference(numeric_cols):
        if not df[col].isna().any():
            continue
        mode = df[col].mode(dropna=True)
        df[col] = df[col].fillna(mode.iloc[0] if not mode.empty else "Unknown")
        mode_cols.append(col)

    if mean_cols:
        log.append(f"✅ Filled near-normal numeric columns with mean: {', '.join(mean_cols)}")
    if median_cols:
        log.append(f"✅ Filled skewed numeric columns with median: {', '.join(median_cols)}")
    if mode_cols:
        log.append(f"✅ Filled categorical columns with mode: {', '.join(mode_cols)}")
    return df


def _feature_scores(df: pd.DataFrame, target_col: str, method: str, k: int):
    X = _numeric_frame(df, target_col)
    if X.empty:
        raise ValueError("Feature selection requires at least one numeric feature column.")

    target = _prepare_target(df[target_col])
    classification = _is_classification_target(target)
    y_class = _as_class_labels(target)
    y_reg = pd.to_numeric(target, errors="coerce").fillna(pd.to_numeric(target, errors="coerce").median())

    if method == "variance":
        selector = VarianceThreshold()
        selector.fit(X)
        scores = selector.variances_
    elif method == "correlation":
        y_num = y_class if classification else y_reg
        scores = np.array([abs(pd.Series(X[col]).corr(pd.Series(y_num))) for col in X.columns])
        scores = np.nan_to_num(scores, nan=0.0)
    elif method == "info_gain":
        scores = mutual_info_classif(X, y_class, random_state=42)
    elif method == "chi2":
        X_non_negative = MinMaxScaler().fit_transform(X)
        selector = SelectKBest(chi2, k=_safe_k(k, X.shape[1]))
        selector.fit(X_non_negative, y_class)
        scores = selector.scores_
    elif method == "fisher":
        scores = []
        overall_mean = X.mean(axis=0)
        for col in X.columns:
            between, within = 0.0, 0.0
            for cls in np.unique(y_class):
                values = X.loc[y_class == cls, col]
                if values.empty:
                    continue
                between += len(values) * float((values.mean() - overall_mean[col]) ** 2)
                within += float(((values - values.mean()) ** 2).sum())
            scores.append(between / (within + 1e-12))
        scores = np.array(scores)
    elif method == "wrapper_rfe":
        estimator = LogisticRegression(max_iter=1000) if classification else LinearRegression()
        selector = RFE(estimator, n_features_to_select=_safe_k(k, X.shape[1]))
        selector.fit(StandardScaler().fit_transform(X), y_class if classification else y_reg)
        scores = (X.shape[1] - selector.ranking_ + 1).astype(float)
    elif method == "embedded":
        if classification:
            estimator = RandomForestClassifier(n_estimators=160, random_state=42)
            estimator.fit(X, y_class)
            scores = estimator.feature_importances_
        else:
            estimator = Lasso(alpha=0.01, max_iter=5000)
            estimator.fit(StandardScaler().fit_transform(X), y_reg)
            scores = np.abs(estimator.coef_)
    else:
        raise ValueError(f"Unknown feature selection method: {method}")

    scores = np.nan_to_num(scores, nan=0.0, posinf=0.0, neginf=0.0)
    ranking = sorted(zip(X.columns, scores), key=lambda item: item[1], reverse=True)
    return ranking[:_safe_k(k, len(ranking))]


def _apply_feature_extraction(df: pd.DataFrame, method: str, target_col: Optional[str], components: int):
    X = _numeric_frame(df, target_col)
    if X.empty:
        raise ValueError("Feature extraction requires at least one numeric feature column.")

    X_scaled = StandardScaler().fit_transform(X)
    n_components = _safe_k(components, X.shape[1])
    metadata: Dict[str, Any] = {}

    if method == "pca":
        model = PCA(n_components=n_components, random_state=42)
        transformed = model.fit_transform(X_scaled)
        names = [f"pca_{i + 1}" for i in range(transformed.shape[1])]
        metadata["Explained variance"] = round(float(model.explained_variance_ratio_.sum()), 4)
    elif method == "lda":
        if not target_col or target_col not in df.columns:
            raise ValueError("LDA feature extraction requires a target column.")
        y = _as_class_labels(df[target_col])
        max_components = min(X.shape[1], max(1, len(np.unique(y)) - 1))
        n_components = _safe_k(components, max_components)
        model = LinearDiscriminantAnalysis(n_components=n_components)
        transformed = model.fit_transform(X_scaled, y)
        names = [f"lda_{i + 1}" for i in range(transformed.shape[1])]
        metadata["Explained variance"] = round(float(getattr(model, "explained_variance_ratio_", np.array([0])).sum()), 4)
    elif method == "autoencoder":
        hidden = n_components
        model = MLPRegressor(
            hidden_layer_sizes=(hidden,),
            activation="tanh",
            max_iter=700,
            random_state=42,
            learning_rate_init=0.01,
            early_stopping=True,
        )
        model.fit(X_scaled, X_scaled)
        hidden_layer = np.tanh(np.dot(X_scaled, model.coefs_[0]) + model.intercepts_[0])
        transformed = hidden_layer
        names = [f"autoencoder_{i + 1}" for i in range(transformed.shape[1])]
        reconstructed = model.predict(X_scaled)
        metadata["Reconstruction RMSE"] = round(float(np.sqrt(np.mean((X_scaled - reconstructed) ** 2))), 4)
    else:
        raise ValueError(f"Unknown feature extraction method: {method}")

    extracted = pd.DataFrame(transformed, columns=names, index=df.index)
    if target_col and target_col in df.columns:
        extracted[target_col] = df[target_col].values
    return extracted, metadata


def apply_cleaning(
    missing_method: str,
    remove_outliers: bool,
    outlier_threshold: float,
    dtype_column: Optional[str] = None,
    dtype_convert: Optional[str] = None,
    scale_method: Optional[str] = None,
    binarize_column: Optional[str] = None,
    binarize_threshold: float = 0.0,
    encode_column: Optional[str] = None,
    encode_method: Optional[str] = None,
    selection_target: Optional[str] = None,
    selection_method: Optional[str] = None,
    selection_k: int = 5,
    extraction_target: Optional[str] = None,
    extraction_method: Optional[str] = None,
    extraction_components: int = 2,
) -> Dict[str, Any]:
    if store.df_cleaned is None:
        raise ValueError("No data loaded")

    log = []
    df = store.df_cleaned.copy()
    numeric_cols = df.select_dtypes(include=[np.number]).columns

    # Missing values
    if missing_method == "drop":
        before = len(df)
        df = df.dropna()
        log.append(f"✅ Dropped {before - len(df)} rows with missing values")
    elif missing_method == "mean":
        df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].mean())
        log.append("✅ Filled missing values with mean")
    elif missing_method == "median":
        df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].median())
        log.append("✅ Filled missing values with median")
    elif missing_method == "ffill":
        df = df.ffill()
        log.append("✅ Filled missing values with forward fill")
    elif missing_method == "bfill":
        df = df.bfill()
        log.append("✅ Filled missing values with backward fill")
    elif missing_method == "distribution":
        df = _distribution_fill(df, log)

    # Outliers (IQR)
    if remove_outliers:
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        Q1 = df[numeric_cols].quantile(0.25)
        Q3 = df[numeric_cols].quantile(0.75)
        IQR = Q3 - Q1
        before = len(df)
        df = df[~((df[numeric_cols] < (Q1 - outlier_threshold * IQR)) |
                  (df[numeric_cols] > (Q3 + outlier_threshold * IQR))).any(axis=1)]
        removed = before - len(df)
        if removed > 0:
            log.append(f"🎯 Removed {removed} outliers (IQR method, threshold={outlier_threshold})")

    # Data type conversion
    if dtype_column and dtype_column in df.columns:
        if dtype_convert == "numeric":
            df[dtype_column] = pd.to_numeric(df[dtype_column], errors="coerce")
            log.append(f"🔄 Converted '{dtype_column}' to numeric")
        elif dtype_convert == "categorical":
            df[dtype_column] = df[dtype_column].astype("category")
            log.append(f"🔄 Converted '{dtype_column}' to categorical")

    # Binarization
    if binarize_column:
        target_cols = df.select_dtypes(include=[np.number]).columns.tolist() if binarize_column == "__all_numeric__" else [binarize_column]
        protected_cols = {col for col in (selection_target, extraction_target) if col}
        target_cols = [col for col in target_cols if col not in protected_cols]
        target_cols = [col for col in target_cols if col in df.columns and pd.api.types.is_numeric_dtype(df[col])]
        if target_cols:
            transformer = Binarizer(threshold=binarize_threshold)
            df[target_cols] = transformer.fit_transform(df[target_cols])
            log.append(f"⚙️ Binarized {len(target_cols)} numeric column(s) at threshold {binarize_threshold:g}")

    # Encoding
    if encode_column and encode_column in df.columns and encode_method:
        source = df[encode_column].astype(str).fillna("Unknown")
        if encode_method == "label":
            df[encode_column] = LabelEncoder().fit_transform(source)
            log.append(f"🏷️ Label encoded '{encode_column}'")
        elif encode_method == "factorize":
            df[encode_column] = pd.factorize(source)[0]
            log.append(f"🏷️ Factorized '{encode_column}'")
        elif encode_method == "onehot":
            encoded = pd.get_dummies(source, prefix=encode_column, dtype=int)
            df = pd.concat([df.drop(columns=[encode_column]), encoded], axis=1)
            log.append(f"🏷️ One-hot encoded '{encode_column}' into {len(encoded.columns)} columns")

    # Scaling
    if scale_method:
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if scale_method == "standard":
            scaler = StandardScaler()
        else:
            scaler = MinMaxScaler()
        df[numeric_cols] = scaler.fit_transform(df[numeric_cols])
        log.append(f"📊 Scaled numeric columns using {'Standard' if scale_method == 'standard' else 'MinMax'} Scaler")

    # Feature selection
    if selection_method and selection_target and selection_target in df.columns:
        selected = _feature_scores(df, selection_target, selection_method, selection_k)
        selected_cols = [col for col, _ in selected]
        keep_cols = selected_cols + ([selection_target] if selection_target not in selected_cols else [])
        df = df[keep_cols]
        score_text = ", ".join(f"{col}={score:.4g}" for col, score in selected[:5])
        log.append(f"🎚️ Selected top {len(selected_cols)} features using {selection_method.replace('_', ' ')}: {score_text}")

    # Feature extraction
    if extraction_method:
        df, metadata = _apply_feature_extraction(df, extraction_method, extraction_target, extraction_components)
        details = ", ".join(f"{k}: {v}" for k, v in metadata.items())
        suffix = f" ({details})" if details else ""
        log.append(f"🧬 Extracted {extraction_method.upper()} features: {df.shape[1]} column(s){suffix}")

    store.df_cleaned = df
    return {
        "log": log,
        "rows": len(df),
        "cols": len(df.columns),
    }


def remove_duplicates() -> Dict[str, Any]:
    if store.df_cleaned is None:
        raise ValueError("No data loaded")
    before = len(store.df_cleaned)
    store.df_cleaned = store.df_cleaned.drop_duplicates()
    removed = before - len(store.df_cleaned)
    return {"removed": removed, "rows": len(store.df_cleaned)}


def export_cleaned_csv() -> bytes:
    if store.df_cleaned is None:
        raise ValueError("No cleaned data available")
    return store.df_cleaned.to_csv(index=False).encode("utf-8")
