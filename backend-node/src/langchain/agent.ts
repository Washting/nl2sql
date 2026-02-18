import { ChatOpenAI } from "@langchain/openai";
import { DataSource } from "typeorm";
import { SQLDatabaseToolkit } from "./SQLDatabaseToolkit";

/**
 * Default system prompt for SQL Agent
 */
export function getDefaultSystemPrompt(): string {
    return `你是一个专业的数据分析师，专门帮助用户查询和分析 SQLite 数据库。

你有以下工具可以使用：
- sql_db_list_tables: 列出数据库中的所有表
- sql_db_schema: 查看特定表的结构和示例数据
- sql_db_query: 执行 SQL 查询并返回结果
- sql_db_query_checker: 在执行前检查 SQL 查询的正确性

**执行步骤：**
1. **重要**: 使用 sql_db_list_tables 查看数据库中实际的表名（绝对不要猜测表名）
2. 使用 sql_db_schema 查看表的结构和列名
3. 仔细理解用户问题，提取关键信息：
   - 如果用户要求"前N条"、"显示N条"、"N个"，SQL 必须使用 LIMIT N
   - 如果用户没有指定数量，默认使用 LIMIT 10
   - 如果用户要求"所有"、"全部"，可以不加 LIMIT 或使用较大值
4. 根据步骤1和2查到的实际表名和列名，生成准确的 SQL 查询
5. 使用 sql_db_query_checker 检查 SQL 正确性
6. 使用 sql_db_query 执行查询

**重要约束：**
- 只使用 SELECT 语句，禁止 INSERT/UPDATE/DELETE
- **必须先调用 sql_db_list_tables 查看实际表名**
- **使用查询到的真实表名编写SQL**
- 必须根据用户指定的数量生成 LIMIT 子句
- 如果出错，分析错误并重新生成 SQL

**输出格式：**
查询完成后，用中文简洁地总结查询结果，突出关键数据。`;
}

/**
 * Create a SQL Agent with LangChain
 * This creates an agent that can query databases using natural language
 */
export async function createSQLAgent(
    dataSource: DataSource,
    llm: ChatOpenAI,
    systemPrompt?: string
): Promise<{
    query: (question: string) => Promise<any>;
}> {
    // Create SQL toolkit
    const toolkit = new SQLDatabaseToolkit(dataSource, llm);
    const tools = toolkit.getTools();

    // Use the provided prompt or default
    const prompt = systemPrompt || getDefaultSystemPrompt();

    // Return a simple query interface
    // Note: LangChain's AgentExecutor is complex to set up in TypeScript
    // We'll implement a simpler version that uses LLM directly with tools
    return {
        query: async (question: string) => {
            const startTime = Date.now();

            try {
                console.log(`[SQLAgent] Question: ${question}`);

                // Step 1: List tables
                const tablesResult = await tools[0].func("");
                const tables = JSON.parse(tablesResult);
                console.log(`[SQLAgent] Found tables: ${tables.join(', ')}`);

                // Step 2: Get schema for all tables
                const schemaResult = await tools[1].func(JSON.stringify(tables));
                console.log('[SQLAgent] Retrieved schema');

                // Step 3: Generate SQL using LLM
                const sqlPrompt = `${prompt}

## 可用表
${tables.join(', ')}

## 表结构
${schemaResult}

## 用户问题
${question}

请生成合适的SQL查询来回答用户的问题。只返回SQL语句，不要其他内容。`;

                const sqlResponse = await llm.invoke([
                    ["system", "你是SQL专家，根据用户问题生成SQL查询"],
                    ["human", sqlPrompt]
                ]);

                let sqlQuery = (sqlResponse.content as string).trim();

                // Clean up SQL (remove markdown code blocks, prefixes, etc.)
                sqlQuery = sqlQuery.replace(/```sql\n?/g, '').replace(/```\n?/g, '');
                sqlQuery = sqlQuery.replace(/^SQL:\s*/i, '');
                sqlQuery = sqlQuery.split(';')[0].trim();

                console.log(`[SQLAgent] Generated SQL: ${sqlQuery}`);

                // Step 4: Validate SQL
                const validation = await tools[3].func(sqlQuery);
                console.log(`[SQLAgent] Validation: ${validation}`);

                // Step 5: Execute SQL
                const queryResult = await tools[2].func(sqlQuery);
                console.log(`[SQLAgent] Query executed`);

                // Step 6: Generate natural language answer
                const answerPrompt = `你是数据分析师。用户问题：${question}

执行的SQL：${sqlQuery}

查询结果：
${queryResult}

请用中文简洁回答用户问题，突出关键数据。`;

                const answerResponse = await llm.invoke([
                    ["system", "你是友好的数据分析师"],
                    ["human", answerPrompt]
                ]);

                const answer = answerResponse.content as string;
                const executionTime = Date.now() - startTime;

                // Parse query result to extract data
                const data = parseQueryResult(queryResult);
                console.log(`[SQLAgent] Parsed data: ${data.length} rows`);
                console.log(`[SQLAgent] Data sample:`, data.slice(0, 2));

                return {
                    success: true,
                    answer: answer,
                    sql: sqlQuery,
                    reasoning: [
                        '列出数据库中的表',
                        '获取表结构',
                        '生成SQL查询',
                        '验证SQL',
                        '执行查询',
                        '生成分析结果'
                    ],
                    data: data,
                    returned_rows: data.length,
                    columns: data.length > 0 ? Object.keys(data[0]) : [],
                    total_rows: data.length,
                    source: "langchain_agent",
                    executionTime
                };

            } catch (error: any) {
                console.error('[SQLAgent] Error:', error);
                const executionTime = Date.now() - startTime;

                return {
                    success: false,
                    error: error.message,
                    answer: `抱歉，处理您的问题时出错：${error.message}`,
                    data: [],
                    returned_rows: 0,
                    columns: [],
                    total_rows: 0,
                    executionTime
                };
            }
        }
    };
}

/**
 * Parse query result from formatted table string to JSON array
 */
function parseQueryResult(resultString: string): any[] {
    if (!resultString || resultString === 'No results') {
        return [];
    }

    try {
        // Try to parse as JSON first
        return JSON.parse(resultString);
    } catch {
        // Parse the formatted table string
        const lines = resultString.split('\n').filter(line => line.trim());
        if (lines.length < 3) {
            return [];
        }

        // Extract column names from header row
        // Split by | and filter out empty strings (from leading/trailing |)
        const headerLine = lines[0];
        const columns = headerLine.split('|')
            .map(col => col.trim())
            .filter(col => col.length > 0);

        // Skip separator line (lines[1])
        // Parse data rows
        const data: any[] = [];
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i];

            // Skip empty lines or separator lines
            if (!line.trim() || line.match(/^\|[\s-|]+\|?$/)) {
                continue;
            }

            // Split by | and filter, but keep empty string values
            const rawValues = line.split('|');
            // Remove first and last elements if they're empty (from leading/trailing |)
            const values = rawValues.slice(1, -1).map(val => val.trim());

            if (values.length === columns.length) {
                const row: any = {};
                columns.forEach((col, idx) => {
                    // Try to convert to number if possible
                    const val = values[idx];
                    if (val === '' || val === null || val === undefined) {
                        row[col] = null;
                    } else if (!isNaN(Number(val))) {
                        row[col] = Number(val);
                    } else {
                        row[col] = val;
                    }
                });
                data.push(row);
            }
        }

        return data;
    }
}
