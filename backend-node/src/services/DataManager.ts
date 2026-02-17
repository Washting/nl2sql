import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { inferColumnDefinitions, cleanColumnName, createDynamicEntity } from "../entities/EntityFactory";

export interface ColumnInfo {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    nullable: boolean;
    unique: number;
    sample_values: any[];
}

export interface TableMetadata {
    name: string;
    table: string;
    rows: number;
    columns: string[];
    description: string;
    source: 'csv' | 'mock' | 'upload' | 'derived';
    file_id?: string;
}

export class DataManager {
    private dataSource: DataSource;
    private metadata: Record<string, TableMetadata> = {};

    constructor(dataSource: DataSource) {
        this.dataSource = dataSource;
        this.initializeData();
    }

    private async initializeData() {
        await this.createErpData();
    }

    private async createErpData() {
        // 1. Products
        const products = [
            { product_id: 1, name: "iPhone 15 Pro", category: "手机", price: 8999.00, stock: 500, supplier: "Apple" },
            { product_id: 2, name: "MacBook Pro M3", category: "笔记本", price: 16999.00, stock: 200, supplier: "Apple" },
            { product_id: 3, name: "iPad Air", category: "平板", price: 4799.00, stock: 800, supplier: "Apple" },
            { product_id: 4, name: "AirPods Pro", category: "耳机", price: 1999.00, stock: 2000, supplier: "Apple" },
            { product_id: 5, name: "Apple Watch", category: "智能手表", price: 3199.00, stock: 1000, supplier: "Apple" },
            { product_id: 6, name: "Samsung Galaxy S24", category: "手机", price: 7999.00, stock: 600, supplier: "Samsung" },
            { product_id: 7, name: "Sony WH-1000XM5", category: "耳机", price: 2999.00, stock: 1500, supplier: "Sony" },
            { product_id: 8, name: "Dell XPS 15", category: "笔记本", price: 13999.00, stock: 300, supplier: "Dell" },
            { product_id: 9, name: "Surface Pro 9", category: "平板", price: 8999.00, stock: 400, supplier: "Microsoft" },
            { product_id: 10, name: "ThinkPad X1 Carbon", category: "笔记本", price: 12999.00, stock: 350, supplier: "Lenovo" }
        ];

        await this.createTable('erp_products', products, {
            name: "ERP产品表",
            description: "企业资源规划系统中的产品数据",
            source: "mock"
        });

        // 2. Customers
        const customers = [
            { customer_id: 1, name: "张三", email: "zhangsan@email.com", city: "北京", level: "VIP", total_orders: 25 },
            { customer_id: 2, name: "李四", email: "lisi@email.com", city: "上海", level: "普通", total_orders: 18 },
            { customer_id: 3, name: "王五", email: "wangwu@email.com", city: "广州", level: "VIP", total_orders: 32 },
            { customer_id: 4, name: "赵六", email: "zhaoliu@email.com", city: "深圳", level: "普通", total_orders: 15 },
            { customer_id: 5, name: "陈七", email: "chenqi@email.com", city: "杭州", level: "VIP", total_orders: 28 },
        ];

        await this.createTable('erp_customers', customers, {
            name: "ERP客户表",
            description: "企业资源规划系统中的客户数据",
            source: "mock"
        });

        // 3. Orders
        const orders = [];
        const customerNames = customers.map(c => c.name);
        const statuses = ['已完成', '处理中', '待发货'];

        for (let i = 1; i <= 200; i++) {
            const product = products[Math.floor(Math.random() * products.length)];
            const quantity = Math.floor(Math.random() * 10) + 1;
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 180));

            orders.push({
                order_id: i,
                product_id: product.product_id,
                product_name: product.name,
                customer_name: customerNames[Math.floor(Math.random() * customerNames.length)],
                quantity: quantity,
                unit_price: product.price,
                total_amount: product.price * quantity,
                order_date: date.toISOString().split('T')[0],
                status: statuses[Math.floor(Math.random() * statuses.length)],
                category: product.category
            });
        }

        await this.createTable('erp_orders', orders, {
            name: "ERP订单表",
            description: "企业资源规划系统中的订单数据",
            source: "mock"
        });
    }

    public async processUpload(file: File): Promise<{
        metadata: TableMetadata;
        columnInfo: ColumnInfo[];
    }> {
        const buffer = await file.arrayBuffer();
        const content = new Uint8Array(buffer);
        const filename = file.name;
        const fileId = uuidv4();
        const tableName = `file_${fileId.replace(/-/g, '_')}`;

        let data: any[] = [];

        if (filename.endsWith('.csv')) {
            const text = new TextDecoder().decode(content);
            const result = Papa.parse(text, { header: true, skipEmptyLines: true });
            data = result.data as any[];
        } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
            const workbook = XLSX.read(content, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        } else {
            throw new Error("Unsupported file format");
        }

        // Clean column names
        data = data.map(row => {
            const cleanedRow: any = {};
            Object.keys(row).forEach(key => {
                cleanedRow[cleanColumnName(key)] = row[key];
            });
            return cleanedRow;
        });

        // Get column info before creating table
        const columnInfo = this.getColumnInfo(data);

        await this.createTable(tableName, data, {
            name: filename,
            description: "User uploaded file",
            source: "upload",
            file_id: fileId
        });

        return {
            metadata: this.metadata[tableName],
            columnInfo
        };
    }

    private getColumnInfo(data: any[]): ColumnInfo[] {
        if (data.length === 0) return [];

        const columns = Object.keys(data[0]);
        return columns.map(col => {
            const values = data.map(row => row[col]);
            const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
            const uniqueCount = new Set(values).size;

            return {
                name: col,
                type: this.inferColumnType(values),
                nullable: nonNullValues.length < data.length,
                unique: uniqueCount,
                sample_values: values.slice(0, 5).filter(v => v !== null && v !== undefined && v !== '')
            };
        });
    }

    private inferColumnType(values: any[]): 'string' | 'number' | 'date' | 'boolean' {
        const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');

        if (nonNullValues.length === 0) return 'string';

        // Check for boolean
        const boolCount = nonNullValues.filter(v =>
            typeof v === 'boolean' ||
            String(v).toLowerCase() === 'true' ||
            String(v).toLowerCase() === 'false' ||
            v === 0 || v === 1
        ).length;
        if (boolCount / nonNullValues.length > 0.8) return 'boolean';

        // Check for number
        const numCount = nonNullValues.filter(v => {
            const num = Number(v);
            return !isNaN(num) && isFinite(num) && String(v).trim() !== '';
        }).length;
        if (numCount / nonNullValues.length > 0.8) return 'number';

        // Check for date
        const dateCount = nonNullValues.filter(v => {
            const date = new Date(v);
            return !isNaN(date.getTime());
        }).length;
        if (dateCount / nonNullValues.length > 0.8) return 'date';

        return 'string';
    }

    private async createTable(tableName: string, data: any[], meta: Partial<TableMetadata>) {
        if (data.length === 0) return;

        const queryRunner = this.dataSource.createQueryRunner();

        try {
            // Use raw SQL to create table (more flexible than TypeORM's createTable)
            const columns = Object.keys(data[0]);
            const columnDefs = columns.map(col => `"${col}" TEXT`).join(', ');

            // Drop table if exists
            await queryRunner.query(`DROP TABLE IF EXISTS "${tableName}"`);

            // Create table
            await queryRunner.query(`CREATE TABLE "${tableName}" (${columnDefs})`);

            // Insert data in batches
            const placeholders = columns.map(() => '?').join(', ');
            const insertSQL = `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

            for (const row of data) {
                const values = Object.values(row);
                await queryRunner.query(insertSQL, values);
            }

            // Store metadata
            this.metadata[tableName] = {
                name: meta.name || tableName,
                table: tableName,
                rows: data.length,
                columns: columns,
                description: meta.description || "",
                source: meta.source as any || "mock",
                file_id: meta.file_id
            };

            console.log(`[DataManager] Created table ${tableName} with ${data.length} rows`);

        } finally {
            await queryRunner.release();
        }
    }

    public getTableList(): TableMetadata[] {
        return Object.values(this.metadata);
    }

    public getTableInfo(tableName: string): TableMetadata | null {
        return this.metadata[tableName] || null;
    }

    public getDataSource(): DataSource {
        return this.dataSource;
    }

    public async queryData(query: string, tableName?: string, limit: number = 100): any {
        const queryRunner = this.dataSource.createQueryRunner();

        try {
            if (tableName && this.metadata[tableName]) {
                const rows = await queryRunner.query(
                    `SELECT * FROM "${tableName}" LIMIT ?`,
                    [limit]
                );
                return {
                    success: true,
                    data: rows,
                    columns: this.metadata[tableName].columns,
                    total_rows: this.metadata[tableName].rows,
                    answer: `Returned ${rows.length} rows from ${tableName}`
                };
            }

            return { success: false, error: "Table not found or query not understood" };
        } catch (e: any) {
            return { success: false, error: e.message };
        } finally {
            await queryRunner.release();
        }
    }

    public getDbPath(): string {
        // Extract database path from TypeORM DataSource
        return (this.dataSource.options as any).database || 'data/sales_data.db';
    }

    public async getDb(): Promise<any> {
        // Return the TypeORM DataSource for backward compatibility
        return this.dataSource;
    }
}

// Export factory function
export function createDataManager(dataSource: DataSource): DataManager {
    return new DataManager(dataSource);
}

