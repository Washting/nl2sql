import { useState } from "react";
import { DataSourcePanel } from "./components/DataSourcePanel";
import { QueryPanel } from "./components/QueryPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { ModeToggle } from "./components/ModeToggle";

export default function App() {
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [queryResult, setQueryResult] = useState<any>(null);
    const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
    const [streamingAnswer, setStreamingAnswer] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);

    const handleTableSelect = (tableName: string | null) => {
        setSelectedTable(tableName);
        console.log("选中表:", tableName);
    };

    const handleQueryResult = (result: any) => {
        setQueryResult(result);
        if (result.success) {
            toast.success("查询执行成功", {
                description: `返回 ${result.returned_rows || result.data?.length || 0} 条结果`,
            });
        }
    };

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground transition-colors duration-300 font-mono">
            {/* Header */}
            <div className="h-16 border-b border-border/60 bg-background/80 backdrop-blur-md flex items-center px-6 flex-shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 border border-border/70 bg-primary text-primary-foreground rounded-xl flex items-center justify-center font-bold shadow-sm">
                        NL
                    </div>
                    <h1 className="text-lg font-semibold tracking-tight uppercase">
                        NL2SQL Data Analyst
                    </h1>
                </div>
                <div className="ml-auto flex items-center gap-4">
                    <ModeToggle />
                </div>
            </div>

            {/* Main Content - Three Column Layout */}
            <div className="flex-1 flex overflow-hidden p-3 gap-3 bg-gradient-to-br from-background via-background to-muted/20">
                {/* Left Panel - Data Sources */}
                <div
                    className={`relative flex-shrink-0 border border-border/60 rounded-2xl bg-card transition-all duration-300 ease-out overflow-hidden ${
                        isLeftPanelCollapsed ? 'w-[56px]' : 'w-[280px]'
                    }`}
                >
                    <DataSourcePanel
                        onTableSelect={handleTableSelect}
                        isCollapsed={isLeftPanelCollapsed}
                        selectedTable={selectedTable}
                    />
                </div>

                {/* Center Panel - Query Area */}
                <div className="flex-1 min-w-0 border border-border/60 rounded-2xl bg-card p-0 overflow-hidden">
                    <QueryPanel
                        selectedTable={selectedTable}
                        onQueryResult={handleQueryResult}
                        isLeftPanelCollapsed={isLeftPanelCollapsed}
                        onToggleLeftPanel={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
                        onStreamStateChange={(state) => {
                            setStreamingAnswer(state.answer);
                            setIsStreaming(state.isStreaming);
                        }}
                    />
                </div>

                {/* Right Panel - Results */}
                <div className="w-[460px] xl:w-[500px] flex-shrink-0 border border-border/60 rounded-2xl bg-card overflow-hidden">
                    <ResultsPanel
                        queryResult={queryResult}
                        streamingAnswer={streamingAnswer}
                        isStreaming={isStreaming}
                    />
                </div>
            </div>

            <Toaster position="top-center" />
        </div>
    );
}
