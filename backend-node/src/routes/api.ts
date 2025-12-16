import { Elysia, t } from 'elysia';
import { dataManager } from '../services/DataManager';
import { sqlAgentManager } from '../services/SQLAgent';
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
        const file = (body as any).file;
        if (!file) {
            throw new Error("No file uploaded");
        }

        try {
            const metadata = await dataManager.processUpload(file);
            return {
                success: true,
                file_id: metadata.file_id,
                message: `File '${metadata.name}' uploaded successfully`,
                headers: metadata.columns,
                total_columns: metadata.columns.length,
                estimated_rows: metadata.rows
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    })
    .post('/query', async ({ body }) => {
        const { query, file_id, table_name, limit } = body as any;

        // If table_name is provided, use SQL Agent
        if (table_name) {
            // Try SQL Agent first
            const agentResult = await sqlAgentManager.query(query, table_name);
            if (agentResult.success) {
                return {
                    success: true,
                    answer: agentResult.answer,
                    data: agentResult.data, // Might be empty if agent didn't return rows
                    source: "langchain_agent"
                };
            }
        }

        // Fallback to DataManager simple query
        const result = dataManager.queryData(query, table_name, limit);
        return result;
    })
    .post('/chat', async ({ body }) => {
        const { message, session_id } = body as any;
        const sessionId = session_id || uuidv4();

        let response = "";
        const msg = message.toLowerCase();

        if (msg.includes("你好") || msg.includes("hi")) {
            const sources = dataManager.getTableList();
            response = `您好！我是您的数据分析助手。当前可用的数据源有：\n` +
                sources.map(s => `• ${s.name}`).join('\n') +
                `\n\n请问您想了解哪些数据？`;
        } else if (msg.includes("数据源") || msg.includes("数据表")) {
            const sources = dataManager.getTableList();
            response = "当前数据源列表：\n\n" +
                sources.map(s => `📊 ${s.name}\n   • 描述：${s.description}\n   • 行数：${s.rows}\n   • 列数：${s.columns.length}\n   • 来源：${s.source}`).join('\n\n');
        } else if (msg.includes("销售")) {
            // Query sales data
            const result = dataManager.queryData("销售总额", "sales_data"); // sales_data might not exist if not loaded, but logic is here
            if (result.success && result.data && result.data.length > 0) {
                // Calculate total if possible, or just show what we have
                // Simplified logic compared to Python which did specific sum
                response = `根据销售数据分析：\n• 记录数：${result.total_rows}条\n(详细统计需使用具体查询)`;
            } else {
                response = "抱歉，未找到销售数据";
            }
        } else if (msg.includes("产品")) {
            const result = dataManager.queryData("前10个产品", "erp_products");
            if (result.success && result.data) {
                response = `产品列表（前10个）：\n` +
                    result.data.slice(0, 5).map((item: any) => `• ${item.name || 'N/A'} - ¥${item.price || 0}`).join('\n');
            } else {
                response = "抱歉，未找到产品数据";
            }
        } else {
            // General query
            const result = dataManager.queryData(message);
            if (result.success) {
                response = `根据您的问题「${message}」，我为您找到以下信息：\n\n${result.answer}`;
                if (result.data && result.data.length > 0) {
                    response += `\n\n共找到 ${result.total_rows} 条相关记录`;
                }
            } else {
                response = `抱歉，无法处理您的问题：${message}`;
            }
        }

        return {
            success: true,
            message: response,
            session_id: sessionId,
            data: []
        };
    })
    .post('/visualize', async ({ body }) => {
        const { chart_type, table_name, x_column, y_column } = body as any;
        const type = chart_type || 'bar';

        const chartHtml = `
        <div style="padding: 20px;">
            <h3>数据可视化图表 (${type})</h3>
            <div style="margin-top: 20px;">
                <canvas id="chart" width="400" height="300"></canvas>
            </div>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <script>
                // 这里是实际的图表渲染代码
                // 由于是测试版本，仅显示占位符
                const ctx = document.getElementById('chart').getContext('2d');
                ctx.font = '20px Arial';
                ctx.fillStyle = '#ccc';
                ctx.textAlign = 'center';
                ctx.fillText('图表区域 (' + '${type}' + ')', 200, 150);
            </script>
            <p style="margin-top: 10px; color: #666;">
                表名: ${table_name || '未指定'} |
                X轴: ${x_column || '自动'} |
                Y轴: ${y_column || '自动'}
            </p>
        </div>
        `;

        return {
            success: true,
            chart_html: chartHtml
        };
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
    .get('/tables/:tableName', ({ params: { tableName } }) => {
        const info = dataManager.getTableInfo(tableName);
        if (info) {
            // Get sample data
            const result = dataManager.queryData("SELECT * FROM " + tableName + " LIMIT 5", tableName, 5);
            return {
                success: true,
                info: info,
                sample_data: result.data || []
            };
        }
        return { success: false, error: "Table not found" };
    });
