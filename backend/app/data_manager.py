#!/usr/bin/env python3

import json
import logging
import os
import re
from io import BytesIO
from typing import Any, Dict, List, NotRequired, Optional, Set, TypedDict, cast

import numpy as np
import pandas as pd
from langchain.chat_models import init_chat_model
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from app.config import settings

logger = logging.getLogger(__name__)


class TableMetadataDict(TypedDict):
    name: str
    description: str
    columns: List[str]
    rows: int
    source: str
    table_comment_cn: str
    column_comments: Dict[str, str]
    column_original_names: Dict[str, str]
    sample_questions: NotRequired[List[str]]


class NamingColumnPlan(TypedDict):
    source_name: str
    column_name_en: str
    column_comment_cn: str


class NamingPlan(TypedDict):
    table_name_en: str
    table_comment_cn: str
    columns: List[NamingColumnPlan]
    sample_questions: NotRequired[List[str]]


class DataManager:
    """数据管理器类"""

    def __init__(self):
        self.data_cache: Dict[str, pd.DataFrame] = {}
        self.metadata: Dict[str, TableMetadataDict] = {}
        self.db_url = settings.database_url
        self.meta_db_url = settings.metadata_database_url
        self.engine: Optional[Engine] = None
        self.meta_engine: Optional[Engine] = None
        self.llm = self._initialize_llm()

        # 初始化元信息数据库
        self._initialize_metadata_store()
        # 初始化时扫描数据库所有表
        self._scan_database_tables()

    def _initialize_metadata_store(self) -> None:
        """初始化元信息数据库（与业务数据隔离）。"""
        try:
            self.meta_engine = create_engine(self.meta_db_url)
            if self.meta_engine is None:
                return
            with self.meta_engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS table_metadata (
                            table_name TEXT PRIMARY KEY,
                            table_comment_cn TEXT NOT NULL,
                            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS column_metadata (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            table_name TEXT NOT NULL,
                            column_name TEXT NOT NULL,
                            column_comment_cn TEXT NOT NULL,
                            original_name TEXT,
                            UNIQUE(table_name, column_name)
                        )
                        """
                    )
                )
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS sample_questions (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            table_name TEXT NOT NULL,
                            question_order INTEGER NOT NULL,
                            question_text TEXT NOT NULL,
                            UNIQUE(table_name, question_order)
                        )
                        """
                    )
                )
        except Exception as e:
            logger.warning(f"Metadata DB init failed: {e}")
            self.meta_engine = None

    def _initialize_llm(self):
        """初始化用于命名的 LLM，缺省时自动降级为本地规则命名"""
        api_key = settings.openai_api_key or os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None

        try:
            kwargs: Dict[str, Any] = {
                "temperature": settings.performance_temperature,
                "api_key": api_key,
            }
            base_url = settings.openai_base_url or os.getenv("OPENAI_BASE_URL")
            if base_url:
                kwargs["base_url"] = base_url
            return init_chat_model(
                model=settings.performance_model,
                model_provider="openai",
                **kwargs,
            )
        except Exception as e:
            logger.warning(f"LLM init failed, fallback to local naming: {e}")
            return None

    def _scan_database_tables(self) -> None:
        """扫描数据库中的所有表并初始化 metadata"""

        try:
            self.engine = create_engine(self.db_url)
            engine = self.engine
            if engine is None:
                return

            # 使用 Inspector 获取表信息
            inspector = inspect(engine)
            table_names = inspector.get_table_names()

            # 为每个表创建 metadata
            with engine.connect() as conn:
                for table_name in table_names:
                    # 获取列信息
                    columns_info = inspector.get_columns(table_name)
                    columns = [str(col["name"]) for col in columns_info]

                    # 获取行数
                    result = conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
                    row_count_raw = result.scalar()
                    row_count = int(row_count_raw or 0)

                    meta_record = self._get_table_metadata_record(table_name)
                    table_comment_cn = (
                        str(meta_record["table_comment_cn"])
                        if meta_record and meta_record.get("table_comment_cn")
                        else table_name
                    )
                    column_comments = (
                        cast(Dict[str, str], meta_record.get("column_comments"))
                        if meta_record
                        and isinstance(meta_record.get("column_comments"), dict)
                        else {col: col for col in columns}
                    )
                    column_original_names = (
                        cast(Dict[str, str], meta_record.get("column_original_names"))
                        if meta_record
                        and isinstance(meta_record.get("column_original_names"), dict)
                        else {col: col for col in columns}
                    )
                    sample_questions = (
                        cast(List[str], meta_record.get("sample_questions"))
                        if meta_record
                        and isinstance(meta_record.get("sample_questions"), list)
                        else []
                    )

                    self.metadata[table_name] = {
                        "name": table_comment_cn,
                        "description": f"{table_name} 数据表",
                        "columns": columns,
                        "rows": row_count,
                        "source": "db",
                        "table_comment_cn": table_comment_cn,
                        "column_comments": column_comments,
                        "column_original_names": column_original_names,
                        "sample_questions": sample_questions,
                    }

            print(f"✅ 成功扫描数据库，发现 {len(self.metadata)} 个表")

        except Exception as e:
            print(f"❌ 扫描数据库时出错: {e}")
            import traceback

            traceback.print_exc()

    def get_engine(self) -> Optional[Engine]:
        """获取 SQLAlchemy 引擎"""
        return self.engine

    def read_table(self, table_name: str) -> Optional[pd.DataFrame]:
        """使用 SQLAlchemy 读取表数据为 DataFrame

        Args:
            table_name: 表名

        Returns:
            DataFrame 对象，如果表不存在或出错则返回 None
        """
        if self.engine is None:
            print(f"❌ 数据库引擎未初始化")
            return None

        try:
            df = pd.read_sql_table(table_name, self.engine)
            # 转换 NumPy 类型为 Python 原生类型，避免 Pydantic 序列化错误
            return self._convert_numpy_to_native(df)
        except Exception as e:
            print(f"❌ 读取表 {table_name} 时出错: {e}")
            return None

    def execute_query(self, query: str) -> Optional[pd.DataFrame]:
        """执行 SQL 查询并返回结果为 DataFrame

        Args:
            query: SQL 查询语句

        Returns:
            DataFrame 对象，如果查询出错则返回 None
        """
        if self.engine is None:
            print(f"❌ 数据库引擎未初始化")
            return None

        try:
            df = pd.read_sql_query(query, self.engine)
            # 转换 NumPy 类型为 Python 原生类型，避免 Pydantic 序列化错误
            return self._convert_numpy_to_native(df)
        except Exception as e:
            print(f"❌ 执行查询时出错: {e}")
            return None

    def get_table_schema(self, table_name: str) -> Optional[Dict[str, Any]]:
        """获取表的结构信息（包括列类型）

        Args:
            table_name: 表名

        Returns:
            表结构字典，如果表不存在则返回 None
        """
        if self.engine is None:
            print(f"❌ 数据库引擎未初始化")
            return None

        try:
            inspector = inspect(self.engine)
            columns = inspector.get_columns(table_name)

            schema = {
                "table_name": table_name,
                "columns": [],
                "primary_keys": inspector.get_pk_constraint(table_name).get(
                    "constrained_columns", []
                ),
                "foreign_keys": [],
            }

            # 获取外键信息
            fks = inspector.get_foreign_keys(table_name)
            for fk in fks:
                schema["foreign_keys"].append(
                    {
                        "column": fk["constrained_columns"][0],
                        "ref_table": fk["referred_table"],
                        "ref_column": fk["referred_columns"][0],
                    }
                )

            # 获取列信息
            for col in columns:
                schema["columns"].append(
                    {
                        "name": col["name"],
                        "type": str(col["type"]),
                        "nullable": col["nullable"],
                        "default": col.get("default"),
                        "primary_key": col.get("primary_key", False),
                    }
                )

            return schema
        except Exception as e:
            print(f"❌ 获取表 {table_name} 结构时出错: {e}")
            return None

    def _convert_scalar_numpy_to_native(self, value: Any) -> Any:
        """将单个 NumPy 类型转换为 Python 原生类型"""
        if value is None or (isinstance(value, float) and np.isnan(value)):
            return None
        if isinstance(value, np.generic):
            dtype = value.dtype
            if np.issubdtype(dtype, np.integer):
                return int(value.item())
            if np.issubdtype(dtype, np.floating):
                return float(value.item())
            if np.issubdtype(dtype, np.bool_):
                return bool(value.item())
        if isinstance(value, np.datetime64):
            return str(value)
        if hasattr(value, "tolist"):
            return cast(Any, value).tolist()
        return value

    def _convert_numpy_to_native(self, df: pd.DataFrame) -> pd.DataFrame:
        """将 DataFrame 中的 NumPy 类型转换为 Python 原生类型

        Args:
            df: 输入的 DataFrame

        Returns:
            转换后的 DataFrame
        """
        # 处理 NaN 值
        df = df.where(pd.notnull(df), None)

        # 转换 NumPy 类型为 Python 原生类型
        return df.apply(self._convert_scalar_numpy_to_native)

    def get_table_list(self) -> List[Dict[str, Any]]:
        """获取所有数据表列表"""
        table_list = []
        for table_name, metadata in self.metadata.items():
            meta_record = self._get_table_metadata_record(table_name)
            table_comment_cn = (
                str(meta_record["table_comment_cn"])
                if meta_record and meta_record.get("table_comment_cn")
                else metadata.get("table_comment_cn", metadata["name"])
            )
            column_comments = (
                cast(Dict[str, str], meta_record["column_comments"])
                if meta_record and isinstance(meta_record.get("column_comments"), dict)
                else metadata.get("column_comments", {})
            )
            sample_questions = (
                cast(List[str], meta_record["sample_questions"])
                if meta_record and isinstance(meta_record.get("sample_questions"), list)
                else metadata.get("sample_questions", [])
            )
            table_list.append(
                {
                    "name": table_comment_cn,
                    "table": table_name,
                    "rows": metadata["rows"],
                    "columns": metadata["columns"],
                    "description": metadata["description"],
                    "source": metadata["source"],
                    "table_comment_cn": table_comment_cn,
                    "column_comments": column_comments,
                    "sample_questions": sample_questions,
                }
            )
        return table_list

    def get_table_info(self, table_name: str) -> Optional[TableMetadataDict]:
        """获取表详细信息"""
        if table_name in self.metadata:
            meta_record = self._get_table_metadata_record(table_name)
            if meta_record:
                self.metadata[table_name]["table_comment_cn"] = str(
                    meta_record.get(
                        "table_comment_cn",
                        self.metadata[table_name]["table_comment_cn"],
                    )
                )
                if isinstance(meta_record.get("column_comments"), dict):
                    self.metadata[table_name]["column_comments"] = cast(
                        Dict[str, str], meta_record["column_comments"]
                    )
                if isinstance(meta_record.get("column_original_names"), dict):
                    self.metadata[table_name]["column_original_names"] = cast(
                        Dict[str, str], meta_record["column_original_names"]
                    )
                if isinstance(meta_record.get("sample_questions"), list):
                    self.metadata[table_name]["sample_questions"] = cast(
                        List[str], meta_record["sample_questions"]
                    )
                self.metadata[table_name]["name"] = self.metadata[table_name][
                    "table_comment_cn"
                ]
            return self.metadata[table_name]
        return None

    def _build_filename_table_base(self, filename: str) -> str:
        """使用文件名（去扩展名）作为表名基础，必要时做 SQL 标识符清洗。"""
        file_stem = os.path.splitext(os.path.basename(filename))[0]
        return self._sanitize_sql_identifier(
            file_stem, fallback="uploaded_table", prefix="uploaded"
        )

    def _sanitize_sql_identifier(
        self, value: str, fallback: str = "col", prefix: str = "col"
    ) -> str:
        normalized = re.sub(r"[^a-zA-Z0-9_]+", "_", str(value)).strip("_").lower()
        if not normalized:
            normalized = fallback
        if re.match(r"^[0-9]", normalized):
            normalized = f"{prefix}_{normalized}"
        return normalized

    def _table_exists(self, table_name: str) -> bool:
        if table_name in self.metadata:
            return True
        if self.engine is None:
            return False
        with self.engine.connect() as conn:
            result = conn.execute(
                text(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = :name LIMIT 1"
                ),
                {"name": table_name},
            )
            return result.first() is not None

    def _save_table_metadata(
        self,
        table_name: str,
        table_comment_cn: str,
        column_comments: Dict[str, str],
        column_original_names: Dict[str, str],
        sample_questions: List[str],
    ) -> None:
        if self.meta_engine is None:
            return
        try:
            with self.meta_engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO table_metadata(table_name, table_comment_cn, updated_at)
                        VALUES(:table_name, :table_comment_cn, CURRENT_TIMESTAMP)
                        ON CONFLICT(table_name) DO UPDATE SET
                            table_comment_cn = excluded.table_comment_cn,
                            updated_at = CURRENT_TIMESTAMP
                        """
                    ),
                    {"table_name": table_name, "table_comment_cn": table_comment_cn},
                )

                conn.execute(
                    text("DELETE FROM column_metadata WHERE table_name = :table_name"),
                    {"table_name": table_name},
                )
                for column_name, column_comment_cn in column_comments.items():
                    conn.execute(
                        text(
                            """
                            INSERT INTO column_metadata(table_name, column_name, column_comment_cn, original_name)
                            VALUES(:table_name, :column_name, :column_comment_cn, :original_name)
                            """
                        ),
                        {
                            "table_name": table_name,
                            "column_name": column_name,
                            "column_comment_cn": column_comment_cn,
                            "original_name": column_original_names.get(column_name, ""),
                        },
                    )

                conn.execute(
                    text("DELETE FROM sample_questions WHERE table_name = :table_name"),
                    {"table_name": table_name},
                )
                for idx, question in enumerate(sample_questions[:4], start=1):
                    conn.execute(
                        text(
                            """
                            INSERT INTO sample_questions(table_name, question_order, question_text)
                            VALUES(:table_name, :question_order, :question_text)
                            """
                        ),
                        {
                            "table_name": table_name,
                            "question_order": idx,
                            "question_text": question,
                        },
                    )
        except Exception as e:
            logger.warning("Save metadata failed for table %s: %s", table_name, e)

    def _get_table_metadata_record(self, table_name: str) -> Optional[Dict[str, Any]]:
        if self.meta_engine is None:
            return None
        try:
            with self.meta_engine.connect() as conn:
                table_row = (
                    conn.execute(
                        text(
                            "SELECT table_comment_cn FROM table_metadata WHERE table_name = :table_name"
                        ),
                        {"table_name": table_name},
                    )
                    .mappings()
                    .first()
                )

                if not table_row:
                    return None

                column_rows = (
                    conn.execute(
                        text(
                            """
                        SELECT column_name, column_comment_cn, COALESCE(original_name, column_name) AS original_name
                        FROM column_metadata
                        WHERE table_name = :table_name
                        """
                        ),
                        {"table_name": table_name},
                    )
                    .mappings()
                    .all()
                )

                question_rows = (
                    conn.execute(
                        text(
                            """
                        SELECT question_text
                        FROM sample_questions
                        WHERE table_name = :table_name
                        ORDER BY question_order ASC
                        """
                        ),
                        {"table_name": table_name},
                    )
                    .mappings()
                    .all()
                )

                return {
                    "table_comment_cn": str(table_row["table_comment_cn"]),
                    "column_comments": {
                        str(row["column_name"]): str(row["column_comment_cn"])
                        for row in column_rows
                    },
                    "column_original_names": {
                        str(row["column_name"]): str(row["original_name"])
                        for row in column_rows
                    },
                    "sample_questions": [
                        str(row["question_text"]) for row in question_rows
                    ],
                }
        except Exception as e:
            logger.warning("Read metadata failed for table %s: %s", table_name, e)
            return None

    def _delete_table_metadata(self, table_name: str) -> None:
        if self.meta_engine is None:
            return
        try:
            with self.meta_engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM table_metadata WHERE table_name = :table_name"),
                    {"table_name": table_name},
                )
                conn.execute(
                    text("DELETE FROM column_metadata WHERE table_name = :table_name"),
                    {"table_name": table_name},
                )
                conn.execute(
                    text("DELETE FROM sample_questions WHERE table_name = :table_name"),
                    {"table_name": table_name},
                )
        except Exception as e:
            logger.warning("Delete metadata failed for table %s: %s", table_name, e)

    def _generate_unique_table_name(self, base_name: str) -> str:
        base_candidate = self._sanitize_sql_identifier(
            base_name, fallback="uploaded_table", prefix="uploaded"
        )
        candidate = base_candidate
        suffix = 1
        while self._table_exists(candidate):
            suffix += 1
            candidate = f"{base_candidate}_{suffix}"
        return candidate

    def _safe_json_loads(self, raw: str) -> Optional[Dict[str, Any]]:
        text_content = raw.strip().replace("```json", "").replace("```", "").strip()
        start = text_content.find("{")
        end = text_content.rfind("}")
        if start >= 0 and end > start:
            text_content = text_content[start : end + 1]
        try:
            value = json.loads(text_content)
            return value if isinstance(value, dict) else None
        except Exception:
            return None

    def _build_default_sample_questions(
        self, table_comment_cn: str, original_columns: List[str]
    ) -> List[str]:
        focus_columns = (
            "、".join(original_columns[:3]) if original_columns else "主要字段"
        )
        return [
            f"{table_comment_cn}一共有多少条数据？",
            f"{table_comment_cn}最近30天的趋势如何？",
            f"按{focus_columns}分组统计，Top 10 是什么？",
            f"{table_comment_cn}里是否有异常值或缺失值？",
        ]

    def _generate_naming_plan(
        self,
        filename: str,
        original_columns: List[str],
        sample_rows: List[Dict[str, Any]],
    ) -> Optional[NamingPlan]:
        if not self.llm or not original_columns:
            return None

        payload = {
            "filename": filename,
            "columns": original_columns,
            "sample_rows": sample_rows,
        }
        prompt = (
            "Generate a strict JSON naming plan for SQL table/columns.\n"
            "JSON schema:\n"
            "{\n"
            '  "table_name_en": "sales_orders",\n'
            '  "table_comment_cn": "销售订单",\n'
            '  "sample_questions": [\n'
            '    "最近30天订单趋势如何？",\n'
            '    "销售额最高的前10个产品是什么？",\n'
            '    "按地区统计订单量分布",\n'
            '    "复购率最高的客户是谁？"\n'
            "  ],\n"
            '  "columns": [\n'
            "    {\n"
            '      "source_name": "原字段",\n'
            '      "column_name_en": "order_id",\n'
            '      "column_comment_cn": "订单编号"\n'
            "    }\n"
            "  ]\n"
            "}\n"
            "Rules:\n"
            "1) table_name_en and column_name_en must match ^[a-zA-Z_][a-zA-Z0-9_]*$.\n"
            "2) Keep semantic meaning.\n"
            "3) sample_questions must contain exactly 4 practical analysis questions in Chinese.\n"
            "4) Return JSON only.\n"
            f"Input: {json.dumps(payload, ensure_ascii=False)}"
        )
        try:
            response = self.llm.invoke(prompt)
            parsed = self._safe_json_loads(
                response.content
                if isinstance(response.content, str)
                else str(response.content)
            )
            if not parsed:
                return None
            if not isinstance(parsed.get("table_name_en"), str):
                return None
            if not isinstance(parsed.get("table_comment_cn"), str):
                return None
            if not isinstance(parsed.get("columns"), list):
                return None
            if "sample_questions" in parsed and not isinstance(
                parsed.get("sample_questions"), list
            ):
                return None
            return cast(NamingPlan, parsed)
        except Exception as e:
            logger.warning(f"LLM naming fallback: {e}")
            return None

    def _infer_column_type(self, values: List[Any]) -> str:
        non_null_values = [v for v in values if v is not None and str(v).strip() != ""]
        if not non_null_values:
            return "string"

        bool_count = sum(
            str(v).lower() in {"true", "false", "0", "1"} or isinstance(v, bool)
            for v in non_null_values
        )
        if bool_count / len(non_null_values) > 0.8:
            return "boolean"

        num_count = 0
        for v in non_null_values:
            try:
                float(str(v))
                num_count += 1
            except Exception:
                continue
        if num_count / len(non_null_values) > 0.8:
            return "number"

        date_count = sum(
            pd.notna(pd.to_datetime(v, errors="coerce")) for v in non_null_values
        )
        if date_count / len(non_null_values) > 0.8:
            return "date"
        return "string"

    def import_uploaded_file(
        self, file_content: bytes, file_type: str, filename: str | None
    ) -> Dict[str, Any]:
        """将上传文件直接写入主数据库并登记 metadata"""
        if self.engine is None:
            return {"success": False, "error": "数据库引擎未初始化"}

        try:
            if file_type == "csv":
                df = pd.read_csv(BytesIO(file_content))
            elif file_type in ["excel", "xlsx", "xls"]:
                df = pd.read_excel(BytesIO(file_content))
            else:
                return {
                    "success": False,
                    "error": f"Unsupported file type: {file_type}",
                }

            if df.empty:
                return {"success": False, "error": "Uploaded file is empty"}

            safe_filename = filename or "uploaded_file"
            safe_filename_stem = os.path.splitext(os.path.basename(safe_filename))[0]
            original_columns = [str(col) for col in df.columns]
            sample_rows = cast(
                List[Dict[str, Any]],
                df.head(3).where(pd.notnull(df), None).to_dict(orient="records"),  # type: ignore
            )

            naming_plan = self._generate_naming_plan(
                safe_filename, original_columns, sample_rows
            )
            logger.info(f"naming_plan {naming_plan}")
            table_name_from_llm = (
                naming_plan.get("table_name_en")
                if isinstance(naming_plan, dict)
                else None
            )
            table_comment_cn = (
                naming_plan.get("table_comment_cn")
                if isinstance(naming_plan, dict)
                else None
            ) or safe_filename_stem
            table_name = self._generate_unique_table_name(
                table_name_from_llm or self._build_filename_table_base(safe_filename)
            )
            sample_questions = []
            if naming_plan and isinstance(naming_plan.get("sample_questions"), list):
                sample_questions = [
                    str(item).strip()
                    for item in naming_plan.get("sample_questions", [])
                    if str(item).strip()
                ][:4]
            if len(sample_questions) < 4:
                default_questions = self._build_default_sample_questions(
                    table_comment_cn, original_columns
                )
                sample_questions = (sample_questions + default_questions)[:4]

            suggestion_by_source: Dict[str, NamingColumnPlan] = {}
            if naming_plan and isinstance(naming_plan.get("columns"), list):
                for item in naming_plan["columns"]:
                    source_name = str(item.get("source_name", ""))
                    column_name_en = str(item.get("column_name_en", ""))
                    column_comment_cn = str(item.get("column_comment_cn", ""))
                    if source_name and column_name_en:
                        suggestion_by_source[source_name] = {
                            "column_name_en": column_name_en,
                            "column_comment_cn": column_comment_cn or source_name,
                            "source_name": source_name,
                        }

            used_columns: Set[str] = set()
            renamed_columns: List[str] = []
            column_comments: Dict[str, str] = {}
            column_original_names: Dict[str, str] = {}
            for idx, source_col in enumerate(original_columns):
                suggestion = suggestion_by_source.get(source_col, {})
                target = self._sanitize_sql_identifier(
                    suggestion.get("column_name_en", source_col),
                    fallback=f"col_{idx + 1}",
                    prefix="col",
                )
                base_target = target
                suffix = 1
                while target in used_columns:
                    suffix += 1
                    target = f"{base_target}_{suffix}"
                used_columns.add(target)
                renamed_columns.append(target)
                column_comments[target] = suggestion.get(
                    "column_comment_cn", source_col
                )
                column_original_names[target] = source_col

            df.columns = renamed_columns
            df.to_sql(table_name, self.engine, if_exists="replace", index=False)
            columns_list = [str(col) for col in df.columns]

            column_info: List[Dict[str, Any]] = []
            for col in columns_list:
                values = df[col].tolist()
                non_null_values = [v for v in values if pd.notna(v)]
                sample_values = [
                    self._convert_scalar_numpy_to_native(v) for v in non_null_values[:5]
                ]
                column_info.append(
                    {
                        "name": col,
                        "type": self._infer_column_type(values),
                        "nullable": len(non_null_values) < len(values),
                        "unique_values": int(pd.Series(values).nunique(dropna=False)),
                        "sample_values": sample_values,
                        "comment_cn": column_comments.get(col),
                        "original_name": column_original_names.get(col),
                    }
                )

            self.metadata[table_name] = {
                "name": table_comment_cn,
                "description": "用户上传的文件（已合并入主数据库）",
                "columns": columns_list,
                "rows": int(len(df)),
                "source": "upload",
                "table_comment_cn": table_comment_cn,
                "column_comments": column_comments,
                "column_original_names": column_original_names,
                "sample_questions": sample_questions,
            }
            self._save_table_metadata(
                table_name=table_name,
                table_comment_cn=table_comment_cn,
                column_comments=column_comments,
                column_original_names=column_original_names,
                sample_questions=sample_questions,
            )

            return {
                "success": True,
                "table_name": table_name,
                "table_comment_cn": table_comment_cn,
                "headers": columns_list,
                "sample_questions": sample_questions,
                "column_comments": column_comments,
                "column_info": column_info,
                "total_columns": len(columns_list),
                "estimated_rows": int(len(df)),
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def delete_table(self, table_name: str) -> Dict[str, Any]:
        """删除数据库中的数据表"""
        if self.engine is None:
            return {"success": False, "error": "数据库引擎未初始化"}

        if table_name not in self.metadata:
            return {"success": False, "error": "表不存在"}

        try:
            with self.engine.begin() as conn:
                conn.execute(text(f'DROP TABLE IF EXISTS "{table_name}"'))

            if table_name in self.data_cache:
                del self.data_cache[table_name]
            if table_name in self.metadata:
                del self.metadata[table_name]
            self._delete_table_metadata(table_name)

            return {"success": True, "message": f"表 {table_name} 已删除"}
        except Exception as e:
            return {"success": False, "error": str(e)}


# 创建全局数据管理器实例
data_manager = DataManager()
