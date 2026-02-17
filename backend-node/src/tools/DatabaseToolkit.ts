import { DataSource, EntitySchema, ObjectType, Repository } from 'typeorm';

/**
 * DatabaseToolkit - A TypeScript implementation of SQLDatabase functionality
 * Provides database connection, table inspection, and query execution capabilities
 * Using TypeORM for database-agnostic support
 */
export class DatabaseToolkit {
    private dataSource: DataSource;
    private schema: string | null;
    private allTables: Set<string>;
    private includeTables: Set<string>;
    private ignoreTables: Set<string>;
    private usableTables: Set<string>;
    private sampleRowsInTableInfo: number;
    private indexesInTableInfo: boolean;
    private customTableInfo: Record<string, string> | null;
    private viewSupport: boolean;
    private maxStringLength: number;
    private lazyTableReflection: boolean;

    constructor(
        dataSource: DataSource,
        schema: string | null = null,
        options: {
            includeTables?: string[];
            ignoreTables?: string[];
            sampleRowsInTableInfo?: number;
            indexesInTableInfo?: boolean;
            customTableInfo?: Record<string, string>;
            viewSupport?: boolean;
            maxStringLength?: number;
            lazyTableReflection?: boolean;
        } = {}
    ) {
        this.dataSource = dataSource;
        this.schema = schema;
        
        // Validate includeTables and ignoreTables are not both specified
        if (options.includeTables && options.ignoreTables) {
            throw new Error("Cannot specify both includeTables and ignoreTables");
        }

        this.sampleRowsInTableInfo = options.sampleRowsInTableInfo || 3;
        this.indexesInTableInfo = options.indexesInTableInfo || false;
        this.customTableInfo = options.customTableInfo || null;
        this.viewSupport = options.viewSupport || false;
        this.maxStringLength = options.maxStringLength || 300;
        this.lazyTableReflection = options.lazyTableReflection || false;

        // Initialize table sets
        this.allTables = this._getAllTableNames();
        this.includeTables = new Set(options.includeTables || []);
        this.ignoreTables = new Set(options.ignoreTables || []);
        this.usableTables = this.getUsableTableNames();
        
        // Validate included tables exist
        if (this.includeTables.size > 0) {
            const missingTables = Array.from(this.includeTables).filter(
                table => !this.allTables.has(table)
            );
            if (missingTables.length > 0) {
                throw new Error(`includeTables ${missingTables.join(', ')} not found in database`);
            }
        }
        
        // Validate ignored tables exist
        if (this.ignoreTables.size > 0) {
            const missingTables = Array.from(this.ignoreTables).filter(
                table => !this.allTables.has(table)
            );
            if (missingTables.length > 0) {
                throw new Error(`ignoreTables ${missingTables.join(', ')} not found in database`);
            }
        }
    }

    /**
     * Create a DatabaseToolkit instance from a database URI
     * @param databaseUri The database connection URI
     * @param engineArgs Additional engine arguments
     * @param options DatabaseToolkit options
     */
    static async fromUri(
        databaseUri: string,
        engineArgs: any = {},
        options: any = {}
    ): Promise<DatabaseToolkit> {
        // Create TypeORM DataSource
        const dataSource = new DataSource({
            type: this._parseDatabaseType(databaseUri),
            url: databaseUri,
            ...engineArgs,
            synchronize: false,
            logging: false,
        });
        
        await dataSource.initialize();
        return new DatabaseToolkit(dataSource, null, options);
    }

    /**
     * Parse database type from URI
     * @param uri Database connection URI
     */
    private static _parseDatabaseType(uri: string): any {
        if (uri.startsWith('sqlite://')) return 'better-sqlite3';
        if (uri.startsWith('postgres://') || uri.startsWith('postgresql://')) return 'postgres';
        if (uri.startsWith('mysql://')) return 'mysql';
        if (uri.startsWith('mssql://')) return 'mssql';
        if (uri.startsWith('oracle://')) return 'oracle';
        
        // Default to sqlite for file paths
        return 'better-sqlite3';
    }

    /**
     * Get the database dialect name
     */
    get dialect(): string {
        return this.dataSource.options.type;
    }

    /**
     * Get all table names from the database
     */
    private _getAllTableNames(): Set<string> {
        const tables = new Set<string>();

        // Use raw SQL to query sqlite_master for actual table names
        // This works for tables created by DataManager, not just TypeORM entities
        try {
            const queryRunner = this.dataSource.createQueryRunner();
            const result = queryRunner.query(`
                SELECT name FROM sqlite_master
                WHERE type='table'
                AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            `);

            // Ensure result is an array
            if (Array.isArray(result)) {
                result.forEach((row: any) => {
                    if (row && row.name) {
                        tables.add(row.name);
                    }
                });
            }

            queryRunner.release();
        } catch (error) {
            console.error('Error getting table names from sqlite_master:', error);

            // Fallback to TypeORM entity metadata
            const entityMetadatas = this.dataSource.entityMetadatas;
            entityMetadatas.forEach(metadata => {
                tables.add(metadata.tableName);
            });
        }

        return tables;
    }

    /**
     * Get names of tables available for use
     */
    getUsableTableNames(): Set<string> {
        if (this.includeTables.size > 0) {
            return new Set(this.includeTables);
        }
        
        if (this.ignoreTables.size > 0) {
            return new Set(Array.from(this.allTables).filter(
                table => !this.ignoreTables.has(table)
            ));
        }
        
        return new Set(this.allTables);
    }

    /**
     * Get table information for specified tables
     * @param tableNames Optional list of table names to get info for
     * @param getColComments Whether to include column comments
     */
    getTableInfo(
        tableNames: string[] | null = null,
        getColComments: boolean = false
    ): string {
        const allTableNames = Array.from(this.getUsableTableNames());
        
        if (tableNames) {
            const missingTables = tableNames.filter(
                table => !allTableNames.includes(table)
            );
            if (missingTables.length > 0) {
                throw new Error(`table_names ${missingTables.join(', ')} not found in database`);
            }
        }
        
        const tablesToProcess = tableNames || allTableNames;
        let tableInfos: string[] = [];
        
        for (const tableName of tablesToProcess) {
            if (this.customTableInfo && this.customTableInfo[tableName]) {
                tableInfos.push(this.customTableInfo[tableName]);
                continue;
            }
            
            // Get table schema information
            let tableInfo = this._getTableSchema(tableName);
            
            // Add column comments if requested
            if (getColComments) {
                try {
                    const columnComments = this._getColumnComments(tableName);
                    if (columnComments) {
                        tableInfo += `\n\n/*\nColumn Comments: ${JSON.stringify(columnComments)}\n*/`;
                    }
                } catch (error) {
                    throw new Error("Column comments are available on PostgreSQL, MySQL, Oracle");
                }
            }
            
            // Add extra information if requested
            const hasExtraInfo = this.indexesInTableInfo || this.sampleRowsInTableInfo > 0;
            if (hasExtraInfo) {
                tableInfo += "\n\n/*";
            }
            
            if (this.indexesInTableInfo) {
                tableInfo += `\n${this._getTableIndexes(tableName)}\n`;
            }
            
            if (this.sampleRowsInTableInfo > 0) {
                tableInfo += `\n${this._getSampleRows(tableName)}\n`;
            }
            
            if (hasExtraInfo) {
                tableInfo += "*/";
            }
            
            tableInfos.push(tableInfo);
        }
        
        tableInfos.sort();
        return tableInfos.join("\n\n");
    }

    /**
     * Get table schema information
     * @param tableName The table name
     */
    private _getTableSchema(tableName: string): string {
        // Use PRAGMA to get actual table schema
        // This works for tables created by DataManager without TypeORM entities
        try {
            const queryRunner = this.dataSource.createQueryRunner();
            const columns = queryRunner.query(`PRAGMA table_info("${tableName}")`);
            queryRunner.release();

            if (!columns || columns.length === 0) {
                throw new Error(`Table ${tableName} not found or has no columns`);
            }

            // Build CREATE TABLE statement from PRAGMA results
            const colDefs: string[] = [];
            const primaryKeys: string[] = [];

            columns.forEach((col: any) => {
                let colDef = `${col.name} ${col.type.toUpperCase()}`;
                if (col.notnull) colDef += " NOT NULL";
                else colDef += " NULL";
                if (col.dflt_value !== null && col.dflt_value !== undefined) {
                    colDef += ` DEFAULT ${col.dflt_value}`;
                }
                if (col.pk) {
                    primaryKeys.push(col.name);
                }
                colDefs.push(colDef);
            });

            let createTable = `CREATE TABLE ${tableName} (\n  ${colDefs.join(',\n  ')}`;
            if (primaryKeys.length > 0) {
                createTable += `,\n  PRIMARY KEY (${primaryKeys.join(', ')})`;
            }
            createTable += '\n)';

            return createTable;

        } catch (error: any) {
            throw new Error(`Error getting schema for table ${tableName}: ${error.message}`);
        }
    }

    /**
     * Get column comments for a table
     * @param tableName The table name
     */
    private _getColumnComments(tableName: string): Record<string, string> | null {
        const entityMetadata = this.dataSource.entityMetadatas.find(
            metadata => metadata.tableName === tableName
        );
        
        if (!entityMetadata) {
            return null;
        }
        
        const columnComments: Record<string, string> = {};
        entityMetadata.columns.forEach(column => {
            if (column.comment) {
                columnComments[column.databaseName] = column.comment;
            }
        });
        
        return Object.keys(columnComments).length > 0 ? columnComments : null;
    }

    /**
     * Get table indexes information
     * @param tableName The table name
     */
    private _getTableIndexes(tableName: string): string {
        const entityMetadata = this.dataSource.entityMetadatas.find(
            metadata => metadata.tableName === tableName
        );
        
        if (!entityMetadata) {
            return "Table Indexes:\nNo indexes found";
        }
        
        const indexesInfo: string[] = [];
        entityMetadata.indices.forEach(index => {
            const columnNames = index.columns.map(col => col.databaseName);
            indexesInfo.push(
                `Name: ${index.name}, Unique: ${index.isUnique}, Columns: [${columnNames.join(', ')}]`
            );
        });
        
        return `Table Indexes:\n${indexesInfo.join('\n')}`;
    }

    /**
     * Get sample rows from a table
     * @param tableName The table name
     */
    private _getSampleRows(tableName: string): string {
        try {
            const queryRunner = this.dataSource.createQueryRunner();
            const sampleRows = queryRunner.query(
                `SELECT * FROM "${tableName}" LIMIT ${this.sampleRowsInTableInfo}`
            );
            queryRunner.release();

            if (!sampleRows || sampleRows.length === 0) {
                return `${this.sampleRowsInTableInfo} rows from ${tableName} table:\n`;
            }

            // Get column names from the first row
            const columns = Object.keys(sampleRows[0]);
            const columnsStr = columns.join('\t');

            // Format sample rows
            const sampleRowsStr = sampleRows.map((row: any) => {
                return columns.map(col => {
                    const value = row[col];
                    return String(value !== null && value !== undefined ? value : '').substring(0, 100);
                }).join('\t');
            }).join('\n');

            return `${this.sampleRowsInTableInfo} rows from ${tableName} table:\n` +
                   `${columnsStr}\n` +
                   `${sampleRowsStr}`;
        } catch (error) {
            console.error('Error getting sample rows:', error);
            return `${this.sampleRowsInTableInfo} rows from ${tableName} table:\n`;
        }
    }

    /**
     * Execute a SQL command
     * @param command The SQL command to execute
     * @param fetch How to fetch results: 'all', 'one', or 'cursor'
     * @param parameters Query parameters
     */
    async _execute(
        command: string,
        fetch: 'all' | 'one' | 'cursor' = 'all',
        parameters: any[] = []
    ): Promise<any> {
        try {
            const queryRunner = this.dataSource.createQueryRunner();
            
            if (fetch === 'cursor') {
                return queryRunner;
            }
            
            const result = await queryRunner.query(command, parameters);
            
            await queryRunner.release();
            
            if (fetch === 'one') {
                return result.length > 0 ? result[0] : null;
            }
            
            return result;
        } catch (error: any) {
            console.error('SQL Execution Error:', error.message);
            throw error;
        }
    }

    /**
     * Execute a SQL command and return results
     * @param command The SQL command to execute
     * @param fetch How to fetch results
     * @param includeColumns Whether to include column names
     * @param parameters Query parameters
     */
    async run(
        command: string,
        fetch: 'all' | 'one' | 'cursor' = 'all',
        includeColumns: boolean = false,
        parameters: any[] = []
    ): Promise<any> {
        const result = await this._execute(command, fetch, parameters);
        
        if (fetch === 'cursor') {
            return result;
        }
        
        if (!result || result.length === 0) {
            return "";
        }
        
        // Truncate long strings
        const processedResult = result.map((row: any) => {
            const processedRow: any = {};
            for (const [column, value] of Object.entries(row)) {
                if (typeof value === 'string' && value.length > this.maxStringLength) {
                    processedRow[column] = value.substring(0, this.maxStringLength) + '...';
                } else {
                    processedRow[column] = value;
                }
            }
            return processedRow;
        });
        
        if (!includeColumns) {
            return processedResult.map((row: any) => Object.values(row));
        }
        
        return processedResult;
    }

    /**
     * Get table information without throwing errors
     * @param tableNames Optional list of table names
     */
    getTableInfoNoThrow(tableNames: string[] | null = null): string {
        try {
            return this.getTableInfo(tableNames);
        } catch (error: any) {
            return `Error: ${error.message}`;
        }
    }

    /**
     * Execute SQL without throwing errors
     * @param command The SQL command
     * @param fetch How to fetch results
     * @param includeColumns Whether to include column names
     * @param parameters Query parameters
     */
    async runNoThrow(
        command: string,
        fetch: 'all' | 'one' = 'all',
        includeColumns: boolean = false,
        parameters: any[] = []
    ): Promise<any> {
        try {
            return await this.run(command, fetch, includeColumns, parameters);
        } catch (error: any) {
            return `Error: ${error.message}`;
        }
    }

    /**
     * Get database context for agent prompts
     */
    getContext(): any {
        const tableNames = Array.from(this.getUsableTableNames());
        const tableInfo = this.getTableInfoNoThrow();
        return {
            table_info: tableInfo,
            table_names: tableNames.join(', ')
        };
    }

    /**
     * Truncate a string to a certain length
     * @param content The content to truncate
     * @param length Maximum length
     * @param suffix Suffix to add when truncated
     */
    private truncateWord(
        content: any,
        length: number,
        suffix: string = "..."
    ): string {
        if (typeof content !== 'string' || length <= 0) {
            return content;
        }
        
        if (content.length <= length) {
            return content;
        }
        
        return content.substring(0, length - suffix.length).split(' ').slice(0, -1).join(' ') + suffix;
    }

    /**
     * Sanitize schema name
     * @param schema The schema name
     */
    private sanitizeSchema(schema: string): string {
        if (!/^[a-zA-Z0-9_]+$/.test(schema)) {
            throw new Error(
                `Schema name '${schema}' contains invalid characters. ` +
                "Schema names must contain only letters, digits, and underscores."
            );
        }
        return schema;
    }

    /**
     * Get the underlying data source
     */
    getDataSource(): DataSource {
        return this.dataSource;
    }

    /**
     * Get usable table names as an array
     */
    getUsableTableNamesArray(): string[] {
        return Array.from(this.getUsableTableNames());
    }

    /**
     * Close the database connection
     */
    async close(): Promise<void> {
        if (this.dataSource.isInitialized) {
            await this.dataSource.destroy();
        }
    }
}

// Export a function to create a DatabaseToolkit instance
export async function createDatabaseToolkit(
    databaseUri: string = 'data/sales_data.db',
    options: any = {}
): Promise<DatabaseToolkit> {
    const dataSource = new DataSource({
        type: 'better-sqlite3',
        database: databaseUri,
        synchronize: false,
        logging: false,
    });
    
    await dataSource.initialize();
    return new DatabaseToolkit(dataSource, null, options);
}
