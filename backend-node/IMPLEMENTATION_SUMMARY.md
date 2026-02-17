# Node.js Backend Implementation Summary

## Project Overview

The NL2SQL-Data-Analyst Node.js backend is a unified data analysis platform that converts natural language queries to SQL using LangChain integration. It provides a REST API for data querying, visualization, and intelligent chat interfaces.

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Elysia HTTP Server                       │
│                       (Port 8001)                            │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  API Routes   │   │   DataManager  │   │  SQLAgent     │
│  (validators) │   │  (TypeORM)     │   │  (LangChain)  │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ TypeORM       │
                    │ DataSource    │
                    │ (SQLite)      │
                    └───────────────┘
```

### Technology Stack

- **Framework**: Elysia.js v1.4.19
- **Database**: SQLite with better-sqlite3
- **ORM**: TypeORM v0.3.20
- **AI/ML**: LangChain with OpenAI
- **Validation**: Zod v3.24.1
- **File Processing**: Papa Parse (CSV), SheetJS (Excel)
- **Documentation**: Swagger/OpenAPI

## Key Features

### 1. Unified TypeORM Architecture
- Single DataSource shared across all services
- Dynamic table creation with raw SQL
- Support for uploaded files and mock data
- Automatic metadata tracking

### 2. LangChain SQL Agent
- Natural language to SQL conversion
- Multi-step query processing:
  1. List available tables
  2. Get table schema
  3. Generate SQL with LLM
  4. Validate SQL query
  5. Execute query
  6. Generate natural language answer

### 3. Comprehensive Input Validation
- Zod schemas for all API endpoints
- SQL injection prevention
- File type and size validation
- Query parameter validation
- Table name format validation

### 4. Dynamic Entity System
- Runtime entity creation for uploaded files
- Automatic column type inference
- Flexible schema handling

## API Endpoints

### Query Endpoints
- `POST /query` - Execute natural language queries
- `POST /chat` - Interactive chat interface

### Data Management
- `GET /datasources` - List all available tables
- `GET /tables/:tableName` - Get table details and sample data
- `POST /upload` - Upload CSV/Excel files
- `GET /files` - List uploaded files

### Visualization
- `POST /visualize` - Generate charts (bar, line, pie, scatter, histogram)

### System
- `GET /` - API information
- `GET /health` - Health check
- `GET /swagger` - API documentation

## Implementation Details

### File Structure

```
backend-node/src/
├── entities/
│   ├── BaseEntity.ts          # Base entity with common fields
│   └── EntityFactory.ts       # Dynamic entity creation
├── langchain/
│   ├── SQLDatabaseToolkit.ts  # SQL tools for LangChain
│   └── agent.ts               # Agent factory
├── routes/
│   └── api.ts                 # API routes with validation
├── services/
│   ├── DataManager.ts         # Data management service
│   ├── SQLAgent.ts            # SQL Agent manager
│   ├── DataVisualizer.ts      # Chart generation
│   └── instances.ts           # Singleton instances
├── tools/
│   └── database.ts            # Database toolkit
├── types/
│   └── validators.ts          # Zod validation schemas
└── index.ts                   # Application entry point
```

### Validation Schemas

#### Query Request
```typescript
{
  query: string (required, min 1 char)
  table_name: string (optional)
  file_id: string (optional, must be UUID)
  limit: number (optional, 1-1000)
}
```

#### Chat Request
```typescript
{
  message: string (required, min 1 char)
  table_name: string (optional)
  session_id: string (optional, must be UUID)
}
```

#### Visualization Request
```typescript
{
  chart_type: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' (optional)
  table_name: string (required)
  x_column: string (optional)
  y_column: string (optional)
  title: string (optional, max 200 chars)
  limit: number (optional, 1-1000)
}
```

#### File Upload
```typescript
{
  file: File (required)
    - type: 'text/csv' | 'application/vnd.ms-excel' | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    - size: <= 10MB
}
```

#### Table Name
```typescript
- Must match: /^[a-zA-Z_][a-zA-Z0-9_]*$/
- Prevents SQL injection
```

### LangChain Integration

The SQL Agent uses a 4-tool toolkit:

1. **sql_db_list_tables** - Lists all available tables
2. **sql_db_schema** - Returns schema for specified tables
3. **sql_db_query** - Executes SQL queries
4. **sql_db_query_checker** - Validates SQL before execution

Query execution flow:
```
User Question
    ↓
List Tables
    ↓
Get Schema
    ↓
Generate SQL (LLM)
    ↓
Validate SQL
    ↓
Execute Query
    ↓
Generate Answer (LLM)
    ↓
Return Result
```

## Installation & Setup

### Prerequisites
- Node.js >= 18
- pnpm >= 8
- OpenAI API key

### Installation

```bash
cd backend-node
pnpm install
```

### Environment Variables

Create a `.env` file:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
DEFAULT_MODEL=gpt-4

# Server Configuration (optional)
PORT=8001
NODE_ENV=development
```

### Running the Server

```bash
# Development mode
pnpm run dev

# Production mode
pnpm run build
pnpm start
```

The server will start on `http://localhost:8001`

## Testing

### Automated Tests

Run the test script:

```bash
./test_api.sh
```

### Manual Testing

Use the Swagger UI at `http://localhost:8001/swagger`

Or use curl:

```bash
# Health check
curl http://localhost:8001/health

# List data sources
curl http://localhost:8001/datasources

# Query data
curl -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "查询所有产品",
    "table_name": "erp_products"
  }'
```

## Security Features

### Input Validation
- All API endpoints validate input using Zod schemas
- SQL injection prevention through table name validation
- File type and size restrictions
- Query result limits (max 1000 rows)

### Error Handling
- Graceful error responses with clear messages
- No sensitive data in error messages
- Proper HTTP status codes

### Data Protection
- No SQL injection vulnerabilities
- File upload restrictions
- Query parameter sanitization

## Performance Considerations

### Optimization
- Single TypeORM DataSource (connection pooling)
- Batch insert operations
- Query result caching (when applicable)
- Efficient schema discovery

### Limits
- Max query results: 1000 rows
- Max file upload: 10MB
- Request timeout: 120 seconds

## Troubleshooting

### Server Won't Start

**Issue**: `Error: WebStandard does not support listen`

**Solution**: Ensure `@elysiajs/node` is installed and configured correctly in `index.ts`:
```typescript
import { node } from '@elysiajs/node';

const app = new Elysia({ adapter: node() })
```

### Database Issues

**Issue**: `TypeError: Cannot read properties of undefined`

**Solution**: Ensure TypeORM is properly initialized:
```bash
pnpm install better-sqlite3 @types/better-sqlite3
```

### LangChain Errors

**Issue**: `OPENAI_API_KEY is not set`

**Solution**: Set the environment variable in `.env`:
```env
OPENAI_API_KEY=sk-...
```

### Validation Errors

**Issue**: Request validation fails unexpectedly

**Solution**: Check the validation schema in `src/types/validators.ts` and ensure all required fields are present.

## Future Enhancements

### Planned Features
1. Multi-table JOIN support
2. Query history and caching
3. Export results to CSV/Excel
4. Real-time streaming responses
5. User authentication and authorization
6. Query performance monitoring
7. Custom visualization options
8. Scheduled queries

### Technical Improvements
1. Add Redis caching layer
2. Implement query queue system
3. Add rate limiting
4. Implement WebSocket support
5. Add database backup/restore
6. Multi-database support (PostgreSQL, MySQL)

## Contributing

### Code Style
- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Write validation tests for new endpoints

### Testing
- Add tests for new features in `test_api.sh`
- Ensure all validation tests pass
- Test edge cases and error conditions

## License

This project is part of the NL2SQL-Data-Analyst system.

## Support

For issues and questions, please refer to the main project repository.

---

**Last Updated**: 2025-12-29
**Version**: 1.0.0
**Status**: Production Ready
