import { ChatOpenAI } from "@langchain/openai";
import { DataSource } from "typeorm";
import { createSQLAgent } from "../langchain/agent";

export class SQLAgentManager {
    private llm: ChatOpenAI;
    private dataSource: DataSource;
    private agent?: {
        query: (question: string) => Promise<any>;
    };

    constructor(dataSource: DataSource) {
        this.dataSource = dataSource;

        const apiKey = process.env.OPENAI_API_KEY;
        const baseURL = process.env.OPENAI_BASE_URL;
        const modelName = process.env.DEFAULT_MODEL || "gpt-4";

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

        console.log(`[SQLAgent] Initialized with model: ${modelName}`);
    }

    /**
     * Query the database using natural language
     */
    async query(question: string, tableName?: string) {
        try {
            // Get or create agent
            if (!this.agent) {
                this.agent = await createSQLAgent(
                    this.dataSource,
                    this.llm,
                    undefined // Use default system prompt
                );
                console.log('[SQLAgent] Agent created successfully');
            }

            // Execute query
            const result = await this.agent.query(question);

            return result;

        } catch (error: any) {
            console.error('[SQLAgent] Query error:', error);

            return {
                success: false,
                error: error.message,
                answer: `抱歉，处理您的问题时出错：${error.message}`,
                data: [],
                returned_rows: 0,
                columns: [],
                total_rows: 0,
                executionTime: 0
            };
        }
    }

    /**
     * Get the data source being used
     */
    getDataSource(): DataSource {
        return this.dataSource;
    }
}

// Export a function to create the manager (for dependency injection)
export function createSQLAgentManager(dataSource: DataSource): SQLAgentManager {
    return new SQLAgentManager(dataSource);
}

