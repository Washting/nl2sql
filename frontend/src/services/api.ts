// 真实API服务
import axios from "axios";

// 配置axios基础URL - 使用代理路径
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

// 创建axios实例
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 60000,
    headers: {
        "Content-Type": "application/json",
    },
});

// 请求拦截器
apiClient.interceptors.request.use(
    (config) => {
        // 可以在这里添加认证token等
        return config;
    },
    (error) => {
        return Promise.reject(error);
    },
);

// 响应拦截器
apiClient.interceptors.response.use(
    (response) => {
        return response.data;
    },
    (error) => {
        console.error("API Error:", error);
        return Promise.reject(error);
    },
);

// 类型定义
export interface FileUploadResponse {
    success: boolean;
    table_name?: string;
    message: string;
    headers?: string[];
    column_info?: Array<{
        name: string;
        type: string;
        nullable: boolean;
        unique_values: number;
        sample_values: any[];
    }>;
    total_columns?: number;
    estimated_rows?: number;
}

export interface QueryRequest {
    query: string;
    table_name?: string;
    columns?: string[];
    limit?: number;
}

export interface QueryResponse {
    success: boolean;
    data?: any[];
    answer?: string;
    sql?: string;
    reasoning?: string[];
    total_rows?: number;
    returned_rows?: number;
    columns?: string[];
    error?: string;
    visualization?: string;
}

export interface QueryStreamHandlers {
    onStatus?: (message: string) => void;
    onAnswerDelta?: (delta: string) => void;
    onResult?: (result: QueryResponse) => void;
    onError?: (message: string) => void;
}

export interface VisualizationRequest {
    table_name: string;
    chart_type:
        | "bar"
        | "line"
        | "pie"
        | "scatter"
        | "histogram"
        | "box"
        | "heatmap";
    x_column?: string;
    y_column?: string;
    group_by?: string;
    title?: string;
    limit?: number;
}

export interface VisualizationResponse {
    success: boolean;
    chart_url?: string;
    chart_html?: string;
    error?: string;
}

export interface ChatRequest {
    message: string;
    session_id?: string;
    table_name?: string;
}

export interface ChatResponse {
    success: boolean;
    message: string;
    session_id: string;
    data?: any[];
    visualization?: string;
    error?: string;
}

export interface DeleteTableResponse {
    success: boolean;
    message?: string;
    error?: string;
}

// API服务
export const api = {
    // 获取数据源列表
    async getDataSources(): Promise<{ success: boolean; sources: any[] }> {
        const response = await apiClient.get("/datasources");
        return response as unknown as { success: boolean; sources: any[] };
    },

    // 上传文件
    async uploadFile(file: File): Promise<FileUploadResponse> {
        const formData = new FormData();
        formData.append("file", file);

        const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });

        return response.data;
    },

    // 查询数据
    async queryData(request: QueryRequest): Promise<QueryResponse> {
        console.log("API.queryData - 请求参数:", request);
        console.log("API.queryData - baseURL:", API_BASE_URL);
        console.log("API.queryData - 完整URL:", `${API_BASE_URL}/query`);
        const response = await apiClient.post("/query", request);
        console.log("API.queryData - 响应:", response);
        return response as unknown as QueryResponse;
    },

    // 流式查询数据
    async queryDataStream(
        request: QueryRequest,
        handlers: QueryStreamHandlers = {},
    ): Promise<QueryResponse | null> {
        const response = await fetch(`${API_BASE_URL}/query/stream`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(request),
        });

        if (!response.ok || !response.body) {
            const errorText = await response.text();
            throw new Error(errorText || "流式查询请求失败");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let finalResult: QueryResponse | null = null;

        const processEvent = (rawEvent: string) => {
            const lines = rawEvent.split("\n");
            let eventName = "message";
            const dataLines: string[] = [];

            for (const line of lines) {
                if (line.startsWith("event:")) {
                    eventName = line.slice(6).trim();
                } else if (line.startsWith("data:")) {
                    dataLines.push(line.slice(5).trim());
                }
            }

            if (dataLines.length === 0) return;

            const payload = JSON.parse(dataLines.join("\n"));
            if (eventName === "status") {
                handlers.onStatus?.(payload.message || "");
                return;
            }
            if (eventName === "answer_delta") {
                handlers.onAnswerDelta?.(payload.delta || "");
                return;
            }
            if (eventName === "result") {
                finalResult = payload as QueryResponse;
                handlers.onResult?.(finalResult);
                return;
            }
            if (eventName === "error") {
                const errorMessage = payload.message || "流式查询失败";
                handlers.onError?.(errorMessage);
                throw new Error(errorMessage);
            }
        };

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() || "";

            for (const eventText of events) {
                if (!eventText.trim()) continue;
                processEvent(eventText);
            }
        }

        if (buffer.trim()) {
            processEvent(buffer);
        }

        return finalResult;
    },

    // 创建可视化
    async createVisualization(
        request: VisualizationRequest,
    ): Promise<VisualizationResponse> {
        const response = await apiClient.post("/visualize", request);
        return response as unknown as VisualizationResponse;
    },

    // 聊天对话
    async chat(request: ChatRequest): Promise<ChatResponse> {
        const response = await apiClient.post("/chat", request);
        return response as unknown as ChatResponse;
    },

    async deleteTable(tableName: string): Promise<DeleteTableResponse> {
        const response = await apiClient.delete(`/tables/${tableName}`);
        return response as unknown as DeleteTableResponse;
    },

    // 健康检查
    async healthCheck(): Promise<{
        status: string;
        files_loaded: number;
        active_agents: number;
        active_sessions: number;
    }> {
        const response = await apiClient.get("/health");
        return response as unknown as {
            status: string;
            files_loaded: number;
            active_agents: number;
            active_sessions: number;
        };
    },
};

// 导出文件上传辅助函数
export const uploadFileHelper = async (file: File) => {
    try {
        const result = await api.uploadFile(file);
        if (result.success) {
            return {
                success: true,
                tableName: result.table_name!,
                filename: file.name,
                headers: result.headers!,
                columnInfo: result.column_info!,
                totalColumns: result.total_columns!,
                estimatedRows: result.estimated_rows!,
            };
        } else {
            throw new Error(result.message || "上传失败");
        }
    } catch (error: any) {
        console.error("Upload error:", error);
        return {
            success: false,
            error:
                error.response?.data?.detail || error.message || "上传文件失败",
        };
    }
};

// 导出查询辅助函数
export const queryDataHelper = async (query: string, tableName?: string) => {
    try {
        if (!tableName) {
            throw new Error("请先选择数据表");
        }

        const result = await api.queryData({
            query,
            table_name: tableName,
            limit: 100,
        });

        if (result.success) {
            return {
                success: true,
                data: result.data || [],
                answer: result.answer || "",
                columns: result.columns || [],
                totalRows: result.total_rows || 0,
                returnedRows: result.returned_rows || 0,
            };
        } else {
            throw new Error(result.error || "查询失败");
        }
    } catch (error: any) {
        console.error("Query error:", error);
        return {
            success: false,
            error:
                error.response?.data?.detail || error.message || "查询数据失败",
        };
    }
};

// 导出可视化辅助函数
export const createVisualizationHelper = async (
    chartType: string,
    tableName?: string,
    xColumn?: string,
    yColumn?: string,
    title?: string,
) => {
    try {
        if (!tableName) {
            throw new Error("请先选择数据表");
        }

        const result = await api.createVisualization({
            table_name: tableName,
            chart_type: chartType as any,
            x_column: xColumn,
            y_column: yColumn,
            title: title,
            limit: 100,
        });

        if (result.success) {
            return {
                success: true,
                chartHtml: result.chart_html!,
            };
        } else {
            throw new Error(result.error || "创建可视化失败");
        }
    } catch (error: any) {
        console.error("Visualization error:", error);
        return {
            success: false,
            error:
                error.response?.data?.detail ||
                error.message ||
                "创建可视化失败",
        };
    }
};

// 导出聊天辅助函数
export const chatHelper = async (
    message: string,
    sessionId?: string,
    tableName?: string,
) => {
    try {
        if (!tableName) {
            throw new Error("请先选择数据源");
        }

        const result = await api.chat({
            message,
            table_name: tableName,
            session_id: sessionId,
        });

        if (result.success) {
            return {
                success: true,
                message: result.message,
                sessionId: result.session_id,
                data: result.data || [],
            };
        } else {
            throw new Error(result.error || "对话失败");
        }
    } catch (error: any) {
        console.error("Chat error:", error);
        return {
            success: false,
            error:
                error.response?.data?.detail || error.message || "发送消息失败",
        };
    }
};
