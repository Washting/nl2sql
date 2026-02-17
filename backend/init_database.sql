-- 初始化数据库脚本
-- 数据库初始化 SQL 脚本
-- 用于创建表结构并初始化基础数据

-- ============================================
-- 0. 删除已存在的表（清除旧数据结构）
-- ============================================
DROP TABLE IF EXISTS erp_orders;
DROP TABLE IF EXISTS erp_products;
DROP TABLE IF EXISTS erp_customers;
DROP TABLE IF EXISTS sales_data;

-- ============================================
-- 1. 创建销售数据表
-- ============================================
CREATE TABLE IF NOT EXISTS sales_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    price REAL NOT NULL,
    sales_volume INTEGER NOT NULL,
    sale_date TEXT NOT NULL,
    category TEXT NOT NULL,
    brand TEXT NOT NULL,
    original_price REAL NOT NULL,
    discount_rate REAL NOT NULL,
    review_count INTEGER NOT NULL,
    positive_rate REAL NOT NULL,
    ship_location TEXT NOT NULL,
    warranty_months INTEGER NOT NULL
);

-- 插入示例销售数据（CSV 数据需要通过 .import 命令或 Python 脚本导入）
INSERT INTO sales_data
(product_name, price, sales_volume, sale_date, category, brand, original_price, discount_rate, review_count, positive_rate, ship_location, warranty_months)
VALUES
('OPPO 投影仪 X4', 8541.0, 3469, '2024-10-10', '投影仪', 'OPPO', 12533.52, 31.85, 112, 97.64, '杭州', 18),
('海尔 电视 X5', 2922.0, 8788, '2024-09-15', '电视', '海尔', 3258.31, 10.32, 715, 96.35, '广州', 6),
('联想 电视 X4', 9922.0, 2043, '2024-02-22', '电视', '联想', 12378.72, 19.85, 724, 80.57, '武汉', 18),
('戴尔 智能家居 X5', 283.0, 1878, '2024-07-13', '智能家居', '戴尔', 321.61, 12.01, 169, 98.74, '武汉', 24),
('小米 电视 X5', 10735.0, 7983, '2024-12-12', '电视', '小米', 15401.01, 30.3, 764, 84.89, '广州', 24);

-- ============================================
-- 2. 创建 ERP 产品表
-- ============================================
CREATE TABLE IF NOT EXISTS erp_products (
    product_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 插入 ERP 产品数据
INSERT INTO erp_products (product_id, name, category, price, stock, status, created_at)
VALUES
(1, 'iPhone 15 Pro', '电子产品', 8999.00, 500, '在售', '2024-01-01T00:00:00'),
(2, 'MacBook Pro M3', '电子产品', 16999.00, 200, '在售', '2024-01-01T00:00:00'),
(3, 'iPad Air', '电子产品', 4799.00, 800, '在售', '2024-01-01T00:00:00'),
(4, 'AirPods Pro', '配件', 1999.00, 2000, '在售', '2024-01-01T00:00:00'),
(5, 'Apple Watch', '电子产品', 3199.00, 1000, '在售', '2024-01-01T00:00:00'),
(6, 'Samsung Galaxy S24', '电子产品', 7999.00, 600, '在售', '2024-01-01T00:00:00'),
(7, 'Sony WH-1000XM5', '配件', 2999.00, 1500, '在售', '2024-01-01T00:00:00'),
(8, 'Dell XPS 15', '电子产品', 13999.00, 300, '在售', '2024-01-01T00:00:00'),
(9, 'Surface Pro 9', '电子产品', 8999.00, 400, '在售', '2024-01-01T00:00:00'),
(10, 'ThinkPad X1 Carbon', '电子产品', 12999.00, 350, '在售', '2024-01-01T00:00:00');

-- ============================================
-- 3. 创建 ERP 订单表
-- ============================================
CREATE TABLE IF NOT EXISTS erp_orders (
    order_id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    order_date TEXT NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES erp_products (product_id)
);

-- 插入部分示例订单数据（共 100 条，此处展示前 10 条）
INSERT INTO erp_orders (order_id, product_id, customer_name, quantity, total_amount, order_date, status)
VALUES
(1, 1, '张三', 2, 17998.00, '2024-10-01T10:30:00', '已完成'),
(2, 2, '李四', 1, 16999.00, '2024-10-02T14:20:00', '已完成'),
(3, 3, '王五', 3, 14397.00, '2024-10-03T09:15:00', '处理中'),
(4, 4, '赵六', 5, 9995.00, '2024-10-04T16:45:00', '待发货'),
(5, 5, '陈七', 2, 6398.00, '2024-10-05T11:00:00', '已完成'),
(6, 6, '刘八', 1, 7999.00, '2024-10-06T13:30:00', '处理中'),
(7, 7, '周九', 3, 8997.00, '2024-10-07T15:00:00', '已完成'),
(8, 8, '吴十', 1, 13999.00, '2024-10-08T10:00:00', '已完成'),
(9, 1, '张三', 1, 8999.00, '2024-10-09T12:00:00', '待发货'),
(10, 9, '李四', 2, 17998.00, '2024-10-10T14:00:00', '处理中');

-- ============================================
-- 4. 创建 ERP 客户表
-- ============================================
CREATE TABLE IF NOT EXISTS erp_customers (
    customer_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    city TEXT NOT NULL,
    registration_date TEXT NOT NULL,
    total_orders INTEGER DEFAULT 0,
    total_spent DECIMAL(10,2) DEFAULT 0
);

-- 插入客户数据
INSERT INTO erp_customers (customer_id, name, email, phone, city, registration_date, total_orders, total_spent)
VALUES
(1, '张三', 'zhangsan@email.com', '13800138001', '北京', '2024-01-15', 25, 125000.00),
(2, '李四', 'lisi@email.com', '13800138002', '上海', '2024-02-20', 18, 89000.00),
(3, '王五', 'wangwu@email.com', '13800138003', '广州', '2024-03-10', 32, 156000.00),
(4, '赵六', 'zhaoliu@email.com', '13800138004', '深圳', '2024-04-05', 15, 67000.00),
(5, '陈七', 'chenqi@email.com', '13800138005', '杭州', '2024-05-12', 28, 134000.00);

-- ============================================
-- 5. 创建索引以提高查询性能
-- ============================================
CREATE INDEX IF NOT EXISTS idx_sales_category ON sales_data(category);
CREATE INDEX IF NOT EXISTS idx_sales_brand ON sales_data(brand);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_data(sale_date);
CREATE INDEX IF NOT EXISTS idx_orders_product ON erp_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON erp_orders(order_date);

-- ============================================
-- 使用说明
-- ============================================
--
-- 1. 执行此 SQL 脚本：
--    sqlite3 data/sales_data.db < init_database.sql
--
-- 2. 如果需要导入完整的 CSV 数据（55231 条记录），可以使用以下方法：
--
--    方法 A：使用 SQLite 命令行工具
--    ```
--    sqlite3 data/sales_data.db
--    sqlite> .mode csv
--    sqlite> .separator ","
--    sqlite> .import --skip 1 data/电子产品销售数据.csv sales_data
--    sqlite> .quit
--    ```
--
--    方法 B：继续使用 Python 脚本导入 CSV 数据
--    python init_database.py
--
-- 3. 验证数据导入：
--    sqlite3 data/sales_data.db "SELECT COUNT(*) FROM sales_data;"
--    sqlite3 data/sales_data.db "SELECT COUNT(*) FROM erp_products;"
--
-- ============================================
