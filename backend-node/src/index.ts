import "dotenv/config";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { DataSource } from "typeorm";
import { DataManager } from "./services/DataManager";
import { SQLAgentManager } from "./services/SQLAgent";
import { setDataManager, setSQLAgent } from "./services/instances";
import { apiRoutes } from "./routes/api";
import path from "path";
import fs from "fs";

/**
 * Create and initialize the TypeORM DataSource
 */
async function createDataSource(): Promise<DataSource> {
    const dbDir = "data";
    const dbPath = path.join(dbDir, "sales_data.db");

    // Ensure data directory exists
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const dataSource = new DataSource({
        type: "better-sqlite3",
        database: dbPath,
        synchronize: false,
        logging: false,
    });

    await dataSource.initialize();
    console.log(`[Init] TypeORM DataSource initialized: ${dbPath}`);

    return dataSource;
}

/**
 * Main application initialization
 */
async function initializeApp() {
    try {
        // Step 1: Create shared TypeORM DataSource
        const dataSource = await createDataSource();

        // Step 2: Initialize DataManager with the shared DataSource
        const dataManager = new DataManager(dataSource);

        // Wait for table creation to complete
        await new Promise((resolve) => setTimeout(resolve, 500));

        const tables = dataManager.getTableList();
        console.log(
            `[Init] DataManager created ${tables.length} tables: ${tables.map((t) => t.name).join(", ")}`,
        );

        // Set global singleton
        setDataManager(dataManager);

        // Step 3: Initialize SQLAgent with the same DataSource
        const sqlAgentManager = new SQLAgentManager(dataSource);
        console.log("[Init] SQLAgent initialized");

        // Set global singleton
        setSQLAgent(sqlAgentManager);

        // Step 4: Initialize DatabaseToolkit (for backward compatibility)
        const { initializeDatabaseToolkit } = await import("./tools/database");
        await initializeDatabaseToolkit(dataManager.getDbPath());
        console.log("[Init] DatabaseToolkit initialized");

        // Step 5: Create and configure Elysia app
        const host = process.env.HOST || "0.0.0.0";
        const port = process.env.PORT || 8001;
        const app = new Elysia({ adapter: node() })
            .use(swagger())
            .use(cors())
            .get("/", () => ({
                message: "SQL Agent API with Database is running (Node.js)",
                architecture: "Unified TypeORM",
                tables_loaded: tables.length,
                langchain_integration: true,
            }))
            .get("/health", () => ({
                status: "healthy",
                environment: "node",
                architecture: "unified-typeorm",
                tables_loaded: tables.length,
                database_path: dataManager.getDbPath(),
            }))
            .use(apiRoutes)
            .listen({
                host,
                port,
            });

        console.log(`🦊 Elysia is running at ${host}:${port}`);
        console.log(`📊 Swagger UI: http://${host}:${port}/swagger`);
        console.log(`✨ Architecture: Unified TypeORM + LangChain SQL Agent`);

        // Handle graceful shutdown
        process.on("SIGINT", async () => {
            console.log("\n[Shutdown] Closing database connections...");
            await dataSource.destroy();
            process.exit(0);
        });
    } catch (error) {
        console.error("[Init] Failed to initialize:", error);
        process.exit(1);
    }
}

// Start the application
initializeApp();
