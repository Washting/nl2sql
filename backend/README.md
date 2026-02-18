# SQL Agent Backend (Python / Legacy)

该目录是 FastAPI + LangChain 的旧版后端（`http://localhost:8000`），目前仍可独立运行，用于兼容和对照测试。

## 快速启动

```bash
cd backend
pip install -r requirements.txt
python run.py
```

或：

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 目录说明

```
backend/
├── app/
│   ├── main.py          # FastAPI 入口与路由
│   ├── data_manager.py  # SQLite 表管理、导入、查询
│   ├── sql_agent.py     # LangChain SQL Agent
│   ├── visualization.py # 图表生成
│   ├── models.py        # 请求/响应模型
│   └── config.py        # 环境配置
├── utils/
│   ├── file_processor.py # 上传文件表头/摘要解析（被 app.main 使用）
│   └── __init__.py       # Python 包标识
├── data/                 # SQLite 与样例数据
├── requirements.txt
└── run.py
```

## 关键接口

- `GET /health`：健康检查
- `GET /datasources`：列出数据表
- `POST /upload`：上传 CSV/Excel 并导入数据库
- `POST /query`：自然语言查询
- `POST /query/stream`：流式查询
- `POST /chat`：对话式分析
- `POST /visualize`：图表生成

## 环境变量（`.env`）

```env
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
DEFAULT_MODEL=gpt-4
HOST=0.0.0.0
PORT=8000
DEBUG=true
```

## 说明

- `utils/file_processor.py` 目前仍在使用，`app/main.py` 的 `/upload` 会调用它做表头与字段信息提取。
- 本目录中的 `__pycache__` 可安全删除，不影响运行。
