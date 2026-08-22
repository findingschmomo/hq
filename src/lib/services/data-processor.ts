// src/lib/services/data-processor.ts

import { PrismaClient } from '@prisma/client';
// NOTE: Initialize Prisma client inside a singleton pattern to avoid connection pooling issues.
// Since we are writing this file, we must assume the database connection is configured via DATABASE_URL env var.
const prisma = const prisma = new PrismaClient();;

/**
 * Core service for analyzing and extracting structured operational data from the shared Postgres message bus.
 * This service abstracts interactions with the Prisma ORM for key domain models.
 */
export const dataProcessor = {
    /**
     * Retrieves the last N recorded events from the AgentEvent log, useful for monitoring errors or status changes.
     * @param limit The number of recent events to fetch.
     * @returns A promise resolving to an array of AgentEvent records.
     */
    async fetchLastEvents(limit: number = 5): Promise<Array<any>> {
        try {
            const events = await prisma.agentEvent.findMany({
                take: limit,
                orderBy: { createdAt: 'desc' },
            });
            console.log(`[DataProcessor] Successfully fetched ${events.length} AgentEvents.`);
            return events;
        } catch (error) {
            console.error("[DataProcessor] Error fetching last events:", error);
            // Return empty array on failure rather than crashing the UI.
            return [];
        }
    },

    /**
     * Retrieves general, frequently changing metrics stored in the DataStore, like global KPIs or system status flags.
     * @param keys Array of specific keys to fetch (e.g., ['system:is_online', 'system:total_tasks_processed']).
     * @returns A promise resolving to a map of key: data object.
     */
    async fetchSystemMetrics(keys: string[]): Promise<Record<string, any>> {
        try {
            const metrics = await prisma.dataStore.findMany({
                where: {
                    key: {
                        in: keys
                    }
                },
                select: {
                    key: true,
                    data: true,
                    updatedAt: true,
                },
            });

            const result: Record<string, any> = {};
            metrics.forEach(metric => {
                result[metric.key] = {
                    data: metric.data,
                    updatedAt: metric.updatedAt,
                };
            });
            console.log(`[DataProcessor] Successfully fetched ${Object.keys(result).length} system metrics.`);
            return result;
        } catch (error) {
            console.error("[DataProcessor] Error fetching system metrics:", error);
            return {};
        }
    },

    /**
     * Tries to locate the last recorded state update for a specific entity/system component.
     * (Placeholder for more complex business logic, e.g., finding the last time 'Client X' was updated).
     * @param entityKey e.g., 'client:abc123def'.
     * @returns A promise resolving to the most recent relevant record.
     */
    async getLastSystemState(entityKey: string): Promise<{ lastUpdate: Date | null, data: any | null }> {
        // TODO: Implement specific read logic here based on domain knowledge.
        // For now, we'll simulate calling a specific model based on the key format.
        // Example: If key starts with 'client:', query ClientPulseClient by external identifier.
        
        console.warn(`[DataProcessor] Placeholder: Implementing read logic for entity key: ${entityKey}. Needs refinement.`);
        return { lastUpdate: null, data: null };
    },

    /**
     * Disconnects the Prisma client gracefully. Essential for clean shutdowns.
     */
    async disconnect() {
        await prisma.$disconnect();
        console.log("[DataProcessor] Cleanly disconnected Prisma client.");
    }
};