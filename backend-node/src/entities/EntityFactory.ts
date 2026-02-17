import { Entity, Column, PrimaryColumn } from "typeorm";

export interface ColumnDefinition {
    name: string;
    type: 'text' | 'integer' | 'real' | 'blob' | 'numeric';
    nullable: boolean;
    primary: boolean;
}

/**
 * Create a dynamic TypeORM entity class for a table
 * This allows us to work with dynamically created tables
 */
export function createDynamicEntity(tableName: string, columns: ColumnDefinition[]) {
    // Create a class for the entity
    @Entity({ name: tableName })
    class DynamicEntity {
        // Add properties dynamically
        constructor() {
            columns.forEach(col => {
                (this as any)[col.name] = null;
            });
        }
    }

    // Apply decorators to each column
    columns.forEach(col => {
        const propertyDescriptor: PropertyDescriptor = {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        };

        // Apply @Column decorator
        Column({
            type: col.type,
            nullable: col.nullable,
            primary: col.primary
        })(DynamicEntity.prototype, col.name, propertyDescriptor);

        // Apply @PrimaryColumn decorator if primary
        if (col.primary) {
            PrimaryColumn()(DynamicEntity.prototype, col.name);
        }
    });

    return DynamicEntity;
}

/**
 * Infer column definitions from data samples
 */
export function inferColumnDefinitions(data: any[]): ColumnDefinition[] {
    if (data.length === 0) {
        return [];
    }

    const sampleRow = data[0];
    const columns: ColumnDefinition[] = [];

    // Analyze each column
    Object.keys(sampleRow).forEach(colName => {
        const values = data.slice(0, 100).map(row => row[colName]); // Sample first 100 rows
        const colType = inferColumnType(values);
        const isNullable = values.some(v => v === null || v === undefined || v === '');

        columns.push({
            name: colName,
            type: colType,
            nullable: isNullable,
            primary: colName.toLowerCase() === 'id'
        });
    });

    return columns;
}

/**
 * Infer the SQLite column type from values
 */
function inferColumnType(values: any[]): 'text' | 'integer' | 'real' | 'blob' | 'numeric' {
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');

    if (nonNullValues.length === 0) {
        return 'text';
    }

    // Check for integer
    const intCount = nonNullValues.filter(v => {
        const num = Number(v);
        return Number.isInteger(num) && !isNaN(num);
    }).length;

    if (intCount / nonNullValues.length > 0.9) {
        return 'integer';
    }

    // Check for real (floating point)
    const realCount = nonNullValues.filter(v => {
        const num = Number(v);
        return !isNaN(num) && isFinite(num);
    }).length;

    if (realCount / nonNullValues.length > 0.9) {
        return 'real';
    }

    // Check for boolean (store as integer)
    const boolCount = nonNullValues.filter(v =>
        typeof v === 'boolean' ||
        String(v).toLowerCase() === 'true' ||
        String(v).toLowerCase() === 'false'
    ).length;

    if (boolCount / nonNullValues.length > 0.8) {
        return 'integer';
    }

    // Default to text
    return 'text';
}

/**
 * Clean column names to be SQL-safe
 */
export function cleanColumnName(colName: string): string {
    // Remove special characters, replace with underscore
    let cleaned = colName.replace(/[^\w\u4e00-\u9fff]/g, '_');

    // Ensure it doesn't start with a number
    if (cleaned && /^\d/.test(cleaned)) {
        cleaned = 'col_' + cleaned;
    }

    // Ensure it's not empty
    if (!cleaned) {
        cleaned = 'unnamed_column';
    }

    return cleaned;
}
