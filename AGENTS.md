# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NL2SQL-Data-Analyst is a full-stack web application that converts natural language queries to SQL using LangChain integration. It provides a REST API for data querying, visualization, and intelligent chat interfaces.

**Architecture:**
- Frontend: React + Vite + TypeScript with Radix UI components
- Backend Node.js: Elysia.js + TypeORM + LangChain (primary backend)
- Backend Python: FastAPI + LangChain (legacy, being phased out)
- Database: SQLite with better-sqlite3
- AI: OpenAI GPT models via LangChain

The system uses a **unified TypeORM architecture** where a single DataSource is shared across all services (DataManager, SQLAgent, DatabaseToolkit).

## Development Commands

### Frontend (React + Vite)
Located in `frontend/`:

```bash
cd frontend
pnpm install          # Install dependencies
pnpm run dev          # Start dev server (http://localhost:5173)
pnpm run build        # Build for production
pnpm run lint         # Run ESLint
```

### Backend Node.js (Primary)
Located in `backend-node/`:

```bash
cd backend-node
pnpm install          # Install dependencies
pnpm run dev          # Start dev server (http://localhost:8001)
./test_api.sh         # Run API tests (requires server running)
```

The backend uses tsx for TypeScript execution during development.

### Backend Python (Legacy)
Located in `backend/`:

```bash
cd backend
pip install -r requirements.txt    # Install dependencies
python run.py                      # Start server (http://localhost:8000)
```

## Environment Configuration

### Backend Node.js (.env in `backend-node/`)
```env
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
DEFAULT_MODEL=gpt-4
PORT=8001
HOST=0.0.0.0
```

### Frontend (.env in `frontend/`)
```env
VITE_API_BASE_URL=/api    # Proxy path to backend
```

### Backend Python (.env in `backend/`)
```env
OPENAI_API_KEY=sk-...
HOST=0.0.0.0
PORT=8000
DEBUG=true
```

## Architecture

### Backend Node.js Structure

```
backend-node/src/
├── entities/           # TypeORM entities with dynamic creation
├── langchain/          # LangChain SQL agent implementation
│   ├── SQLDatabaseToolkit.ts  # SQL tools for agent
│   └── agent.ts               # Agent factory with query workflow
├── routes/             # API routes with Elysia validators
│   └── api.ts          # Main API endpoints
├── services/           # Core business logic
│   ├── DataManager.ts         # Table operations, uploads, queries
│   ├── SQLAgent.ts            # Agent manager wrapper
│   ├── DataVisualizer.ts      # Chart generation
│   └── instances.ts           # Singleton instances
├── tools/              # Legacy database toolkit
├── types/              # Zod validation schemas
└── index.ts            # Application entry point
```

### Key Services

1. **DataManager** (`services/DataManager.ts`):
   - Manages TypeORM DataSource and table operations
   - Handles file uploads (CSV/Excel) with dynamic table creation
   - Provides raw SQL query execution
   - Mock ERP data initialization (products, customers, orders)

2. **SQLAgentManager** (`services/SQLAgent.ts`):
   - Wraps LangChain SQL Agent
   - Manages ChatOpenAI LLM instance
   - Routes queries through agent workflow

3. **SQL Agent Workflow** (`langchain/agent.ts`):
   - Uses 4-tool toolkit: list_tables, get_schema, query, query_checker
   - Multi-step execution: list tables → get schema → generate SQL → validate → execute → generate answer
   - Chinese language prompts for natural interaction

### Frontend Structure

```
frontend/src/
├── components/         # React components
│   ├── ui/            # Radix UI primitives (shadcn/ui)
│   ├── DataSourcePanel.tsx
│   ├── QueryPanel.tsx
│   └── ResultsPanel.tsx
├── services/
│   └── api.ts         # Axios API client
├── App.tsx            # Main application
└── main.tsx           # Entry point
```

## API Endpoints

### Query Endpoints
- `POST /query` - Execute natural language queries (requires `query`, optional `table_name`, `limit`)
- `POST /chat` - Interactive chat interface (requires `message`, optional `table_name`, `session_id`)

### Data Management
- `GET /datasources` - List all available tables
- `GET /tables/:tableName` - Get table details and sample data
- `POST /upload` - Upload CSV/Excel files (multipart/form-data)
- `GET /files` - List uploaded files

### Visualization
- `POST /visualize` - Generate charts (bar, line, pie, scatter, histogram)

### System
- `GET /` - API information
- `GET /health` - Health check
- `GET /swagger` - Swagger UI documentation

## Important Patterns

### Table Name Validation
All table names are validated with regex `^[a-zA-Z_][a-zA-Z0-9_]*$` to prevent SQL injection. This is enforced at the route level using Elysia's type validation.

### Input Validation
All API endpoints use Zod schemas via Elysia's `t.Object()` for validation:
- Query parameters: `minLength: 1`, pattern matching for table names
- File uploads: type restrictions, 10MB max size
- Numeric limits: 1-1000 for query limits

### Singleton Pattern
Services use singleton instances exported from `services/instances.ts`:
```typescript
import { dataManager, sqlAgentManager } from './services/instances';
```

### Error Handling
All endpoints return consistent error responses:
```typescript
{
  success: false,
  error: "Error message",
  data: [],
  returned_rows: 0
}
```

## Testing

Run the automated test suite after starting the backend:

```bash
cd backend-node
pnpm run dev          # In one terminal
./test_api.sh         # In another terminal
```

The test script (`test_api.sh`) validates:
- All major API endpoints
- Input validation (SQL injection attempts, invalid limits, missing params)
- File upload restrictions
- Health checks

## Common Tasks

### Adding a New Mock Table
Edit `backend-node/src/services/DataManager.ts`, add to `initializeMockData()`:
```typescript
await this.createTableFromData('table_name', [
  { col1: 'val1', col2: 123 },
  // ...
], {
  name: 'Display Name',
  description: 'Table description',
  source: 'mock'
});
```

### Modifying SQL Agent Prompts
Edit `backend-node/src/langchain/agent.ts` in `getDefaultSystemPrompt()` function.

### Adding a New Visualization Type
1. Add type to Zod union in `routes/api.ts` (`/visualize` endpoint)
2. Implement in `services/DataVisualizer.ts`
3. Add frontend option in `QueryPanel.tsx`

### Adding Frontend Components
Use existing Radix UI components from `components/ui/`. Follow the shadcn/ui patterns already established.
