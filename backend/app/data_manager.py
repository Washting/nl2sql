#!/usr/bin/env python3
"""
数据管理器 - 使用pandas管理CSV数据
"""

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine


class DataManager:
    """数据管理器类"""

    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.data_cache: Dict[str, pd.DataFrame] = {}
        self.metadata: Dict[str, Dict] = {}
        self.db_path = os.path.join(self.data_dir, "sales_data.db")
        self.engine = None

        # 初始化时扫描数据库所有表
        self._scan_database_tables()

    def _scan_database_tables(self):
        """扫描数据库中的所有表并初始化 metadata"""
        if not os.path.exists(self.db_path):
            print(f"数据库文件不存在: {self.db_path}")
            return

        try:
            # 创建 SQLAlchemy 引擎
            db_url = f"sqlite:///{self.db_path}"
            self.engine = create_engine(db_url)

            # 使用 Inspector 获取表信息
            inspector = inspect(self.engine)
            table_names = inspector.get_table_names()

            # 设置表的中文名称和描述
            table_display_names = {
                "sales_data": "电子产品销售数据",
                "erp_products": "ERP产品表",
                "erp_orders": "ERP订单表",
                "erp_customers": "ERP客户表",
                "monthly_sales": "月度销售汇总",
            }

            table_descriptions = {
                "sales_data": "真实的电子产品销售记录",
                "erp_products": "企业资源计划产品目录",
                "erp_orders": "客户订单信息",
                "erp_customers": "客户基本信息",
                "monthly_sales": "按月汇总的销售数据",
            }

            # 为每个表创建 metadata
            with self.engine.connect() as conn:
                for table_name in table_names:
                    # 获取列信息
                    columns_info = inspector.get_columns(table_name)
                    columns = [col["name"] for col in columns_info]

                    # 获取行数
                    result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                    row_count = result.scalar()

                    display_name = table_display_names.get(table_name, table_name)
                    description = table_descriptions.get(
                        table_name, f"{table_name} 数据表"
                    )

                    self.metadata[table_name] = {
                        "name": display_name,
                        "description": description,
                        "columns": columns,
                        "rows": row_count,
                        "source": "db",
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
        def convert_value(value):
            if value is None or (isinstance(value, float) and np.isnan(value)):
                return None
            elif isinstance(value, (np.integer, np.int64, np.int32)):
                return int(value)
            elif isinstance(value, (np.floating, np.float64, np.float32)):
                return float(value)
            elif isinstance(value, (np.bool_, np.bool)):
                return bool(value)
            elif isinstance(value, np.datetime64):
                return str(value)
            elif isinstance(value, np.ndarray):
                return value.tolist()
            return value

        # 使用 map (pandas >= 2.1.0)
        return df.map(convert_value)

    def get_table_list(self) -> List[Dict[str, Any]]:
        """获取所有数据表列表"""
        table_list = []
        for table_name, metadata in self.metadata.items():
            table_list.append(
                {
                    "name": metadata["name"],
                    "table": table_name,
                    "rows": metadata["rows"],
                    "columns": metadata["columns"],
                    "description": metadata["description"],
                    "source": metadata["source"],
                }
            )
        return table_list

    def get_table_info(self, table_name: str) -> Optional[Dict[str, Any]]:
        """获取表详细信息"""
        if table_name in self.metadata:
            return self.metadata[table_name]
        return None

    def _build_upload_table_name(self, filename: str) -> str:
        """根据文件名生成安全且唯一的表名"""
        base = os.path.splitext(os.path.basename(filename))[0].lower()
        cleaned = re.sub(r"[^a-zA-Z0-9_]+", "_", base).strip("_")
        if not cleaned:
            cleaned = "upload"
        if cleaned[0].isdigit():
            cleaned = f"t_{cleaned}"
        return f"upload_{cleaned}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

    def import_uploaded_file(
        self, file_content: bytes, file_type: str, filename: str
    ) -> Dict[str, Any]:
        """将上传文件直接写入主数据库并登记 metadata"""
        if self.engine is None:
            return {"success": False, "error": "数据库引擎未初始化"}

        try:
            if file_type == "csv":
                df = pd.read_csv(pd.io.common.BytesIO(file_content))
            elif file_type in ["excel", "xlsx", "xls"]:
                df = pd.read_excel(pd.io.common.BytesIO(file_content))
            else:
                return {"success": False, "error": f"Unsupported file type: {file_type}"}

            table_name = self._build_upload_table_name(filename)
            df.columns = [
                re.sub(r"[^a-zA-Z0-9_]+", "_", str(col)).strip("_") or f"col_{idx}"
                for idx, col in enumerate(df.columns)
            ]
            df.to_sql(table_name, self.engine, if_exists="replace", index=False)

            self.metadata[table_name] = {
                "name": filename,
                "description": "用户上传的文件（已合并入主数据库）",
                "columns": df.columns.tolist(),
                "rows": int(len(df)),
                "source": "upload",
            }

            return {
                "success": True,
                "table_name": table_name,
                "headers": df.columns.tolist(),
                "total_columns": len(df.columns),
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

            return {"success": True, "message": f"表 {table_name} 已删除"}
        except Exception as e:
            return {"success": False, "error": str(e)}


# 创建全局数据管理器实例
data_manager = DataManager()
