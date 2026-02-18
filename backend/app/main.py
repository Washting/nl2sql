import asyncio
import json
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from utils.file_processor import FileProcessor

from app.config import settings
from app.models import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    FileUploadResponse,
    QueryRequest,
    QueryResponse,
    VisualizationRequest,
    VisualizationResponse,
)
from app.sql_agent import SQLAgentManager
from app.visualization import DataVisualizer

# 配置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 尝试导入 data_manager
DATA_MANAGER_AVAILABLE = False
data_manager = None
try:
    import sys

    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from app.data_manager import data_manager as dm

    data_manager = dm
    DATA_MANAGER_AVAILABLE = True
    logger.info("Data manager loaded successfully")
except Exception as e:
    logger.warning(f"Data manager not available: {e}")

# 全局存储
chat_sessions: Dict[str, Dict] = {}
sql_agents: Dict[str, SQLAgentManager] = {}


def _resolve_or_create_agent(request: QueryRequest) -> tuple[str, SQLAgentManager]:
    """Resolve target agent by table_name, creating one when needed."""
    agent_key = None

    # 使用 table_name（统一从主数据库查询，包含上传后的表）
    if request.table_name:
        agent_key = f"table_{request.table_name}"

        db_path = None
        if DATA_MANAGER_AVAILABLE and data_manager:
            dm_path = os.path.abspath(data_manager.db_path) if data_manager.db_path else None
            if dm_path and os.path.exists(dm_path):
                db_path = dm_path
                logger.info(f"Using data_manager database at: {db_path}")

        if not db_path:
            raise HTTPException(
                status_code=404,
                detail="Database not found. Please initialize the database first.",
            )

        # 获取或创建SQL Agent
        if agent_key not in sql_agents:
            agent = SQLAgentManager(
                openai_api_key=settings.openai_api_key,
                openai_base_url=settings.openai_base_url,
                model=settings.default_model,
            )

            # 连接到现有数据库
            from langchain_community.utilities import SQLDatabase
            from sqlalchemy import create_engine

            db_uri = f"sqlite:///{db_path}"
            agent.db = SQLDatabase.from_uri(db_uri)
            # 创建 SQLAlchemy 连接用于 execute_sql
            agent.db_connection = create_engine(db_uri)

            # 创建SQL Agent
            agent_result = agent.create_sql_agent()
            if not agent_result["success"]:
                raise HTTPException(status_code=500, detail=agent_result["error"])

            sql_agents[agent_key] = agent
            logger.info(f"Created SQL Agent for table: {request.table_name}")

    else:
        raise HTTPException(
            status_code=400, detail="table_name must be provided"
        )

    return agent_key, sql_agents[agent_key]


def _run_query(request: QueryRequest) -> Dict[str, Any]:
    """Execute query and return payload compatible with QueryResponse."""
    agent_key, agent = _resolve_or_create_agent(request)

    # 执行查询
    logger.info(f"Executing query: {request.query} on {agent_key}")

    result = agent.query_data(request.query)

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["error"])

    # 获取查询结果
    data = result.get("data", [])
    columns = result.get("columns", [])
    sql = result.get("sql")
    answer = result.get("answer", "")
    reasoning = result.get("reasoning", [])

    logger.info(
        f"Query result: data rows={len(data)}, columns={len(columns)}, has_sql={bool(sql)}, has_answer={bool(answer)}"
    )
    if answer:
        logger.info(f"Answer preview: {answer[:200]}...")

    # 如果有 SQL 但没有数据，尝试执行 SQL 获取数据
    if sql and not data:
        try:
            logger.info(f"Executing SQL to get data: {sql[:100]}...")
            sql_result = agent.execute_sql(sql)
            if sql_result["success"]:
                data = sql_result["data"]
                columns = sql_result["columns"]
                logger.info(f"SQL execution successful: {len(data)} rows retrieved")
        except Exception as e:
            logger.warning(f"Could not execute SQL to get data: {e}")
            import traceback

            traceback.print_exc()

    # 确保数据格式正确
    if data and not columns:
        columns = list(data[0].keys()) if data else []

    # 不要在后端再次截断数据，使用 SQL 中的 LIMIT
    final_data = data

    return QueryResponse(
        success=True,
        answer=answer,
        sql=sql,
        reasoning=reasoning,
        data=final_data,
        returned_rows=len(final_data),
        columns=columns,
        total_rows=len(final_data),
    ).model_dump()


def _to_sse(event: str, payload: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 创建必要的目录
    os.makedirs("data/uploads", exist_ok=True)
    os.makedirs("data/visualizations", exist_ok=True)
    logger.info("Application startup complete")
    yield
    # 清理资源
    for agent in sql_agents.values():
        agent.cleanup()
    logger.info("Application shutdown complete")


# 创建FastAPI应用
app = FastAPI(
    title="SQL Agent API",
    description="基于LangChain的SQL数据分析API",
    version="1.0.0",
    lifespan=lifespan,
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 路由定义
@app.get("/", response_class=HTMLResponse)
async def root():
    """根路径，返回简单的API文档"""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>SQL Agent API</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #333; }
            .endpoint { margin: 20px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
            code { background: #e8e8e8; padding: 2px 5px; }
        </style>
    </head>
    <body>
        <h1>SQL Agent API</h1>
        <p>基于LangChain的SQL数据分析服务</p>

        <h2>API端点</h2>

        <div class="endpoint">
            <h3>POST /upload</h3>
            <p>上传CSV或Excel文件</p>
            <code>Content-Type: multipart/form-data</code>
        </div>

        <div class="endpoint">
            <h3>POST /query</h3>
            <p>使用自然语言查询数据</p>
            <code>Content-Type: application/json</code>
        </div>

        <div class="endpoint">
            <h3>POST /visualize</h3>
            <p>创建数据可视化图表</p>
            <code>Content-Type: application/json</code>
        </div>

        <div class="endpoint">
            <h3>POST /chat</h3>
            <p>与数据对话分析</p>
            <code>Content-Type: application/json</code>
        </div>

        <p><a href="/docs">查看完整API文档</a></p>
    </body>
    </html>
    """


@app.get("/datasources")
async def get_data_sources():
    """获取主数据库中的所有数据表（包含上传后合并的表）"""
    sources = []

    # 获取数据库表
    if DATA_MANAGER_AVAILABLE and data_manager:
        try:
            db_tables = data_manager.get_table_list()
            sources.extend(db_tables)
        except Exception as e:
            logger.error(f"Error getting database tables: {e}")

    return {"success": True, "sources": sources}


@app.delete("/tables/{table_name}")
async def delete_table(table_name: str):
    """删除数据库表（仅数据库中的物理表，不包含上传文件缓存）"""
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", table_name):
        raise HTTPException(status_code=400, detail="Invalid table name")

    if not DATA_MANAGER_AVAILABLE or not data_manager:
        raise HTTPException(status_code=500, detail="Data manager is not available")

    table_info = data_manager.get_table_info(table_name)
    if not table_info:
        raise HTTPException(status_code=404, detail="Table not found")

    result = data_manager.delete_table(table_name)
    if not result.get("success"):
        raise HTTPException(
            status_code=500, detail=result.get("error", "Delete table failed")
        )

    agent_key = f"table_{table_name}"
    if agent_key in sql_agents:
        sql_agents[agent_key].cleanup()
        del sql_agents[agent_key]

    return {"success": True, "message": result.get("message", "Table deleted")}


@app.post("/upload", response_model=FileUploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """
    上传并处理CSV或Excel文件
    """
    try:
        # 检查文件类型
        file_type = file.filename.split(".")[-1].lower()
        if file_type not in ["csv", "xlsx", "xls"]:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        # 读取文件内容
        content = await file.read()
        file_type_str = "csv" if file_type == "csv" else "excel"

        if not DATA_MANAGER_AVAILABLE or not data_manager:
            raise HTTPException(status_code=500, detail="Data manager is not available")

        # 先获取列信息（用于前端展示）
        header_result = FileProcessor.get_file_headers(content, file_type_str)
        if not header_result["success"]:
            raise HTTPException(status_code=500, detail=header_result["error"])

        # 直接导入主数据库
        import_result = data_manager.import_uploaded_file(
            content, file_type_str, file.filename
        )
        if not import_result.get("success"):
            raise HTTPException(
                status_code=500, detail=import_result.get("error", "Import failed")
            )

        logger.info(
            f"File uploaded and merged into main DB: {file.filename} -> {import_result.get('table_name')}"
        )

        return FileUploadResponse(
            success=True,
            table_name=import_result.get("table_name"),
            message=f"File '{file.filename}' uploaded successfully",
            headers=header_result["headers"],
            column_info=header_result["column_info"],
            total_columns=header_result["total_columns"],
            estimated_rows=import_result.get(
                "estimated_rows", header_result["estimated_rows"]
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query", response_model=QueryResponse)
async def query_data(request: QueryRequest):
    """
    使用自然语言查询数据（支持文件上传和数据库表）
    """
    try:
        return QueryResponse(**_run_query(request))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying data: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query/stream")
async def query_data_stream(request: QueryRequest):
    """
    流式查询接口：先返回阶段进度，再返回完整查询结果。
    """

    async def event_generator():
        stages = [
            (0.0, "已接收请求，开始准备查询上下文..."),
            (0.8, "正在解析问题并识别字段语义..."),
            (2.0, "正在生成 SQL 并校验可执行性..."),
            (4.0, "正在执行查询与汇总分析..."),
        ]
        next_stage_idx = 0
        start = time.monotonic()
        query_task = asyncio.create_task(asyncio.to_thread(_run_query, request))

        try:
            while not query_task.done():
                elapsed = time.monotonic() - start
                while next_stage_idx < len(stages) and elapsed >= stages[next_stage_idx][0]:
                    yield _to_sse("status", {"message": stages[next_stage_idx][1]})
                    next_stage_idx += 1
                await asyncio.sleep(0.25)

            result = await query_task
            answer = result.get("answer") or ""

            if answer:
                for i in range(0, len(answer), 24):
                    yield _to_sse("answer_delta", {"delta": answer[i : i + 24]})
                    await asyncio.sleep(0.01)

            yield _to_sse("result", result)
            yield _to_sse("done", {"message": "查询完成"})
        except HTTPException as e:
            yield _to_sse(
                "error",
                {"message": str(e.detail) if hasattr(e, "detail") else str(e)},
            )
        except Exception as e:
            logger.error(f"Error streaming query: {e}")
            yield _to_sse("error", {"message": str(e)})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/visualize", response_model=VisualizationResponse)
async def create_visualization(request: VisualizationRequest):
    """
    创建数据可视化图表
    """
    try:
        if not DATA_MANAGER_AVAILABLE or not data_manager:
            raise HTTPException(status_code=500, detail="Data manager is not available")

        table_info = data_manager.get_table_info(request.table_name)
        if not table_info:
            raise HTTPException(status_code=404, detail="Table not found")

        query = f'SELECT * FROM "{request.table_name}" LIMIT {request.limit}'
        df = data_manager.execute_query(query)
        if df is None:
            raise HTTPException(status_code=500, detail="Failed to query table data")
        data_result = {"success": True, "data": df.to_dict("records")}

        # 创建可视化
        viz_result = DataVisualizer.create_chart(
            data_result["data"],
            request.chart_type,
            request.x_column,
            request.y_column,
            request.group_by,
            request.title,
        )

        if not viz_result["success"]:
            raise HTTPException(status_code=500, detail=viz_result["error"])

        return VisualizationResponse(success=True, chart_html=viz_result["chart_html"])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating visualization: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat", response_model=ChatResponse)
async def chat_with_data(request: ChatRequest):
    """
    与数据进行对话分析
    """
    try:
        # 生成或获取会话ID
        session_id = request.session_id or str(uuid.uuid4())

        # 初始化会话
        if session_id not in chat_sessions:
            chat_sessions[session_id] = {"messages": [], "table_name": request.table_name}

        session = chat_sessions[session_id]

        # 添加用户消息
        user_message = ChatMessage(role="user", content=request.message)
        session["messages"].append(user_message)

        table_name = request.table_name or session.get("table_name")
        if not table_name:
            raise HTTPException(status_code=400, detail="table_name is required")

        query_request = QueryRequest(query=request.message, table_name=table_name)
        _, agent = _resolve_or_create_agent(query_request)

        # 执行查询
        result = agent.query_data(request.message)

        if not result["success"]:
            raise HTTPException(status_code=500, detail=result["error"])

        # 添加助手回复
        assistant_message = ChatMessage(role="assistant", content=result["answer"])
        session["messages"].append(assistant_message)

        return ChatResponse(
            success=True,
            message=result["answer"],
            session_id=session_id,
            data=result.get("data"),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in chat: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "files_loaded": 0,
        "active_agents": len(sql_agents),
        "active_sessions": len(chat_sessions),
    }
