import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { dataManager } from "./DataManager";

export class SQLAgentManager {
    private llm: ChatOpenAI;
    private agent?: ReturnType<typeof createAgent>;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        const baseURL = process.env.OPENAI_BASE_URL;
        const modelName = process.env.DEFAULT_MODEL || "MiniMax-M2";

        if (!apiKey) {
            console.warn("OPENAI_API_KEY is not set");
        }

        this.llm = new ChatOpenAI({
            openAIApiKey: apiKey,
            configuration: {
                baseURL: baseURL,
            },
            modelName: modelName,
            temperature: 0,
        });
    }

    getAgent(tableName?: string) {

        if (this.agent) {
            return this.agent
        }

        // Define tools
        const tools = [
            new DynamicStructuredTool({
                name: "list_tables",
                description: "List all available tables in the database with their descriptions.",
                schema: z.object({}),
                func: async () => {
                    const tables = dataManager.getTableList();
                    return JSON.stringify(tables.map(t => ({ name: t.table, description: t.description })));
                },
            }),
            new DynamicStructuredTool({
                name: "get_table_info",
                description: "Get the schema and column information for a specific table.",
                schema: z.object({
                    table_name: z.string().describe("The name of the table to get information for"),
                }),
                func: async ({ table_name }) => {
                    const info = dataManager.getTableInfo(table_name);
                    if (!info) return "Table not found";
                    return JSON.stringify({
                        table: info.table,
                        columns: info.columns,
                        description: info.description
                    });
                },
            }),
            new DynamicStructuredTool({
                name: "execute_sql",
                description: "Execute a SQL query against the database. Use this to retrieve data.",
                schema: z.object({
                    query: z.string().describe("The SQL query to execute"),
                }),
                func: async ({ query }) => {
                    try {
                        // Use DataManager's db directly
                        const db = dataManager.getDb();
                        const result = db.prepare(query).all();
                        return JSON.stringify(result);
                    } catch (error: any) {
                        return `Error executing SQL: ${error.message}`;
                    }
                },
            }),
        ];

        const prompt = ChatPromptTemplate.fromMessages([
            ["system", "You are a helpful AI assistant expert in querying SQL databases. \n" +
                "You have access to a SQLite database with the following tables. \n" +
                "Always check the table schema before querying. \n" +
                "Return the final answer based on the data retrieved. \n" +
                "If the user asks for a specific table, focus on that table."],
            ["human", "{input}"],
            ["placeholder", "{agent_scratchpad}"],
        ]);

        const agent = createAgent({
            model: this.llm,
            tools,
            systemPrompt: "You are a helpful AI assistant expert in querying SQL databases. \n" +
                "You have access to a SQLite database with the following tables. \n" +
                "Always check the table schema before querying. \n" +
                "Return the final answer based on the data retrieved. \n" +
                "If the user asks for a specific table, focus on that table.",
        });

        this.agent = agent;
        return agent;
    }

    async query(query: string, tableName?: string) {
        try {
            const executor = this.getAgent(tableName);

            console.log(`[SQLAgent] Executing query: ${query} (Table: ${tableName || 'ALL'})`);

            const result = await executor.invoke({ input: query });

            return {
                success: true,
                answer: result.output,
                data: [], // We could try to capture the data from tool outputs if we want
            };
        } catch (error: any) {
            console.error("SQL Agent Error:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export const sqlAgentManager = new SQLAgentManager();
