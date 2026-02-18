import { useState, useEffect, Fragment } from 'react';
import { ChevronRight, ChevronDown, Database, Table2, Upload, Search, FileSpreadsheet, Trash2 } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Popconfirm } from './ui/popconfirm';
import { api } from '../services/api';

interface TableNode {
  name: string;
  type: 'schema' | 'table' | 'column';
  children?: TableNode[];
  tableName?: string; // 实际的数据库表名
  source?: DataSource['source'];
  metadata?: {
    fields?: number;
    rows?: number;
    sample?: string;
  };
}

interface DataSource {
  name: string;
  table: string;
  rows: number;
  columns: string[];
  description: string;
  source: string;
}

interface DataSourcePanelProps {
  onTableSelect?: (tableName: string | null) => void;
  isCollapsed?: boolean;
  selectedTable?: string | null;
}

export function DataSourcePanel({ onTableSelect, isCollapsed = false, selectedTable: externalSelectedTable }: DataSourcePanelProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['上传的文件']));
  const [searchQuery, setSearchQuery] = useState('');
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [hoveringDeleteTable, setHoveringDeleteTable] = useState<string | null>(null);
  const [activePopconfirmTable, setActivePopconfirmTable] = useState<string | null>(null);

  useEffect(() => {
    loadDataSources();
  }, []);

  const loadDataSources = async () => {
    try {
      setLoading(true);
      const response = await api.getDataSources();
      console.log('加载的数据源:', response);
      setDataSources(response.sources || []);
    } catch (error) {
      console.error('加载数据源失败:', error);
      setDataSources([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = (nodeName: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeName)) {
      newExpanded.delete(nodeName);
    } else {
      newExpanded.add(nodeName);
    }
    setExpandedNodes(newExpanded);
  };

  const convertToTableNodes = (sources: DataSource[]): TableNode[] => {
    const toTableNode = (source: DataSource): TableNode => ({
      name: source.name,
      type: 'table' as const,
      tableName: source.table, // 实际的数据库表名
      source: source.source,
      metadata: {
        fields: Array.isArray(source.columns) ? source.columns.length : 0,
        rows: source.rows || 0,
        sample: Array.isArray(source.columns)
          ? source.columns.slice(0, 3).join(', ') + (source.columns.length > 3 ? '...' : '')
          : ''
      },
      children: Array.isArray(source.columns) ? source.columns.map(column => ({
        name: column,
        type: 'column' as const
      })) : []
    });

    const databaseTables = sources
      .filter(source => source.source !== 'upload')
      .map(toTableNode);
    const uploadedTables = sources
      .filter(source => source.source === 'upload')
      .map(toTableNode);

    return [
      ...databaseTables,
      ...(uploadedTables.length > 0
        ? [{
          name: '上传的文件',
          type: 'schema' as const,
          children: uploadedTables
        }]
        : [])
    ];
  };

  const handleDeleteTable = async (tableName: string) => {
    try {
      const result = await api.deleteTable(tableName);
      if (!result.success) {
        throw new Error(result.error || '删除失败');
      }

      if ((externalSelectedTable || selectedTable) === tableName) {
        setSelectedTable(null);
        onTableSelect?.(null);
      }
      await loadDataSources();
    } catch (error) {
      console.error('删除表失败:', error);
      alert(`删除表失败: ${error}`);
    } finally {
      setActivePopconfirmTable((prev) => (prev === tableName ? null : prev));
      setHoveringDeleteTable((prev) => (prev === tableName ? null : prev));
    }
  };

  const filteredDataSources = convertToTableNodes(dataSources).filter(ds =>
    ds.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ds.children?.some(table => table.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const renderTreeNode = (node: TableNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.name);
    const hasChildren = node.children && node.children.length > 0;

    const icon = node.type === 'schema' ? (
      <Database className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
    ) : node.type === 'table' ? (
      <Table2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
    ) : (
      <div className="w-1.5 h-1.5 rounded-full bg-purple-500/60 dark:bg-purple-400/60 ml-1" />
    );

    const handleClick = () => {
      console.log('点击节点:', node.name, '类型:', node.type, '有子节点:', hasChildren);

      // 如果是table节点，优先选择表格
      if (node.type === 'table') {
        const actualTableName = node.tableName || node.name;
        setSelectedTable(actualTableName);
        console.log('选中表格:', actualTableName);

        if (onTableSelect) {
          console.log('传递表名:', actualTableName);
          onTableSelect(actualTableName);
        }

        // 如果table有子节点（字段），也展开/折叠
        if (hasChildren) {
          toggleNode(node.name);
        }
      } else if (hasChildren) {
        // schema节点只展开/折叠
        toggleNode(node.name);
      }
    };

    const content = (
      <div
        key={node.name}
        style={{ paddingLeft: `${level * 12}px` }}
        className="group"
      >
        <div
          className={`flex items-center gap-2 px-2 py-1.5 hover:bg-secondary/50 cursor-pointer rounded-md transition-colors ${node.type === 'table' && selectedTable === (node.tableName || node.name) ? 'bg-cyan-500/10 border-l-2 border-cyan-500' : ''
            }`}
          onClick={handleClick}
        >
          {hasChildren && (
            isExpanded ?
              <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" /> :
              <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          )}
          {!hasChildren && <div className="w-3 flex-shrink-0" />}
          {icon}
          <span className="text-foreground/90 dark:text-foreground/80 text-xs truncate">{node.name}</span>
          {node.type === 'table' && node.source !== 'upload' && node.tableName && (
            <Popconfirm
              title={`确认删除数据表「${node.name}」？`}
              description="此操作不可撤销。"
              confirmText="继续删除"
              secondConfirmTitle="二次确认"
              secondConfirmDescription={`删除后将永久丢失「${node.name}」数据。`}
              secondConfirmText="确认删除"
              onConfirm={() => handleDeleteTable(node.tableName!)}
              onOpenChange={(open) => {
                if (open) {
                  setActivePopconfirmTable(node.tableName!);
                  return;
                }
                setActivePopconfirmTable((prev) =>
                  prev === node.tableName ? null : prev,
                );
                setHoveringDeleteTable((prev) =>
                  prev === node.tableName ? null : prev,
                );
              }}
            >
              <Button
                variant="ghost"
                className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-events-none group-hover:pointer-events-auto focus-visible:pointer-events-auto transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onMouseEnter={() => {
                  setHoveringDeleteTable(node.tableName || null);
                }}
                onMouseLeave={() => {
                  if (activePopconfirmTable === node.tableName) return;
                  setHoveringDeleteTable((prev) =>
                    prev === (node.tableName || null) ? null : prev,
                  );
                }}
                title="删除数据表"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </Popconfirm>
          )}
        </div>
      </div>
    );

    if (node.type === 'table' && node.metadata) {
      const shouldDisableHoverCard =
        !!node.tableName &&
        (hoveringDeleteTable === node.tableName ||
          activePopconfirmTable === node.tableName);

      if (shouldDisableHoverCard) {
        return (
          <Fragment key={node.name}>
            {content}
            {isExpanded && node.children?.map(child => renderTreeNode(child, level + 1))}
          </Fragment>
        );
      }

      return (
        <Fragment key={node.name}>
          <HoverCard openDelay={300}>
            <HoverCardTrigger asChild>
              {content}
            </HoverCardTrigger>
            <HoverCardContent side="right" className="w-80 bg-popover border-cyan-500/30 text-popover-foreground">
              <div className="space-y-2">
                <p className="text-xs text-cyan-500 dark:text-cyan-400">表详情</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">字段数:</span>
                    <span className="ml-2 text-foreground">{node.metadata.fields}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">行数:</span>
                    <span className="ml-2 text-foreground">{node.metadata.rows?.toLocaleString()}</span>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">示例字段:</p>
                  <p className="text-purple-500 dark:text-purple-300 text-xs font-mono mt-1">{node.metadata.sample}</p>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
          {isExpanded && node.children?.map(child => renderTreeNode(child, level + 1))}
        </Fragment>
      );
    }

    return (
      <Fragment key={node.name}>
        {content}
        {isExpanded && node.children?.map(child => renderTreeNode(child, level + 1))}
      </Fragment>
    );
  };

  // 获取所有表格用于折叠视图
  const getAllTables = (): Array<{ name: string; tableName: string; source: string; icon: React.ReactNode }> => {
    const tables: Array<{ name: string; tableName: string; source: string; icon: React.ReactNode }> = [];

    dataSources.forEach(source => {
      tables.push({
        name: source.name,
        tableName: source.table,
        source: source.source,
        icon: source.source === 'upload' ? <FileSpreadsheet className="w-5 h-5" /> : <Table2 className="w-5 h-5" />
      });
    });

    return tables;
  };

  const allTables = getAllTables();
  const currentSelectedTable = externalSelectedTable || selectedTable;

  // 折叠视图
  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={300}>
        <div className="h-full flex flex-col bg-background overflow-hidden py-4 items-center gap-3">
          {loading ? (
            <div className="text-muted-foreground">
              <Database className="w-5 h-5 animate-pulse" />
            </div>
          ) : (
            <>
              {allTables.map((table) => {
                const isSelected = currentSelectedTable === table.tableName;
                return (
                  <Tooltip key={table.tableName}>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => {
                          if (onTableSelect) {
                            onTableSelect(table.tableName);
                            setSelectedTable(table.tableName);
                          }
                        }}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-500 border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20'
                            : 'bg-secondary/50 text-muted-foreground hover:bg-primary/20 hover:text-primary border border-border/30'
                        }`}
                      >
                        {table.icon}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-popover border-border/50 text-foreground">
                      <p className="text-sm font-medium">{table.name}</p>
                      <p className="text-xs text-muted-foreground">{table.source === 'upload' ? '上传文件' : '数据库表'}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}

              {/* 上传按钮 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.csv,.xlsx,.xls';
                      input.onchange = async (e: any) => {
                        const file = e.target.files[0];
                        if (file) {
                          try {
                            await api.uploadFile(file);
                            loadDataSources();
                          } catch (error) {
                            console.error('上传失败:', error);
                            alert('上传失败: ' + error);
                          }
                        }
                      };
                      input.click();
                    }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20 hover:border-green-500/50"
                  >
                    <Upload className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-popover border-border/50 text-foreground">
                  <p className="text-sm">上传文件</p>
                  <p className="text-xs text-muted-foreground">CSV / Excel</p>
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // 展开视图
  if (loading) {
    return (
      <div className="h-full flex flex-col bg-background overflow-hidden">
        <div className="px-6 py-3 border-b border-border/20">
          <h2 className="text-cyan-500 dark:text-cyan-400">数据源</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border/20 flex-shrink-0">
        <h2 className="text-cyan-500 dark:text-cyan-400 font-medium text-sm">数据源与文件</h2>
      </div>

      {/* Search */}
      <div className="px-3 py-3 border-b border-border/20">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索表或段..."
            value={searchQuery}
            type="search"
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-secondary/50 dark:bg-secondary border-border/20 text-foreground placeholder:text-muted-foreground text-sm rounded-lg"
          />
        </div>
      </div>

      {/* Data Sources List */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2">
        {/* Table Tree */}
        <div className="space-y-1">
          {filteredDataSources.length > 0 ? (
            filteredDataSources.map(ds => renderTreeNode(ds, 0))
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-xs">暂无数据源</p>
              <p className="text-muted-foreground/60 text-xs mt-1">请上传文件或连接数据库</p>
            </div>
          )}
        </div>

        {/* Upload Section */}
        <div className="mt-4 pt-4 border-t border-border/20">
          <div className="px-2">
            <p className="text-xs text-muted-foreground mb-2 font-medium">已上传文件</p>
            <div className="space-y-1 mb-2">
              {dataSources.filter(ds => ds.source === 'upload').map((file, idx) => {
                // 使用 table 字段（file_{file_id}）作为选中标识
                const tableName = file.table || `file_${(file as any).file_id}` || file.name;
                const isSelected = selectedTable === tableName;

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (onTableSelect) {
                        onTableSelect(tableName);
                        setSelectedTable(tableName);
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-2 bg-secondary/50 dark:bg-secondary rounded-lg border border-border/20 cursor-pointer hover:border-cyan-500/20 hover:bg-cyan-500/5 transition-colors ${isSelected ? 'border-cyan-500/40 bg-cyan-500/10' : ''
                      }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-green-500 dark:text-green-400 flex-shrink-0" />
                    <span className="text-xs text-foreground/90 dark:text-foreground/80 flex-1 truncate">{file.name}</span>
                  </div>
                );
              })}
            </div>
            <Button
              variant="outline"
              className="w-full h-9 bg-background hover:bg-secondary border-border text-foreground hover:text-foreground text-xs font-normal"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv,.xlsx,.xls';
                input.onchange = async (e: any) => {
                  const file = e.target.files[0];
                  if (file) {
                    try {
                      await api.uploadFile(file);
                      loadDataSources();
                    } catch (error) {
                      console.error('上传失败:', error);
                      alert('上传失败: ' + error);
                    }
                  }
                };
                input.click();
              }}
            >
              <Upload className="w-3.5 h-3.5 mr-2 text-current" />
              上传文件 (CSV/Excel)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
