import React, { useState } from "react";
import { DataSourcePanel } from "./components/DataSourcePanel";
import { QueryPanel } from "./components/QueryPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { ModeToggle } from "./components/ModeToggle";

export default function App() {
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [queryResult, setQueryResult] = useState<any>(null);

    const handleTableSelect = (tableName: string) => {
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
            <div className="h-16 border-b-2 border-border bg-background flex items-center px-6 flex-shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 border-2 border-border bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        NL
                    </div>
                    <h1 className="text-lg font-bold tracking-tight uppercase">
                        NL2SQL Data Analyst
                    </h1>
                </div>
                <div className="ml-auto flex items-center gap-4">
                    {selectedTable && (
                        <div className="text-sm border-2 border-border px-3 py-1 bg-secondary text-secondary-foreground font-medium">
                            TABLE: {selectedTable}
                        </div>
                    )}
                    <ModeToggle />
                </div>
            </div>

            {/* Main Content - Three Column Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel - Data Sources */}
                <div className="w-[280px] flex-shrink-0 border-r-2 border-border bg-background p-4">
                    <DataSourcePanel onTableSelect={handleTableSelect} />
                </div>

                {/* Center Panel - Query Area */}
                <div className="flex-1 min-w-0 bg-background p-4">
                    <QueryPanel
                        selectedTable={selectedTable}
                        onQueryResult={handleQueryResult}
                    />
                </div>

                {/* Right Panel - Results */}
                <div className="w-[480px] flex-shrink-0 border-l-2 border-border bg-background p-4">
                    <ResultsPanel queryResult={queryResult} />
                </div>
            </div>

            <Toaster />
        </div>
    );
}
