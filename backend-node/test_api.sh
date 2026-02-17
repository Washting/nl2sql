#!/bin/bash

# API Test Script for NL2SQL-Data-Analyst
# This script tests all major API endpoints

set -e

BASE_URL="http://localhost:8001"
FAILED_TESTS=0
PASSED_TESTS=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test helper functions
test_endpoint() {
    local test_name="$1"
    local endpoint="$2"
    local method="$3"
    local data="$4"

    echo -e "\n${YELLOW}Testing: $test_name${NC}"
    echo "Endpoint: $method $endpoint"

    if [ -z "$data" ]; then
        response=$(curl -s -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json")
    else
        response=$(curl -s -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi

    echo "Response:"
    echo "$response" | jq . 2>/dev/null || echo "$response"

    # Check if response contains success
    if echo "$response" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED_TESTS++))
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((FAILED_TESTS++))
    fi
}

# Print header
echo "========================================"
echo "  NL2SQL API Test Suite"
echo "========================================"
echo "Base URL: $BASE_URL"
echo ""

# Check if server is running
echo -e "${YELLOW}Checking if server is running...${NC}"
if ! curl -s -f "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}Error: Server is not running on $BASE_URL${NC}"
    echo "Please start the server first: pnpm run dev"
    exit 1
fi
echo -e "${GREEN}Server is running${NC}"

# Test 1: Health Check
test_endpoint "Health Check" "/health" "GET"

# Test 2: List Data Sources
test_endpoint "List Data Sources" "/datasources" "GET"

# Test 3: Get Table Details (Valid)
test_endpoint "Get Table Details (Valid)" "/tables/erp_products" "GET"

# Test 4: Get Table Details (Invalid - should fail validation)
echo -e "\n${YELLOW}Testing: Get Table Details (Invalid table name)${NC}"
echo "Endpoint: GET /tables/invalid_table; DROP TABLE--"
response=$(curl -s -X GET "$BASE_URL/tables/invalid_table; DROP TABLE--" \
    -H "Content-Type: application/json")
echo "Response:"
echo "$response" | jq . 2>/dev/null || echo "$response"
if echo "$response" | grep -q '"success":false'; then
    echo -e "${GREEN}✓ PASSED (Correctly rejected invalid table name)${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${RED}✗ FAILED (Should have rejected invalid table name)${NC}"
    ((FAILED_TESTS++))
fi

# Test 5: Query with Natural Language (Valid)
test_endpoint "Query NL - List all products" "/query" "POST" \
    '{
        "query": "查询所有产品",
        "table_name": "erp_products"
    }'

# Test 6: Query with Natural Language (with limit)
test_endpoint "Query NL - Top 5 orders" "/query" "POST" \
    '{
        "query": "显示前5个订单",
        "table_name": "erp_orders",
        "limit": 5
    }'

# Test 7: Query - Missing query parameter (validation test)
echo -e "\n${YELLOW}Testing: Query with missing query parameter (should fail)${NC}"
echo "Endpoint: POST /query"
response=$(curl -s -X POST "$BASE_URL/query" \
    -H "Content-Type: application/json" \
    -d '{"table_name": "erp_products"}')
echo "Response:"
echo "$response" | jq . 2>/dev/null || echo "$response"
if echo "$response" | grep -q '"success":false'; then
    echo -e "${GREEN}✓ PASSED (Correctly rejected missing query)${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${RED}✗ FAILED (Should have rejected missing query)${NC}"
    ((FAILED_TESTS++))
fi

# Test 8: Query - Invalid limit value (validation test)
echo -e "\n${YELLOW}Testing: Query with invalid limit (should fail)${NC}"
echo "Endpoint: POST /query"
response=$(curl -s -X POST "$BASE_URL/query" \
    -H "Content-Type: application/json" \
    -d '{
        "query": "查询所有产品",
        "table_name": "erp_products",
        "limit": 2000
    }')
echo "Response:"
echo "$response" | jq . 2>/dev/null || echo "$response"
if echo "$response" | grep -q '"success":false'; then
    echo -e "${GREEN}✓ PASSED (Correctly rejected invalid limit)${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${RED}✗ FAILED (Should have rejected invalid limit)${NC}"
    ((FAILED_TESTS++))
fi

# Test 9: Chat - Greeting message
test_endpoint "Chat - Greeting" "/chat" "POST" \
    '{
        "message": "你好"
    }'

# Test 10: Chat - Query with table name
test_endpoint "Chat - Query VIP customers" "/chat" "POST" \
    '{
        "message": "显示VIP客户",
        "table_name": "erp_customers"
    }'

# Test 11: Chat - Empty message (validation test)
echo -e "\n${YELLOW}Testing: Chat with empty message (should fail)${NC}"
echo "Endpoint: POST /chat"
response=$(curl -s -X POST "$BASE_URL/chat" \
    -H "Content-Type: application/json" \
    -d '{"message": ""}')
echo "Response:"
echo "$response" | jq . 2>/dev/null || echo "$response"
if echo "$response" | grep -q '"success":false'; then
    echo -e "${GREEN}✓ PASSED (Correctly rejected empty message)${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${RED}✗ FAILED (Should have rejected empty message)${NC}"
    ((FAILED_TESTS++))
fi

# Test 12: Visualization - Create bar chart
test_endpoint "Visualization - Bar chart" "/visualize" "POST" \
    '{
        "chart_type": "bar",
        "table_name": "erp_products",
        "x_column": "name",
        "y_column": "price",
        "title": "产品价格对比",
        "limit": 10
    }'

# Test 13: Visualization - Invalid chart type (validation test)
echo -e "\n${YELLOW}Testing: Visualization with invalid chart type (should fail)${NC}"
echo "Endpoint: POST /visualize"
response=$(curl -s -X POST "$BASE_URL/visualize" \
    -H "Content-Type: application/json" \
    -d '{
        "chart_type": "invalid_type",
        "table_name": "erp_products",
        "x_column": "name",
        "y_column": "price"
    }')
echo "Response:"
echo "$response" | jq . 2>/dev/null || echo "$response"
if echo "$response" | grep -q '"success":false'; then
    echo -e "${GREEN}✓ PASSED (Correctly rejected invalid chart type)${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${RED}✗ FAILED (Should have rejected invalid chart type)${NC}"
    ((FAILED_TESTS++))
fi

# Test 14: Visualization - Missing table_name (validation test)
echo -e "\n${YELLOW}Testing: Visualization without table_name (should fail)${NC}"
echo "Endpoint: POST /visualize"
response=$(curl -s -X POST "$BASE_URL/visualize" \
    -H "Content-Type: application/json" \
    -d '{
        "chart_type": "bar",
        "x_column": "name",
        "y_column": "price"
    }')
echo "Response:"
echo "$response" | jq . 2>/dev/null || echo "$response"
if echo "$response" | grep -q '"success":false'; then
    echo -e "${GREEN}✓ PASSED (Correctly rejected missing table_name)${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${RED}✗ FAILED (Should have rejected missing table_name)${NC}"
    ((FAILED_TESTS++))
fi

# Test 15: List Uploaded Files
test_endpoint "List Uploaded Files" "/files" "GET"

# Print summary
echo ""
echo "========================================"
echo "  Test Summary"
echo "========================================"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo "Total:  $((PASSED_TESTS + FAILED_TESTS))"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
