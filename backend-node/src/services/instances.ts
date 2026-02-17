import { DataManager } from "./DataManager";
import { SQLAgentManager } from "./SQLAgent";

// Global singleton instances
let dataManagerInstance: DataManager;
let sqlAgentInstance: SQLAgentManager;

export function setDataManager(instance: DataManager) {
    dataManagerInstance = instance;
}

export function setSQLAgent(instance: SQLAgentManager) {
    sqlAgentInstance = instance;
}

// Export getters for the instances
export function getDataManager(): DataManager {
    if (!dataManagerInstance) {
        throw new Error(
            "DataManager not initialized. Call setDataManager() first.",
        );
    }
    return dataManagerInstance;
}

export function getSQLAgent(): SQLAgentManager {
    if (!sqlAgentInstance) {
        throw new Error("SQLAgent not initialized. Call setSQLAgent() first.");
    }
    return sqlAgentInstance;
}

// Export backward-compatible singletons
export { dataManagerInstance as dataManager };
export { sqlAgentInstance as sqlAgentManager };
