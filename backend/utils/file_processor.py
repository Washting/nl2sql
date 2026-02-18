import io
import logging
from typing import Any, Dict, List, Optional, cast

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def convert_numpy_to_native(value: Any) -> Any:
    """将 NumPy 类型转换为 Python 原生类型"""
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


class FileProcessor:
    """处理CSV和Excel文件的读取和表头解析"""

    @staticmethod
    def get_file_headers(file_content: bytes, file_type: str) -> Dict[str, Any]:
        """
        获取文件的表头信息

        Args:
            file_content: 文件内容（字节）
            file_type: 文件类型 ('csv' 或 'excel')

        Returns:
            包含表头信息的字典
        """
        try:
            if file_type == "csv":
                # 只读取前几行获取表头
                df = pd.read_csv(io.BytesIO(file_content), nrows=0)
            elif file_type in ["excel", "xlsx", "xls"]:
                # 读取Excel文件的第一个工作表
                df = pd.read_excel(io.BytesIO(file_content), nrows=0)
            else:
                raise ValueError(f"Unsupported file type: {file_type}")

            # 获取列名和基本信息
            headers = df.columns.tolist()

            # 推断每列的数据类型
            sample_df = (
                pd.read_csv(io.BytesIO(file_content), nrows=100)
                if file_type == "csv"
                else pd.read_excel(io.BytesIO(file_content), nrows=100)
            )

            column_info = []
            for col in headers:
                series = sample_df[str(col)]
                dtype = str(series.dtype)
                sample_values = series.dropna().head(3).tolist()
                # 转换 sample_values 中的 NumPy 类型
                sample_values = [convert_numpy_to_native(v) for v in sample_values]
                column_info.append(
                    {
                        "name": col,
                        "type": dtype,
                        "nullable": bool(series.isnull().any()),
                        "unique_values": int(cast(int, series.nunique())),
                        "sample_values": sample_values,
                    }
                )

            return {
                "success": True,
                "headers": headers,
                "column_info": column_info,
                "total_columns": len(headers),
                "estimated_rows": FileProcessor._estimate_rows(file_content, file_type),
            }

        except Exception as e:
            logger.error(f"Error processing file: {str(e)}")
            return {"success": False, "error": str(e)}

    @staticmethod
    def _estimate_rows(file_content: bytes, file_type: str) -> int:
        """估算文件的行数"""
        try:
            if file_type == "csv":
                # 读取几行来估算平均行大小
                text = file_content.decode("utf-8", errors="ignore")
                lines = text.split("\n")[:10]  # 取前10行
                if lines:
                    avg_line_length = sum(len(line) for line in lines) / len(lines)
                    total_size = len(text)
                    estimated_rows = int(total_size / avg_line_length)
                    return min(estimated_rows, 1000000)  # 限制最大估算值
            elif file_type in ["excel", "xlsx", "xls"]:
                # Excel文件需要使用openpyxl或xlrd
                return 1000  # 保守估计
            return 1000
        except:
            return 1000

    @staticmethod
    def query_data(
        file_content: bytes,
        file_type: str,
        query: str,
        columns: Optional[List[str]] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """
        根据查询条件获取数据

        Args:
            file_content: 文件内容
            file_type: 文件类型
            query: 查询条件（自然语言描述）
            columns: 需要返回的列
            limit: 返回的行数限制

        Returns:
            查询结果
        """
        try:
            # 读取文件
            if file_type == "csv":
                df = pd.read_csv(io.BytesIO(file_content))
            elif file_type in ["excel", "xlsx", "xls"]:
                df = pd.read_excel(io.BytesIO(file_content))
            else:
                raise ValueError(f"Unsupported file type: {file_type}")

            # 如果指定了列，只选择这些列
            if columns:
                available_columns = [col for col in columns if col in df.columns]
                if available_columns:
                    df = df[available_columns]

            # 基础查询解析（这里简化处理，实际项目中可以使用更复杂的NLP）
            query_lower = query.lower()

            # 简单的过滤条件解析
            if "where" in query_lower or "条件" in query_lower:
                # 这里可以集成更复杂的查询解析逻辑
                # 目前只是示例
                pass

            # 应用限制
            result_df = df.head(limit)

            # 转换为字典列表，并处理 NumPy 类型
            data: List[Dict[str, Any]] = [
                {str(col): val for col, val in zip(result_df.columns, row)}
                for row in result_df.itertuples(index=False, name=None)
            ]

            # 递归转换所有 NumPy 类型
            def clean_dict(d: Dict[str, Any]) -> Dict[str, Any]:
                return {k: convert_numpy_to_native(v) for k, v in d.items()}

            data = [clean_dict(row) for row in data]

            return {
                "success": True,
                "data": data,
                "total_rows": len(df),
                "returned_rows": len(data),
                "columns": df.columns.tolist(),
            }

        except Exception as e:
            logger.error(f"Error querying data: {str(e)}")
            return {"success": False, "error": str(e)}

    @staticmethod
    def get_data_summary(file_content: bytes, file_type: str) -> Dict[str, Any]:
        """
        获取数据摘要信息

        Args:
            file_content: 文件内容
            file_type: 文件类型

        Returns:
            数据摘要
        """
        try:
            # 读取文件（限制行数以提高性能）
            if file_type == "csv":
                df = pd.read_csv(io.BytesIO(file_content), nrows=1000)
            elif file_type in ["excel", "xlsx", "xls"]:
                df = pd.read_excel(io.BytesIO(file_content), nrows=1000)
            else:
                raise ValueError(f"Unsupported file type: {file_type}")

            summary = {
                "success": True,
                "columns": df.columns.tolist(),
                "total_columns": len(df.columns),
                "sample_rows": len(df),
                "column_summaries": [],
            }

            # 为每列生成摘要
            for col in [str(c) for c in df.columns]:
                series = df[col]
                col_summary = {
                    "name": col,
                    "dtype": str(series.dtype),
                    "null_count": int(cast(int, series.isnull().sum())),
                    "unique_count": int(cast(int, series.nunique())),
                }
                # 将 null_count 和 unique_count 转换为 Python 原生类型
                col_summary["null_count"] = convert_numpy_to_native(
                    col_summary["null_count"]
                )
                col_summary["unique_count"] = convert_numpy_to_native(
                    col_summary["unique_count"]
                )

                # 数值型列的额外统计
                if series.dtype in ["int64", "float64"]:
                    col_summary.update(
                        {
                            "min": convert_numpy_to_native(series.min())
                            if not series.empty
                            else None,
                            "max": convert_numpy_to_native(series.max())
                            if not series.empty
                            else None,
                            "mean": convert_numpy_to_native(series.mean())
                            if not series.empty
                            else None,
                            "median": convert_numpy_to_native(series.median())
                            if not series.empty
                            else None,
                        }
                    )

                # 字符串型列的额外统计
                elif series.dtype == "object":
                    value_counts = series.value_counts().head(5)
                    # 转换 value_counts 中的 NumPy 类型
                    most_common = {
                        str(k): convert_numpy_to_native(v)
                        for k, v in value_counts.items()
                    }
                    col_summary.update({"most_common": most_common})

                summary["column_summaries"].append(col_summary)

            return summary

        except Exception as e:
            logger.error(f"Error generating summary: {str(e)}")
            return {"success": False, "error": str(e)}
