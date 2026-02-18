import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Lightbulb,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Sparkles,
} from "lucide-react";
import { api } from "../services/api";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Textarea } from "./ui/textarea";

interface StreamState {
  answer: string;
  statusMessages: string[];
  isStreaming: boolean;
}

interface QueryPanelProps {
  selectedTable?: string | null;
  onQueryResult?: (result: any) => void;
  isLeftPanelCollapsed?: boolean;
  onToggleLeftPanel?: () => void;
  onStreamStateChange?: (state: StreamState) => void;
}

const EXAMPLE_QUESTIONS = [
  "销售额最高的前10个产品",
  "好评率超过95%且销量过万的产品",
  "各品牌在智能手机分类中的销量对比",
  "折扣率>30%且价格<5000的性价比产品",
];

export function QueryPanel({
  selectedTable,
  onQueryResult,
  isLeftPanelCollapsed = false,
  onToggleLeftPanel,
  onStreamStateChange,
}: QueryPanelProps) {
  const [query, setQuery] = useState("显示前10条数据");
  const [showSQL, setShowSQL] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [generatedSQL, setGeneratedSQL] = useState("");
  const [reasoning, setReasoning] = useState<string[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [streamedAnswer, setStreamedAnswer] = useState("");
  const [streamProgress, setStreamProgress] = useState<string[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (!contentRef.current) return;
    contentRef.current.scrollTo({
      top: contentRef.current.scrollHeight,
      behavior,
    });
  };

  useEffect(() => {
    onStreamStateChange?.({
      answer: streamedAnswer,
      statusMessages: streamProgress,
      isStreaming: isQuerying,
    });
  }, [isQuerying, onStreamStateChange, streamProgress, streamedAnswer]);

  useEffect(() => {
    if (!selectedTable) return;

    if (selectedTable.startsWith("file_")) {
      setSelectedFileId(selectedTable.replace("file_", ""));
      setQuery("显示前10条数据");
      return;
    }

    setSelectedFileId(null);
    setQuery(`显示${selectedTable}表的前10条数据`);
  }, [selectedTable]);

  const handleRun = async () => {
    if (!selectedTable) {
      alert("请先在左侧选择一个数据表或上传文件");
      return;
    }
    if (!query.trim()) {
      alert("请输入查询问题");
      return;
    }

    setIsQuerying(true);
    setStreamedAnswer("");
    setStreamProgress([]);
    requestAnimationFrame(() => scrollToBottom("auto"));

    try {
      const request: any = { query };
      if (selectedFileId) {
        request.file_id = selectedFileId;
      } else {
        request.table_name = selectedTable;
      }

      const result = await api.queryDataStream(request, {
        onStatus: (message) => {
          if (!message) return;
          setStreamProgress((prev) => {
            const next = [...prev, message];
            return next.slice(-5);
          });
          requestAnimationFrame(() => scrollToBottom());
        },
        onAnswerDelta: (delta) => {
          if (!delta) return;
          setStreamedAnswer((prev) => prev + delta);
        },
      });

      if (!result) {
        throw new Error("未收到查询结果");
      }

      if (result.sql) {
        setGeneratedSQL(result.sql);
        setShowSQL(true);
      }
      if (result.reasoning && Array.isArray(result.reasoning)) {
        setReasoning(result.reasoning);
        setShowReasoning(true);
      }
      onQueryResult?.(result);
    } catch (error) {
      console.error("流式查询失败，降级为普通查询:", error);
      try {
        const request: any = { query };
        if (selectedFileId) {
          request.file_id = selectedFileId;
        } else {
          request.table_name = selectedTable;
        }

        const result: any = await api.queryData(request);
        if (result.sql) {
          setGeneratedSQL(result.sql);
          setShowSQL(true);
        }
        if (result.reasoning && Array.isArray(result.reasoning)) {
          setReasoning(result.reasoning);
          setShowReasoning(true);
        }
        onQueryResult?.(result);
      } catch (fallbackError) {
        console.error("查询失败:", fallbackError);
        alert(`查询失败: ${fallbackError}`);
      }
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/40 flex-shrink-0 bg-gradient-to-r from-cyan-500/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              onClick={onToggleLeftPanel}
              className="w-8 h-8 rounded-lg bg-secondary/60 hover:bg-secondary border border-border/50 transition-all duration-200 group"
              title={isLeftPanelCollapsed ? "展开数据源面板" : "折叠数据源面板"}
            >
              {isLeftPanelCollapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              ) : (
                <PanelLeftClose className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              )}
            </Button>
            <h2 className="text-cyan-600 dark:text-cyan-400 font-semibold">智能问答区</h2>
          </div>
          {selectedTable && (
            <span className="text-xs text-muted-foreground">
              当前表: <span className="text-cyan-600 dark:text-cyan-400">{selectedTable}</span>
            </span>
          )}
        </div>
      </div>

      <div ref={contentRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="px-6 py-4 space-y-4">
          {generatedSQL && (
            <Collapsible open={showSQL} onOpenChange={setShowSQL}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-3 bg-card/50 hover:bg-card/80 rounded-xl border border-purple-500/20 hover:border-purple-500/40 transition-colors">
                {showSQL ? <ChevronDown className="w-4 h-4 text-purple-400" /> : <ChevronRight className="w-4 h-4 text-purple-400" />}
                <FileText className="w-4 h-4 text-purple-400" />
                <span className="text-purple-600 dark:text-purple-300 text-sm font-medium">查看 SQL</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="bg-muted/40 rounded-xl border border-border/50 p-4 font-mono text-xs overflow-x-auto max-h-80 overflow-y-auto">
                  <pre className="text-foreground/80 leading-relaxed whitespace-pre-wrap">{generatedSQL}</pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {reasoning.length > 0 && (
            <Collapsible open={showReasoning} onOpenChange={setShowReasoning}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-3 bg-card/50 hover:bg-card/80 rounded-xl border border-cyan-500/20 hover:border-cyan-500/40 transition-colors">
                {showReasoning ? <ChevronDown className="w-4 h-4 text-cyan-400" /> : <ChevronRight className="w-4 h-4 text-cyan-400" />}
                <Lightbulb className="w-4 h-4 text-cyan-400" />
                <span className="text-cyan-600 dark:text-cyan-300 text-sm font-medium">生成思路</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="bg-muted/40 rounded-xl border border-border/50 p-4">
                  <div className="space-y-2">
                    {reasoning.map((step, idx) => (
                      <div key={idx} className="flex gap-3 text-xs">
                        <span className="text-cyan-600 dark:text-cyan-400 font-mono flex-shrink-0">{idx + 1}.</span>
                        <span className="text-foreground/80">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {isQuerying && streamProgress.length > 0 && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-1.5">
              {streamProgress.map((message, idx) => (
                <p key={`${message}-${idx}`} className="text-xs text-cyan-600 dark:text-cyan-300">
                  {message}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border/40 p-6 flex-shrink-0 bg-background/50">
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-3">💡 示例问答</p>
            <div className="grid grid-cols-2 gap-2">
              {EXAMPLE_QUESTIONS.map((question) => (
                <Button
                  key={question}
                  size="sm"
                  onClick={() => setQuery(question)}
                  disabled={!selectedTable}
                  className="text-xs bg-secondary/60 hover:bg-secondary text-foreground/80 border border-border/40 justify-start transition-colors rounded-lg"
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>

          <Textarea
            placeholder={selectedTable ? `输入您的问题，例如：${selectedTable}表中销量最高的产品是什么？` : "请先在左侧选择一个数据表..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!selectedTable}
            className="min-h-[100px] bg-card/70 border-border/50 text-foreground placeholder-muted-foreground resize-none focus-visible:ring-cyan-500/30 rounded-xl"
          />

          <div className="flex justify-end items-center">
            <Button
              onClick={handleRun}
              disabled={!selectedTable || !query.trim() || isQuerying}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 rounded-xl"
            >
              {isQuerying ? (
                <>
                  <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
                  正在查询...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  执行查询
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
