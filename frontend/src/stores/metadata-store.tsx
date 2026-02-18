import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type SourceRecord = {
  table: string;
  table_comment_cn?: string;
  column_comments?: Record<string, string>;
  sample_questions?: string[];
};

type MetadataState = {
  tableNameMap: Record<string, string>;
  columnNameMap: Record<string, Record<string, string>>;
  sampleQuestionsMap: Record<string, string[]>;
};

type MetadataStore = MetadataState & {
  upsertFromSources: (sources: SourceRecord[]) => void;
  getTableDisplayName: (tableName?: string | null) => string;
  getColumnDisplayName: (tableName: string | null | undefined, columnName: string) => string;
  getSampleQuestions: (tableName?: string | null) => string[];
};

const MetadataStoreContext = createContext<MetadataStore | undefined>(undefined);

export function MetadataStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MetadataState>({
    tableNameMap: {},
    columnNameMap: {},
    sampleQuestionsMap: {},
  });

  const upsertFromSources = useCallback((sources: SourceRecord[]) => {
    if (!Array.isArray(sources) || sources.length === 0) return;
    setState((prev) => {
      const nextTableNameMap = { ...prev.tableNameMap };
      const nextColumnNameMap = { ...prev.columnNameMap };
      const nextSampleQuestionsMap = { ...prev.sampleQuestionsMap };

      for (const source of sources) {
        if (!source?.table) continue;
        if (source.table_comment_cn) {
          nextTableNameMap[source.table] = source.table_comment_cn;
        }
        if (source.column_comments && typeof source.column_comments === "object") {
          nextColumnNameMap[source.table] = {
            ...(nextColumnNameMap[source.table] || {}),
            ...source.column_comments,
          };
        }
        if (Array.isArray(source.sample_questions)) {
          nextSampleQuestionsMap[source.table] = source.sample_questions.filter(
            (q) => typeof q === "string" && q.trim().length > 0,
          );
        }
      }

      return {
        tableNameMap: nextTableNameMap,
        columnNameMap: nextColumnNameMap,
        sampleQuestionsMap: nextSampleQuestionsMap,
      };
    });
  }, []);

  const getTableDisplayName = useCallback(
    (tableName?: string | null) => {
      if (!tableName) return "";
      return state.tableNameMap[tableName] || tableName;
    },
    [state.tableNameMap],
  );

  const getColumnDisplayName = useCallback(
    (tableName: string | null | undefined, columnName: string) => {
      if (!tableName) return columnName;
      return state.columnNameMap[tableName]?.[columnName] || columnName;
    },
    [state.columnNameMap],
  );

  const getSampleQuestions = useCallback(
    (tableName?: string | null) => {
      if (!tableName) return [];
      return state.sampleQuestionsMap[tableName] || [];
    },
    [state.sampleQuestionsMap],
  );

  const value = useMemo(
    () => ({
      ...state,
      upsertFromSources,
      getTableDisplayName,
      getColumnDisplayName,
      getSampleQuestions,
    }),
    [state, upsertFromSources, getTableDisplayName, getColumnDisplayName, getSampleQuestions],
  );

  return <MetadataStoreContext.Provider value={value}>{children}</MetadataStoreContext.Provider>;
}

export function useMetadataStore() {
  const context = useContext(MetadataStoreContext);
  if (!context) {
    throw new Error("useMetadataStore must be used within MetadataStoreProvider");
  }
  return context;
}
