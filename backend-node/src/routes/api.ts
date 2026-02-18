import { Elysia, t } from 'elysia';
import { dataManager, sqlAgentManager } from '../services/instances';
import { DataVisualizer } from '../services/DataVisualizer';
import { v4 as uuidv4 } from 'uuid';

export const apiRoutes = new Elysia({ prefix: '' })
    .get('/datasources', () => {
        const sources = dataManager.getTableList();
        return {
            success: true,
            sources: sources
        };
    })

    .post('/upload', async ({ body }) => {
        const file = body.file;

        try {
            const result = await dataManager.processUpload(file);
            return {
                success: true,
                file_id: result.metadata.file_id,
                table_name: result.metadata.table,
                table_comment_cn: result.metadata.table_comment_cn,
                message: `File '${result.metadata.name}' uploaded successfully`,
                headers: result.metadata.columns,
                column_info: result.columnInfo || [],
                column_comments: result.metadata.column_comments || {},
                total_columns: result.metadata.columns.length,
                estimated_rows: result.metadata.rows
            };
        } catch (e: any) {
            return {
                success: false,
                error: e.message
            };
        }
    }, {
        body: t.Object({
            file: t.File({
                type: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
                maxSize: '10m'
            })
        })
    })

    .post('/query', async ({ body }) => {
        const { query, table_name, limit } = body;
        const startTime = Date.now();

        try {
            // Use SQL Agent for intelligent query processing
            if (table_name) {
                const agentResult = await sqlAgentManager.query(query, table_name);
                return {
                    success: agentResult.success,
                    answer: agentResult.answer,
                    sql: agentResult.sql,
                    reasoning: agentResult.reasoning,
                    data: agentResult.data,
                    returned_rows: agentResult.returned_rows,
                    columns: agentResult.columns,
                    total_rows: agentResult.total_rows,
                    source: agentResult.source || "langchain_agent",
                    executionTime: agentResult.executionTime,
                    error: agentResult.error
                };
            }

            // Fallback to DataManager for queries without table
            const result = await dataManager.queryData(query, undefined, limit);
            const executionTime = Date.now() - startTime;

            return {
                ...result,
                executionTime,
                source: "data_manager_fallback"
            };
        } catch (e: any) {
            const executionTime = Date.now() - startTime;
            return {
                success: false,
                error: e.message,
                answer: `Error: ${e.message}`,
                data: [],
                returned_rows: 0,
                columns: [],
                total_rows: 0,
                executionTime
            };
        }
    }, {
        body: t.Object({
            query: t.String({ minLength: 1 }),
            table_name: t.Optional(t.String({
                pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$'
            })),
            file_id: t.Optional(t.String({ format: 'uuid' })),
            limit: t.Optional(t.Integer({ minimum: 1, maximum: 1000 }))
        })
    })

    .post('/chat', async ({ body }) => {
        const { message, session_id, table_name } = body;
        const sessionId = session_id || uuidv4();

        try {
            // Try to use SQL Agent for intelligent responses
            if (table_name) {
                const agentResult = await sqlAgentManager.query(message, table_name);

                return {
                    success: true,
                    message: agentResult.answer || message,
                    session_id: sessionId,
                    data: agentResult.data,
                    visualization: null,
                    error: agentResult.error
                };
            }

            // Fallback to simple responses for greetings and general info
            const msg = message.toLowerCase();
            let response = "";

            if (msg.includes("你好") || msg.includes("hi") || msg.includes("hello")) {
                const sources = dataManager.getTableList();
                response = `您好！我是您的数据分析助手。当前可用的数据源有：\n` +
                    sources.map(s => `• ${s.name} (${s.rows}行)`).join('\n') +
                    `\n\n请指定表名进行查询，例如："查询erp_products表的所有数据"`;
            } else if (msg.includes("数据源") || msg.includes("数据表") || msg.includes("tables")) {
                const sources = dataManager.getTableList();
                response = "当前数据源列表：\n\n" +
                    sources.map(s =>
                        `📊 ${s.name}\n` +
                        `   表名：${s.table}\n` +
                        `   描述：${s.description}\n` +
                        `   行数：${s.rows}\n` +
                        `   列数：${s.columns.length}\n` +
                        `   来源：${s.source}`
                    ).join('\n\n');
            } else {
                response = "请指定要查询的数据表。例如：\"查询erp_products表\" 或 \"显示erp_orders的前10条记录\"。";
            }

            return {
                success: true,
                message: response,
                session_id: sessionId,
                data: [],
                visualization: null
            };
        } catch (e: any) {
            return {
                success: false,
                message: `抱歉，处理您的问题时出错：${e.message}`,
                session_id: sessionId,
                data: [],
                error: e.message
            };
        }
    }, {
        body: t.Object({
            message: t.String({ minLength: 1 }),
            table_name: t.Optional(t.String()),
            session_id: t.Optional(t.String({ format: 'uuid' }))
        })
    })

    .post('/visualize', async ({ body }) => {
        const { chart_type, table_name, x_column, y_column, title, limit } = body;

        try {
            // Get data from table
            const result = await dataManager.queryData(
                `SELECT * FROM ${table_name}`,
                table_name,
                limit || 1000
            );

            if (!result.success || !result.data || result.data.length === 0) {
                return {
                    success: false,
                    error: "No data available for visualization"
                };
            }

            // Create visualization using DataVisualizer
            const vizResult = DataVisualizer.createChart(
                result.data,
                chart_type || 'bar',
                x_column,
                y_column,
                title
            );

            return vizResult;
        } catch (e: any) {
            return {
                success: false,
                error: e.message
            };
        }
    }, {
        body: t.Object({
            chart_type: t.Optional(t.Union([
                t.Literal('bar'),
                t.Literal('line'),
                t.Literal('pie'),
                t.Literal('scatter'),
                t.Literal('histogram')
            ])),
            table_name: t.String({ minLength: 1 }),
            x_column: t.Optional(t.String()),
            y_column: t.Optional(t.String()),
            title: t.Optional(t.String({ maxLength: 200 })),
            limit: t.Optional(t.Integer({ minimum: 1, maximum: 1000 }))
        })
    })

    .get('/files', () => {
        const files = dataManager.getTableList().filter(t => t.source === 'upload');
        return {
            files: files.map(f => ({
                file_id: f.file_id,
                filename: f.name,
                total_columns: f.columns.length,
                estimated_rows: f.rows
            }))
        };
    })

    .get('/tables/:tableName', async ({ params: { tableName } }) => {
        const info = dataManager.getTableInfo(tableName);
        if (info) {
            // Get sample data
            const result = await dataManager.queryData(`SELECT * FROM ${tableName}`, tableName, 5);
            return {
                success: true,
                info: info,
                sample_data: result.data || [],
                columns: info.columns,
                row_count: info.rows
            };
        }
        return {
            success: false,
            error: "Table not found"
        };
    }, {
        params: t.Object({
            tableName: t.String({
                pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$'
            })
        })
    })
