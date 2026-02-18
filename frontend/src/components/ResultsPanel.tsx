import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertCircle, BarChart3, Download, FileText, Hash, Loader2, Table as TableIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "./ui/button";
import { useMetadataStore } from "../stores/metadata-store";

interface ResultsPanelProps {
  queryResult?: any;
  selectedTable?: string | null;
  streamingAnswer?: string;
  isStreaming?: boolean;
}

export function ResultsPanel({
  queryResult,
  selectedTable = null,
  streamingAnswer = "",
  isStreaming = false,
}: ResultsPanelProps) {
  const { getTableDisplayName, getColumnDisplayName } = useMetadataStore();
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const tableData = queryResult?.data || [];
  const activeTableName = queryResult?.table_name || selectedTable || null;
  const tableDisplayName = getTableDisplayName(activeTableName);
  const displayColumns: string[] = queryResult?.columns || (tableData[0] ? Object.keys(tableData[0]) : []);
  const getDisplayColumnName = (columnName: string) =>
    getColumnDisplayName(activeTableName, columnName);

  const chartMeta = useMemo(() => {
    if (!tableData.length) return null;
    const columns = queryResult.columns || Object.keys(tableData[0]);
    const xKey = columns.find((col: string) => typeof tableData[0][col] === "string") || columns[0];
    const yKey =
      columns.find((col: string) => typeof tableData[0][col] === "number" && col !== xKey) ||
      columns.find((col: string) => col !== xKey) ||
      columns[1];
    const chartData = tableData.length <= 20 ? tableData : tableData.slice(0, 20);
    return { xKey, yKey, chartData, columns };
  }, [queryResult?.columns, tableData]);

  const displayAnswer = isStreaming && streamingAnswer ? streamingAnswer : queryResult?.answer || "";
  const hasAnyContent = tableData.length > 0 || Boolean(displayAnswer.trim());

  const handleExport = () => {
    if (!tableData.length) return;
    const escapeCsvValue = (value: unknown) => {
      const text = value === null || value === undefined ? "" : String(value);
      const escaped = text.replace(/"/g, '""');
      return `"${escaped}"`;
    };
    const headers = displayColumns.map((col) => escapeCsvValue(getDisplayColumnName(col))).join(",");
    const rows = tableData
      .map((row: any) => displayColumns.map((col) => escapeCsvValue(row[col])).join(","))
      .join("\n");
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const safeTableName = String(tableDisplayName || "query_result").replace(/[\\/:*?"<>|]/g, "_");
    link.setAttribute("download", `${safeTableName}_${Date.now()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full flex flex-col bg-card/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40 flex-shrink-0 bg-gradient-to-r from-cyan-500/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <TableIcon className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />
              <h2 className="text-cyan-600 dark:text-cyan-300 text-base font-semibold">查询结果与图表</h2>
            </div>
            {queryResult?.success && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground ml-7">
                {tableDisplayName && <span>表名: {tableDisplayName}</span>}
                <span>共 {queryResult.returned_rows || tableData.length || 0} 行</span>
                <span>执行时间: {queryResult.executionTime || "125"}ms</span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExport}
            disabled={!tableData.length}
            className="h-8 px-3 text-muted-foreground hover:text-cyan-500"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0 px-4 py-4">
        {queryResult && !queryResult.success && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-red-400 text-sm">查询失败</p>
              <p className="text-muted-foreground text-xs mt-2">{queryResult.error || "未知错误"}</p>
            </div>
          </div>
        )}

        {!queryResult && !isStreaming ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">暂无数据</p>
              <p className="text-muted-foreground/80 text-xs mt-1">请在中间输入问题并执行查询</p>
            </div>
          </div>
        ) : isStreaming ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-full max-w-sm rounded-xl border border-border/50 bg-muted/20 p-5 space-y-3">
              <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-300 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在查询并生成结果...
              </div>
              <div className="space-y-2">
                <div className="h-2 w-full rounded bg-muted animate-pulse" />
                <div className="h-2 w-5/6 rounded bg-muted animate-pulse" />
                <div className="h-2 w-2/3 rounded bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        ) : queryResult?.success && !hasAnyContent ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">查询完成，但暂无可展示结果</p>
              <p className="text-muted-foreground/80 text-xs mt-1">可尝试调整筛选条件或更换提问方式</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {tableData.length > 0 && (
              <div className="bg-card/60 rounded-xl border border-border/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full table-auto border-collapse">
                    <thead>
                      <tr className="border-b border-border/40 bg-muted/30">
                        {displayColumns.map((col: string) => (
                          <th key={col} className="text-cyan-500 dark:text-cyan-300 font-medium text-xs text-left px-4 py-3 whitespace-nowrap border-r border-border/20 last:border-r-0">
                            {getDisplayColumnName(col)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.map((row: any, rowIdx: number) => (
                        <tr key={rowIdx} className="border-b border-border/20 hover:bg-muted/20 last:border-b-0">
                          {displayColumns.map((col: string) => (
                            <td key={`${rowIdx}-${col}`} className="text-foreground/85 text-xs px-4 py-3 whitespace-nowrap border-r border-border/20 last:border-r-0">
                              {row[col] !== null && row[col] !== undefined ? String(row[col]) : "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {chartMeta && (
              <div className="bg-card/60 rounded-xl border border-border/50 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                    <h3 className="text-sm font-medium text-cyan-600 dark:text-cyan-300">自动生成图表</h3>
                    {tableDisplayName && (
                      <span className="text-xs text-muted-foreground">表: {tableDisplayName}</span>
                    )}
                    {tableData.length > 20 && <span className="text-xs text-muted-foreground">（显示前20条）</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setChartType("bar")} className={`text-xs h-7 rounded-lg ${chartType === "bar" ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-purple-600/15 hover:bg-purple-600/25 text-purple-300 border border-purple-500/40"}`}>
                      柱状图
                    </Button>
                    <Button size="sm" onClick={() => setChartType("line")} className={`text-xs h-7 rounded-lg ${chartType === "line" ? "bg-pink-600 hover:bg-pink-700 text-white" : "bg-pink-600/15 hover:bg-pink-600/25 text-pink-300 border border-pink-500/40"}`}>
                      折线图
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2 mb-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/40 border border-border/40">
                    <Hash className="w-3 h-3 text-cyan-500 dark:text-cyan-400" />
                    <span className="text-xs font-medium text-muted-foreground">维度: {getDisplayColumnName(chartMeta.xKey)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/40 border border-border/40">
                    <Hash className="w-3 h-3 text-cyan-500 dark:text-cyan-400" />
                    <span className="text-xs font-medium text-muted-foreground">指标: {getDisplayColumnName(chartMeta.yKey)}</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  {chartType === "bar" ? (
                    <BarChart data={chartMeta.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey={chartMeta.xKey} stroke="#6ee7b7" tick={{ fill: "#9ca3af", fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                      <YAxis stroke="#6ee7b7" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#1a1b3e", border: "1px solid #5ce1e6", borderRadius: "8px", fontSize: "12px" }} />
                      <Legend wrapperStyle={{ fontSize: "12px", color: "#9ca3af" }} />
                      <Bar dataKey={chartMeta.yKey} fill="#22d3ee" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : (
                    <LineChart data={chartMeta.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey={chartMeta.xKey} stroke="#6ee7b7" tick={{ fill: "#9ca3af", fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                      <YAxis stroke="#6ee7b7" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#1a1b3e", border: "1px solid #5ce1e6", borderRadius: "8px", fontSize: "12px" }} />
                      <Legend wrapperStyle={{ fontSize: "12px", color: "#9ca3af" }} />
                      <Line type="monotone" dataKey={chartMeta.yKey} stroke="#ec4899" strokeWidth={2} dot={{ fill: "#ec4899", r: 4 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}

            {displayAnswer.trim() && (
              <div className="bg-muted/30 rounded-xl border border-border/40 p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/40">
                  <FileText className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                  <h3 className="text-sm font-medium text-cyan-600 dark:text-cyan-300">数据分析报告</h3>
                </div>
                <div className="max-w-none text-[13px] leading-6 text-foreground/85">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h2: ({ ...props }) => <h2 className="text-[18px] font-semibold text-foreground mt-3 mb-1.5" {...props} />,
                      h3: ({ ...props }) => <h3 className="text-[16px] font-semibold text-foreground mt-3 mb-1.5" {...props} />,
                      p: ({ ...props }) => <p className="text-foreground/85 text-[13px] leading-6 mb-2" {...props} />,
                      ul: ({ ...props }) => <ul className="list-disc ml-5 mb-2 space-y-1 text-[13px] leading-6 text-foreground/80" {...props} />,
                      ol: ({ ...props }) => <ol className="list-decimal ml-5 mb-2 space-y-1 text-[13px] leading-6 text-foreground/80" {...props} />,
                      li: ({ ...props }) => <li className="pl-1 marker:text-muted-foreground" {...props} />,
                      strong: ({ ...props }) => <strong className="text-foreground font-semibold" {...props} />,
                      code: ({ ...props }) => <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-[12px]" {...props} />,
                    }}
                  >
                    {displayAnswer}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {queryResult && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>总行数: {queryResult.total_rows || tableData.length}</span>
                <span>返回行数: {queryResult.returned_rows || tableData.length}</span>
                {queryResult.source && <span>数据源: {queryResult.source}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
