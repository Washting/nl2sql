import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

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
    private db: Database.Database;
    private dataDir: string;
    private metadata: Record<string, TableMetadata> = {};
    private dbPath: string;

    constructor(dataDir: string = 'data') {
        this.dataDir = dataDir;
        this.dbPath = path.join(this.dataDir, 'sales_data.db');

        // Ensure data directory exists
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        this.db = new Database(this.dbPath);
        this.initializeData();
    }

    private initializeData() {
        this.createErpData();
        // Load CSVs if present (skipping for now as we don't have the file, but logic can be added)
    }

    private createErpData() {
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

        this.createTable('erp_products', products, {
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

        this.createTable('erp_customers', customers, {
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

        this.createTable('erp_orders', orders, {
            name: "ERP订单表",
            description: "企业资源规划系统中的订单数据",
            source: "mock"
        });
    }

    public async processUpload(file: File): Promise<TableMetadata> {
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

        this.createTable(tableName, data, {
            name: filename,
            description: "User uploaded file",
            source: "upload",
            file_id: fileId
        });

        return this.metadata[tableName];
    }

    private createTable(tableName: string, data: any[], meta: Partial<TableMetadata>) {
        if (data.length === 0) return;

        const columns = Object.keys(data[0]);

        // Create table
        const colDefs = columns.map(c => `"${c}" TEXT`).join(', '); // Simplified: all TEXT for now
        this.db.exec(`DROP TABLE IF EXISTS "${tableName}"`);
        this.db.exec(`CREATE TABLE "${tableName}" (${colDefs})`);

        // Insert data
        const placeholders = columns.map(() => '?').join(', ');
        const insert = this.db.prepare(`INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`);

        const insertMany = this.db.transaction((rows) => {
            for (const row of rows) {
                const values = columns.map(c => row[c]);
                insert.run(values);
            }
        });

        insertMany(data);

        this.metadata[tableName] = {
            name: meta.name || tableName,
            table: tableName,
            rows: data.length,
            columns: columns,
            description: meta.description || "",
            source: meta.source as any || "mock",
            file_id: meta.file_id
        };
    }

    public getTableList(): TableMetadata[] {
        return Object.values(this.metadata);
    }

    public getTableInfo(tableName: string): TableMetadata | null {
        return this.metadata[tableName] || null;
    }

    public getDbPath(): string {
        return this.dbPath;
    }

    public getDb(): Database.Database {
        return this.db;
    }

    // Fallback query logic (simplified)
    public queryData(query: string, tableName?: string, limit: number = 100): any {
        // This is a placeholder for the simple regex query logic
        // For now, we'll just return a basic SELECT if table is provided
        if (tableName && this.metadata[tableName]) {
            try {
                const rows = this.db.prepare(`SELECT * FROM "${tableName}" LIMIT ?`).all(limit);
                return {
                    success: true,
                    data: rows,
                    columns: this.metadata[tableName].columns,
                    total_rows: this.metadata[tableName].rows,
                    answer: `Returned ${rows.length} rows from ${tableName}`
                };
            } catch (e: any) {
                return { success: false, error: e.message };
            }
        }
        return { success: false, error: "Table not found or query not understood" };
    }
}

export const dataManager = new DataManager();
