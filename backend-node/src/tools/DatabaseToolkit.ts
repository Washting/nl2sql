import { DataSource, getMetadataArgsStorage } from "typeorm";

export class SqlDatabase {
    private schema: string;
    private dataSource: DataSource;
    private allTables: string[];

    constructor(schema: string) {
        this.schema = schema;
        this.dataSource = new DataSource({
            url: schema,
            type: this._parseEngine(schema) as any,
            logging: false,
            ssl: true,
        });
    }

    async init() {
        await this.dataSource.initialize();
        const getMetadataArgsStorage = await getMetadataArgsStorage();
        this.allTables = await getMetadataArgsStorage().tables.map(
            (table) => table.name,
        );
    }

    _parseEngine(url: string): string {
        const engine = url.split(":")[0];
        return engine;
    }
}

export class DatabaseToolkit {}
