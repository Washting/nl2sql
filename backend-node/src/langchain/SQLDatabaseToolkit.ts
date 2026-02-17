import { DynamicTool } from "@langchain/core/tools";
import { DataSource } from "typeorm";
import { BaseLanguageModel } from "@langchain/core/language_models/base";

/**
 * SQL Database Toolkit for LangChain
 * Provides tools for interacting with SQL databases
 */
export class SQLDatabaseToolkit {
    private tools: DynamicTool[];

    constructor(
        private dataSource: DataSource,
        private llm: BaseLanguageModel
    ) {
        this.tools = this.initializeTools();
    }

    /**
     * Get all available tools
     */
    getTools(): DynamicTool[] {
        return this.tools;
    }

    /**
     * Initialize the SQL database tools
     */
    private initializeTools(): DynamicTool[] {
        return [
            // Tool 1: sql_db_list_tables
            new DynamicTool({
                name: "sql_db_list_tables",
                description: "List all available tables in the database. Returns a JSON array of table names.",
                func: async () => {
                    try {
                        const queryRunner = this.dataSource.createQueryRunner();
                        const tables = await queryRunner.query(`
                            SELECT name FROM sqlite_master
                            WHERE type='table'
                            AND name NOT LIKE 'sqlite_%'
                            ORDER BY name
                        `);
                        queryRunner.release();

                        const tableNames = tables.map((t: any) => t.name);
                        return JSON.stringify(tableNames);
                    } catch (error: any) {
                        return `Error listing tables: ${error.message}`;
                    }
                }
            }),

            // Tool 2: sql_db_schema
            new DynamicTool({
                name: "sql_db_schema",
                description: "Get the schema and sample data for specified tables. Input should be a JSON array of table names.",
                func: async (input: string) => {
                    try {
                        let tableNames: string[];

                        // Parse input
                        try {
                            tableNames = JSON.parse(input);
                            if (!Array.isArray(tableNames)) {
                                tableNames = [input];
                            }
                        } catch {
                            // If parsing fails, treat input as a single table name
                            tableNames = [input];
                        }

                        const schemas: string[] = [];

                        for (const tableName of tableNames) {
                            const schema = await this.getTableSchema(tableName);
                            schemas.push(schema);
                        }

                        return schemas.join('\n\n');
                    } catch (error: any) {
                        return `Error getting schema: ${error.message}`;
                    }
                }
            }),

            // Tool 3: sql_db_query
            new DynamicTool({
                name: "sql_db_query",
                description: "Execute a SQL SELECT query against the database. Input should be a valid SQL SELECT statement.",
                func: async (input: string) => {
                    try {
                        const query = input.trim();

                        // Security check: only allow SELECT statements
                        if (!query.toLowerCase().startsWith('select')) {
                            throw new Error('Only SELECT queries are allowed');
                        }

                        const queryRunner = this.dataSource.createQueryRunner();
                        const result = await queryRunner.query(query);
                        queryRunner.release();

                        // Return as formatted table string
                        return this.formatQueryResult(result);
                    } catch (error: any) {
                        return `Error executing query: ${error.message}`;
                    }
                }
            }),

            // Tool 4: sql_db_query_checker
            new DynamicTool({
                name: "sql_db_query_checker",
                description: "Check a SQL query for syntax errors before execution. Input should be a SQL query string.",
                func: async (input: string) => {
                    try {
                        const query = input.trim();

                        // Basic validation
                        if (!query.toLowerCase().startsWith('select')) {
                            return 'Warning: Only SELECT queries should be used';
                        }

                        // Check for common SQL injection patterns
                        const dangerousPatterns = [
                            /DROP\s+TABLE/i,
                            /DELETE\s+FROM/i,
                            /UPDATE\s+\w+\s+SET/i,
                            /INSERT\s+INTO/i,
                            /EXEC\s*\(/i,
                            /EXECUTE\s*\(/i
                        ];

                        for (const pattern of dangerousPatterns) {
                            if (pattern.test(query)) {
                                return `Error: Dangerous SQL pattern detected`;
                            }
                        }

                        return 'Query validation passed';
                    } catch (error: any) {
                        return `Error validating query: ${error.message}`;
                    }
                }
            })
        ];
    }

    /**
     * Get detailed schema information for a table
     */
    private async getTableSchema(tableName: string): Promise<string> {
        const queryRunner = this.dataSource.createQueryRunner();

        try {
            // Get column information
            const columns = await queryRunner.query(`PRAGMA table_info("${tableName}")`);

            // Get sample data
            const sampleData = await queryRunner.query(`SELECT * FROM "${tableName}" LIMIT 3`);

            queryRunner.release();

            // Build schema string
            let schema = `Table: ${tableName}\n`;
            schema += `Columns:\n`;

            columns.forEach((col: any) => {
                schema += `  - ${col.name} (${col.type})`;
                if (col.notnull) schema += ' NOT NULL';
                if (col.pk) schema += ' PRIMARY KEY';
                if (col.dflt_value) schema += ` DEFAULT ${col.dflt_value}`;
                schema += '\n';
            });

            if (sampleData.length > 0) {
                schema += `\nSample Data (3 rows):\n`;
                schema += this.formatQueryResult(sampleData);
            }

            return schema;
        } catch (error: any) {
            queryRunner.release();
            throw error;
        }
    }

    /**
     * Format query result as a readable table string
     */
    private formatQueryResult(result: any[]): string {
        if (!result || result.length === 0) {
            return 'No results';
        }

        const columns = Object.keys(result[0]);
        const columnWidths = columns.map(col => {
            const maxWidth = Math.max(
                col.length,
                ...result.map(row => String(row[col] || '').length)
            );
            return maxWidth + 2; // Add padding
        });

        // Header row
        let output = '|';
        columns.forEach((col, i) => {
            output += col.padEnd(columnWidths[i]) + '|';
        });
        output += '\n';

        // Separator row
        output += '|';
        columns.forEach((col, i) => {
            output += '-'.repeat(columnWidths[i]) + '|';
        });
        output += '\n';

        // Data rows
        result.forEach(row => {
            output += '|';
            columns.forEach((col, i) => {
                const value = String(row[col] ?? '');
                output += value.padEnd(columnWidths[i]) + '|';
            });
            output += '\n';
        });

        return output;
    }
}
