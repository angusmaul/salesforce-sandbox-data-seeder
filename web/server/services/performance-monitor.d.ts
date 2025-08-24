import { EventEmitter } from 'events';
export interface PerformanceMetrics {
    timestamp: number;
    operation: string;
    operationId: string;
    duration: number;
    success: boolean;
    error?: string;
    metadata?: {
        tokenUsage?: {
            inputTokens: number;
            outputTokens: number;
            totalTokens: number;
        };
        modelUsed?: string;
        cacheHit?: boolean;
        batchSize?: number;
        requestSize?: number;
        responseSize?: number;
    };
}
export interface CostMetrics {
    operation: string;
    tokenCost: number;
    estimatedUSDCost: number;
    timestamp: number;
}
export interface SystemMetrics {
    cpuUsage: number;
    memoryUsage: number;
    heapUsed: number;
    heapTotal: number;
    timestamp: number;
}
export interface AggregatedMetrics {
    timeWindow: string;
    operations: {
        [operation: string]: {
            count: number;
            totalDuration: number;
            avgDuration: number;
            successRate: number;
            totalTokens: number;
            totalCost: number;
            cacheHitRate: number;
        };
    };
    system: {
        avgCpuUsage: number;
        avgMemoryUsage: number;
        peakMemoryUsage: number;
    };
    errors: Array<{
        operation: string;
        error: string;
        count: number;
        lastOccurrence: number;
    }>;
}
export interface BudgetAlert {
    type: 'warning' | 'critical' | 'exceeded';
    message: string;
    currentCost: number;
    budgetLimit: number;
    timestamp: number;
}
interface PerformanceConfig {
    maxMetricsHistory: number;
    metricsRetentionMs: number;
    budgetThresholds: {
        warning: number;
        critical: number;
        daily: number;
        monthly: number;
    };
    systemMetricsIntervalMs: number;
    alertCooldownMs: number;
}
export declare class PerformanceMonitor extends EventEmitter {
    private metrics;
    private costMetrics;
    private systemMetrics;
    private alerts;
    private config;
    private systemMetricsTimer;
    private lastAlerts;
    private readonly CLAUDE_PRICING;
    constructor(config?: Partial<PerformanceConfig>);
    /**
     * Record AI operation performance metrics
     */
    recordOperation(metrics: Omit<PerformanceMetrics, 'timestamp' | 'operationId'>): string;
    /**
     * Record batch operation metrics
     */
    recordBatchOperation(batchId: string, operations: Array<Omit<PerformanceMetrics, 'timestamp' | 'operationId'>>): string[];
    /**
     * Get performance metrics for a time window
     */
    getMetrics(timeWindowMs?: number): AggregatedMetrics;
    /**
     * Get cost metrics and budget status
     */
    getCostMetrics(): {
        daily: {
            cost: number;
            tokens: number;
            operations: number;
            budget: number;
            remaining: number;
            percentUsed: number;
        };
        monthly: {
            cost: number;
            tokens: number;
            operations: number;
            budget: number;
            remaining: number;
            percentUsed: number;
        };
        alerts: BudgetAlert[];
        breakdown: Array<{
            operation: string;
            cost: number;
            tokens: number;
            avgCostPerOperation: number;
        }>;
    };
    /**
     * Get system performance metrics
     */
    getSystemMetrics(timeWindowMs?: number): SystemMetrics[];
    /**
     * Get performance recommendations
     */
    getRecommendations(): string[];
    /**
     * Calculate cost for token usage
     */
    private calculateCost;
    /**
     * Check and generate budget alerts
     */
    private checkBudgetAlerts;
    /**
     * Generate budget alert with cooldown
     */
    private generateAlert;
    /**
     * Start system metrics collection
     */
    private startSystemMonitoring;
    /**
     * Start cleanup timer for old metrics
     */
    private startCleanupTimer;
    /**
     * Clean up old metrics to prevent memory leaks
     */
    private cleanupOldMetrics;
    /**
     * Maintain history size limits
     */
    private maintainHistoryLimits;
    /**
     * Generate unique operation ID
     */
    private generateOperationId;
    /**
     * Format time window for display
     */
    private formatTimeWindow;
    /**
     * Shutdown monitor
     */
    shutdown(): void;
}
export declare function getPerformanceMonitor(config?: Partial<PerformanceConfig>): PerformanceMonitor;
export {};
