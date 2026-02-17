# Node.js Backend API Test Plan

## Overview
This document outlines comprehensive tests for the NL2SQL-Data-Analyst Node.js backend API.

## Test Prerequisites
- Server running on http://localhost:8001
- SQLite database initialized with ERP data
- OpenAI API configured for LangChain agent

## Test Endpoints

### 1. Health Check
**Endpoint**: `GET /health`

**Expected Response**:
```json
{
  "status": "healthy",
  "environment": "node",
  "architecture": "unified-typeorm",
  "tables_loaded": 3,
  "database_path": "data/sales_data.db"
}
```

**Test Command**:
```bash
curl http://localhost:8001/health
```

---

### 2. List Data Sources
**Endpoint**: `GET /datasources`

**Expected Response**:
```json
{
  "success": true,
  "sources": [
    {
      "name": "ERP产品表",
      "table": "erp_products",
      "rows": 10,
      "columns": ["product_id", "name", "category", "price", "stock", "supplier"],
      "description": "企业资源规划系统中的产品数据",
      "source": "mock"
    },
    {
      "name": "ERP客户表",
      "table": "erp_customers",
      "rows": 5,
      "columns": ["customer_id", "name", "email", "city", "level", "total_orders"],
      "description": "企业资源规划系统中的客户数据",
      "source": "mock"
    },
    {
      "name": "ERP订单表",
      "table": "erp_orders",
      "rows": 200,
      "columns": ["order_id", "product_id", "product_name", "customer_name", "quantity", "unit_price", "total_amount", "order_date", "status", "category"],
      "description": "企业资源规划系统中的订单数据",
      "source": "mock"
    }
  ]
}
```

**Test Command**:
```bash
curl http://localhost:8001/datasources
```

---

### 3. Get Table Details
**Endpoint**: `GET /tables/:tableName`

**Test Case 3.1**: Valid table name
```bash
curl http://localhost:8001/tables/erp_products
```

**Expected Response**:
```json
{
  "success": true,
  "info": {
    "name": "ERP产品表",
    "table": "erp_products",
    "rows": 10,
    "columns": ["product_id", "name", "category", "price", "stock", "supplier"],
    "description": "企业资源规划系统中的产品数据",
    "source": "mock"
  },
  "sample_data": [
    { "product_id": 1, "name": "iPhone 15 Pro", "category": "手机", "price": 8999, "stock": 500, "supplier": "Apple" }
  ],
  "columns": ["product_id", "name", "category", "price", "stock", "supplier"],
  "row_count": 10
}
```

**Test Case 3.2**: Invalid table name (SQL injection attempt)
```bash
curl http://localhost:8001/tables/erp_products"; DROP TABLE erp_products; --
```

**Expected Response**:
```json
{
  "success": false,
  "error": "Invalid table name: Table name must be a valid SQL identifier"
}
```

---

### 4. Query with Natural Language
**Endpoint**: `POST /query`

**Test Case 4.1**: Valid query with table name
```bash
curl -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "查询所有价格超过5000元的产品",
    "table_name": "erp_products"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "answer": "根据查询结果，共有7个产品价格超过5000元...",
  "sql": "SELECT * FROM erp_products WHERE price > 5000",
  "reasoning": "用户想查询价格超过5000元的产品，我需要使用WHERE子句筛选价格列",
  "data": [
    { "product_id": 1, "name": "iPhone 15 Pro", "category": "手机", "price": 8999, "stock": 500, "supplier": "Apple" }
  ],
  "returned_rows": 7,
  "columns": ["product_id", "name", "category", "price", "stock", "supplier"],
  "total_rows": 10,
  "source": "langchain_agent",
  "executionTime": 1500
}
```

**Test Case 4.2**: Query with limit
```bash
curl -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "显示前5个订单",
    "table_name": "erp_orders",
    "limit": 5
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "answer": "为您查询到前5个订单记录",
  "sql": "SELECT * FROM erp_orders LIMIT 5",
  "data": [...],
  "returned_rows": 5
}
```

**Test Case 4.3**: Missing query parameter (validation test)
```bash
curl -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d '{
    "table_name": "erp_products"
  }'
```

**Expected Response**:
```json
{
  "success": false,
  "error": "Validation error: Query cannot be empty",
  "data": [],
  "returned_rows": 0,
  "columns": [],
  "total_rows": 0,
  "executionTime": 0
}
```

**Test Case 4.4**: Invalid limit value (validation test)
```bash
curl -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "查询所有产品",
    "table_name": "erp_products",
    "limit": 2000
  }'
```

**Expected Response**:
```json
{
  "success": false,
  "error": "Validation error: Number must be less than or equal to 1000"
}
```

---

### 5. Chat Interface
**Endpoint**: `POST /chat`

**Test Case 5.1**: Greeting message
```bash
curl -X POST http://localhost:8001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "您好！我是您的数据分析助手。当前可用的数据源有：\n• ERP产品表 (10行)\n• ERP客户表 (5行)\n• ERP订单表 (200行)\n\n请指定表名进行查询，例如：\"查询erp_products表的所有数据\"",
  "session_id": "uuid-here",
  "data": [],
  "visualization": null
}
```

**Test Case 5.2**: Query with table name
```bash
curl -X POST http://localhost:8001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "显示VIP客户的数量",
    "table_name": "erp_customers"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "根据查询结果，VIP客户共有3位",
  "session_id": "uuid-here",
  "data": [...],
  "visualization": null
}
```

**Test Case 5.3**: Empty message (validation test)
```bash
curl -X POST http://localhost:8001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": ""
  }'
```

**Expected Response**:
```json
{
  "success": false,
  "message": "Validation error: Message cannot be empty",
  "session_id": "uuid-here",
  "data": [],
  "error": "Invalid request format"
}
```

---

### 6. Data Visualization
**Endpoint**: `POST /visualize`

**Test Case 6.1**: Create bar chart
```bash
curl -X POST http://localhost:8001/visualize \
  -H "Content-Type: application/json" \
  -d '{
    "chart_type": "bar",
    "table_name": "erp_products",
    "x_column": "name",
    "y_column": "price",
    "title": "产品价格对比",
    "limit": 10
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "chart": "base64-encoded-chart-image",
  "chart_type": "bar",
  "data_points": 10
}
```

**Test Case 6.2**: Invalid chart type (validation test)
```bash
curl -X POST http://localhost:8001/visualize \
  -H "Content-Type: application/json" \
  -d '{
    "chart_type": "invalid_type",
    "table_name": "erp_products",
    "x_column": "name",
    "y_column": "price"
  }'
```

**Expected Response**:
```json
{
  "success": false,
  "error": "Validation error: Invalid enum value. Expected 'bar' | 'line' | 'pie' | 'scatter' | 'histogram', received 'invalid_type'"
}
```

**Test Case 6.3**: Missing required table_name (validation test)
```bash
curl -X POST http://localhost:8001/visualize \
  -H "Content-Type: application/json" \
  -d '{
    "chart_type": "bar",
    "x_column": "name",
    "y_column": "price"
  }'
```

**Expected Response**:
```json
{
  "success": false,
  "error": "Validation error: Table name is required"
}
```

---

### 7. File Upload
**Endpoint**: `POST /upload`

**Test Case 7.1**: Valid CSV file upload
```bash
curl -X POST http://localhost:8001/upload \
  -F "file=@test_data.csv"
```

**Expected Response**:
```json
{
  "success": true,
  "file_id": "uuid-here",
  "message": "File 'test_data.csv' uploaded successfully",
  "headers": ["col1", "col2", "col3"],
  "column_info": [
    {
      "name": "col1",
      "type": "string",
      "nullable": false,
      "unique": 100,
      "sample_values": ["value1", "value2"]
    }
  ],
  "total_columns": 3,
  "estimated_rows": 100
}
```

**Test Case 7.2**: Invalid file type (validation test)
```bash
curl -X POST http://localhost:8001/upload \
  -F "file=@test.txt"
```

**Expected Response**:
```json
{
  "success": false,
  "error": "File must be CSV or Excel format"
}
```

**Test Case 7.3**: File size exceeds limit (validation test)
```bash
# Create a file > 10MB
dd if=/dev/zero of=large.csv bs=1M count=11
curl -X POST http://localhost:8001/upload \
  -F "file=@large.csv"
```

**Expected Response**:
```json
{
  "success": false,
  "error": "File size must be less than 10MB"
}
```

---

### 8. List Uploaded Files
**Endpoint**: `GET /files`

**Expected Response**:
```json
{
  "files": [
    {
      "file_id": "uuid-1",
      "filename": "sales_data.csv",
      "total_columns": 5,
      "estimated_rows": 1000
    }
  ]
}
```

**Test Command**:
```bash
curl http://localhost:8001/files
```

---

## Test Scenarios

### Scenario 1: Complete NL2SQL Workflow
1. Upload a CSV file
2. Query the uploaded data using natural language
3. Visualize the results
4. Continue conversation with follow-up questions

### Scenario 2: Data Analysis Workflow
1. List available data sources
2. Query specific tables
3. Filter and sort data
4. Generate visualizations

### Scenario 3: Error Handling
1. Test SQL injection attempts
2. Test invalid table names
3. Test malformed queries
4. Test missing parameters

---

## Validation Tests Summary

### Input Validation Coverage
✅ Query request validation (query, table_name, file_id, limit)
✅ Chat request validation (message, session_id, table_name)
✅ Visualization request validation (chart_type, table_name, x_column, y_column, title, limit)
✅ File upload validation (file type, size)
✅ Table name validation (SQL identifier format)

### Security Tests
✅ SQL injection prevention
✅ File type restrictions
✅ File size limits
✅ Query result limits (max 1000 rows)

---

## Performance Tests

### Query Performance
- Simple SELECT: < 100ms
- Complex JOIN: < 500ms
- Natural language processing: < 3000ms

### Upload Performance
- Small file (< 1MB): < 1s
- Medium file (1-5MB): < 3s
- Large file (5-10MB): < 10s

---

## Manual Testing Checklist

- [ ] Server starts successfully on port 8001
- [ ] Health endpoint returns correct status
- [ ] Swagger UI accessible at /swagger
- [ ] All 3 ERP tables loaded correctly
- [ ] Natural language queries work
- [ ] SQL generation is accurate
- [ ] Validation rejects invalid inputs
- [ ] File upload processes correctly
- [ ] Visualization generates charts
- [ ] Chat interface maintains context
- [ ] Error messages are clear and helpful
- [ ] No memory leaks during extended use
- [ ] Graceful shutdown works

---

## Automation Script Example

```bash
#!/bin/bash

BASE_URL="http://localhost:8001"

echo "Testing Health Endpoint..."
curl -s $BASE_URL/health | jq .

echo "\nTesting Data Sources..."
curl -s $BASE_URL/datasources | jq .

echo "\nTesting Query..."
curl -s -X POST $BASE_URL/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "查询所有产品",
    "table_name": "erp_products"
  }' | jq .

echo "\nTesting Chat..."
curl -s -X POST $BASE_URL/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好",
    "table_name": "erp_products"
  }' | jq .

echo "\nTests completed!"
```

---

## Notes
- All datetime fields should be in ISO 8601 format
- All UUIDs should be valid v4 UUIDs
- All numeric values should be within expected ranges
- Error messages should be clear and actionable
- Response times should be logged for performance monitoring
