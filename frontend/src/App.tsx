import { useState } from "react";
import { DataSourcePanel } from "./components/DataSourcePanel";
import { QueryPanel } from "./components/QueryPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { ModeToggle } from "./components/ModeToggle";
import { Loader2 } from "lucide-react";

export default function App() {
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [queryResult, setQueryResult] = useState<any>(null);
    const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
    const [streamingAnswer, setStreamingAnswer] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadingFilename, setUploadingFilename] = useState<string>("");
    const [sampleQuestions, setSampleQuestions] = useState<string[]>([]);

    const handleTableSelect = (tableName: string | null) => {
        setSelectedTable(tableName);
        if (!tableName) {
            setSampleQuestions([]);
        }
        console.log("选中表:", tableName);
    };

    const handleQueryResult = (result: any) => {
        setQueryResult(result);
        if (result.success) {
            toast.success("查询执行成功");
        }
    };

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground transition-colors duration-300 font-mono">
            {/* Header */}
            <div className="h-16 border-b border-border/60 bg-background/80 backdrop-blur-md flex items-center px-6 flex-shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 border border-border/70 bg-primary text-primary-foreground rounded-xl flex items-center justify-center font-bold shadow-sm">
                        A:L
                    </div>
                    <h1 className="text-lg font-semibold tracking-tight uppercase">
                        AI SQL  Assistant
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
                        onSampleQuestionsChange={setSampleQuestions}
                        isCollapsed={isLeftPanelCollapsed}
                        selectedTable={selectedTable}
                        onUploadStateChange={(uploading, filename) => {
                            setIsUploading(uploading);
                            if (uploading && filename) {
                                setUploadingFilename(filename);
                            }
                            if (!uploading) {
                                setUploadingFilename("");
                            }
                        }}
                    />
                </div>

                {/* Center Panel - Query Area */}
                <div className="flex-1 min-w-0 border border-border/60 rounded-2xl bg-card p-0 overflow-hidden">
                    <QueryPanel
                        selectedTable={selectedTable}
                        sampleQuestions={sampleQuestions}
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

            {isUploading && (
                <div className="fixed inset-0 z-50 bg-background/65 backdrop-blur-[2px] flex items-center justify-center">
                    <div className="rounded-xl border border-border bg-card px-6 py-4 shadow-xl flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
                        <div className="text-sm text-foreground">
                            正在导入文件{uploadingFilename ? `：${uploadingFilename}` : "..."}
                        </div>
                    </div>
                </div>
            )}

            <Toaster position="top-center" />
        </div>
    );
}
