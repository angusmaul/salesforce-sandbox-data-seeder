"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMonitor = void 0;
exports.getPerformanceMonitor = getPerformanceMonitor;
// Performance Monitor Service - Comprehensive AI operation metrics and cost tracking
const events_1 = require("events");
class PerformanceMonitor extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.metrics = [];
        this.costMetrics = [];
        this.systemMetrics = [];
        this.alerts = [];
        this.config = {
            maxMetricsHistory: 10000,
            metricsRetentionMs: 1000 * 60 * 60 * 24, // 24 hours
            budgetThresholds: {
                warning: 5.00, // $5 daily warning
                critical: 8.00, // $8 daily critical
                daily: 10.00, // $10 daily limit
                monthly: 250.00 // $250 monthly limit
            },
            systemMetricsIntervalMs: 1000 * 30, // 30 seconds
            alertCooldownMs: 1000 * 60 * 15 // 15 minutes cooldown
        };
        this.systemMetricsTimer = null;
        this.lastAlerts = new Map();
        // Claude API pricing (as of 2024)
        this.CLAUDE_PRICING = {
            'claude-3-5-sonnet-20241022': {
                inputPer1K: 0.003, // $0.003 per 1K input tokens
                outputPer1K: 0.015 // $0.015 per 1K output tokens
            },
            'claude-3-haiku-20240307': {
                inputPer1K: 0.00025,
                outputPer1K: 0.00125
            }
        };
        if (config) {
            this.config = { ...this.config, ...config };
        }
        // Start system monitoring
        this.startSystemMonitoring();
        // Start cleanup timer
        this.startCleanupTimer();
        console.log('📊 Performance Monitor initialized', {
            retention: this.config.metricsRetentionMs / 1000 / 60 + ' minutes',
            budgetWarning: '$' + this.config.budgetThresholds.warning,
            budgetDaily: '$' + this.config.budgetThresholds.daily
        });
    }
    /**
     * Record AI operation performance metrics
     */
    recordOperation(metrics) {
        const operationId = this.generateOperationId();
        const fullMetrics = {
            ...metrics,
            timestamp: Date.now(),
            operationId
        };
        this.metrics.push(fullMetrics);
        // Calculate and record cost metrics
        if (fullMetrics.metadata?.tokenUsage) {
            const cost = this.calculateCost(fullMetrics.metadata.tokenUsage, fullMetrics.metadata.modelUsed || 'claude-3-5-sonnet-20241022');
            const costMetric = {
                operation: metrics.operation,
                tokenCost: fullMetrics.metadata.tokenUsage.totalTokens,
                estimatedUSDCost: cost,
                timestamp: fullMetrics.timestamp
            };
            this.costMetrics.push(costMetric);
            // Check budget alerts
            this.checkBudgetAlerts();
        }
        // Emit real-time event
        this.emit('metrics', fullMetrics);
        // Maintain size limits
        this.maintainHistoryLimits();
        return operationId;
    }
    /**
     * Record batch operation metrics
     */
    recordBatchOperation(batchId, operations) {
        const operationIds = [];
        const batchStartTime = Date.now();
        operations.forEach((op, index) => {
            const id = this.recordOperation({
                ...op,
                operation: `${op.operation}-batch-${batchId}-${index}`
            });
            operationIds.push(id);
        });
        // Record batch summary
        const batchDuration = Date.now() - batchStartTime;
        const totalTokens = operations.reduce((sum, op) => sum + (op.metadata?.tokenUsage?.totalTokens || 0), 0);
        this.recordOperation({
            operation: 'batch-summary',
            duration: batchDuration,
            success: operations.every(op => op.success),
            metadata: {
                batchSize: operations.length,
                tokenUsage: {
                    inputTokens: operations.reduce((sum, op) => sum + (op.metadata?.tokenUsage?.inputTokens || 0), 0),
                    outputTokens: operations.reduce((sum, op) => sum + (op.metadata?.tokenUsage?.outputTokens || 0), 0),
                    totalTokens
                }
            }
        });
        return operationIds;
    }
    /**
     * Get performance metrics for a time window
     */
    getMetrics(timeWindowMs = 1000 * 60 * 60) {
        const now = Date.now();
        const cutoff = now - timeWindowMs;
        // Filter metrics to time window
        const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff);
        const recentCosts = this.costMetrics.filter(c => c.timestamp > cutoff);
        const recentSystem = this.systemMetrics.filter(s => s.timestamp > cutoff);
        // Aggregate by operation
        const operations = {};
        recentMetrics.forEach(metric => {
            if (!operations[metric.operation]) {
                operations[metric.operation] = {
                    count: 0,
                    totalDuration: 0,
                    successCount: 0,
                    totalTokens: 0,
                    totalCost: 0,
                    cacheHits: 0
                };
            }
            const op = operations[metric.operation];
            op.count++;
            op.totalDuration += metric.duration;
            if (metric.success)
                op.successCount++;
            if (metric.metadata?.tokenUsage) {
                op.totalTokens += metric.metadata.tokenUsage.totalTokens;
            }
            if (metric.metadata?.cacheHit) {
                op.cacheHits++;
            }
        });
        // Calculate costs by operation
        recentCosts.forEach(cost => {
            if (operations[cost.operation]) {
                operations[cost.operation].totalCost += cost.estimatedUSDCost;
            }
        });
        // Finalize operation metrics
        Object.keys(operations).forEach(op => {
            const metrics = operations[op];
            metrics.avgDuration = metrics.totalDuration / metrics.count;
            metrics.successRate = metrics.successCount / metrics.count;
            metrics.cacheHitRate = metrics.cacheHits / metrics.count;
            // Clean up temporary fields
            delete metrics.successCount;
            delete metrics.cacheHits;
        });
        // System metrics aggregation
        const system = {
            avgCpuUsage: 0,
            avgMemoryUsage: 0,
            peakMemoryUsage: 0
        };
        if (recentSystem.length > 0) {
            system.avgCpuUsage = recentSystem.reduce((sum, s) => sum + s.cpuUsage, 0) / recentSystem.length;
            system.avgMemoryUsage = recentSystem.reduce((sum, s) => sum + s.memoryUsage, 0) / recentSystem.length;
            system.peakMemoryUsage = Math.max(...recentSystem.map(s => s.memoryUsage));
        }
        // Error aggregation
        const errorMap = new Map();
        recentMetrics
            .filter(m => !m.success && m.error)
            .forEach(m => {
            const key = `${m.operation}:${m.error}`;
            if (!errorMap.has(key)) {
                errorMap.set(key, {
                    operation: m.operation,
                    error: m.error,
                    count: 0,
                    lastOccurrence: 0
                });
            }
            const error = errorMap.get(key);
            error.count++;
            error.lastOccurrence = Math.max(error.lastOccurrence, m.timestamp);
        });
        return {
            timeWindow: this.formatTimeWindow(timeWindowMs),
            operations,
            system,
            errors: Array.from(errorMap.values())
        };
    }
    /**
     * Get cost metrics and budget status
     */
    getCostMetrics() {
        const now = Date.now();
        const dayMs = 1000 * 60 * 60 * 24;
        const monthMs = dayMs * 30;
        // Daily metrics
        const dailyCosts = this.costMetrics.filter(c => c.timestamp > now - dayMs);
        const dailyCost = dailyCosts.reduce((sum, c) => sum + c.estimatedUSDCost, 0);
        const dailyTokens = dailyCosts.reduce((sum, c) => sum + c.tokenCost, 0);
        // Monthly metrics
        const monthlyCosts = this.costMetrics.filter(c => c.timestamp > now - monthMs);
        const monthlyCost = monthlyCosts.reduce((sum, c) => sum + c.estimatedUSDCost, 0);
        const monthlyTokens = monthlyCosts.reduce((sum, c) => sum + c.tokenCost, 0);
        // Cost breakdown by operation
        const breakdownMap = new Map();
        monthlyCosts.forEach(c => {
            if (!breakdownMap.has(c.operation)) {
                breakdownMap.set(c.operation, { cost: 0, tokens: 0, count: 0 });
            }
            const breakdown = breakdownMap.get(c.operation);
            breakdown.cost += c.estimatedUSDCost;
            breakdown.tokens += c.tokenCost;
            breakdown.count++;
        });
        const breakdown = Array.from(breakdownMap.entries()).map(([operation, data]) => ({
            operation,
            cost: data.cost,
            tokens: data.tokens,
            avgCostPerOperation: data.cost / data.count
        }));
        return {
            daily: {
                cost: dailyCost,
                tokens: dailyTokens,
                operations: dailyCosts.length,
                budget: this.config.budgetThresholds.daily,
                remaining: Math.max(0, this.config.budgetThresholds.daily - dailyCost),
                percentUsed: (dailyCost / this.config.budgetThresholds.daily) * 100
            },
            monthly: {
                cost: monthlyCost,
                tokens: monthlyTokens,
                operations: monthlyCosts.length,
                budget: this.config.budgetThresholds.monthly,
                remaining: Math.max(0, this.config.budgetThresholds.monthly - monthlyCost),
                percentUsed: (monthlyCost / this.config.budgetThresholds.monthly) * 100
            },
            alerts: this.alerts.slice(-10), // Last 10 alerts
            breakdown
        };
    }
    /**
     * Get system performance metrics
     */
    getSystemMetrics(timeWindowMs = 1000 * 60 * 10) {
        const cutoff = Date.now() - timeWindowMs;
        return this.systemMetrics.filter(s => s.timestamp > cutoff);
    }
    /**
     * Get performance recommendations
     */
    getRecommendations() {
        const metrics = this.getMetrics();
        const recommendations = [];
        // Check response times
        Object.entries(metrics.operations).forEach(([op, stats]) => {
            if (stats.avgDuration > 5000) {
                recommendations.push(`${op} operations are slow (${Math.round(stats.avgDuration)}ms avg). Consider caching or optimization.`);
            }
            if (stats.successRate < 0.95) {
                recommendations.push(`${op} has low success rate (${Math.round(stats.successRate * 100)}%). Check error logs.`);
            }
            if (stats.cacheHitRate < 0.3 && stats.count > 10) {
                recommendations.push(`${op} has low cache hit rate (${Math.round(stats.cacheHitRate * 100)}%). Review caching strategy.`);
            }
        });
        // Check costs
        const costs = this.getCostMetrics();
        if (costs.daily.percentUsed > 80) {
            recommendations.push(`Daily budget usage is high (${Math.round(costs.daily.percentUsed)}%). Monitor usage closely.`);
        }
        // Check system performance
        if (metrics.system.avgMemoryUsage > 80) {
            recommendations.push(`Memory usage is high (${Math.round(metrics.system.avgMemoryUsage)}%). Consider memory optimization.`);
        }
        return recommendations;
    }
    /**
     * Calculate cost for token usage
     */
    calculateCost(tokenUsage, model) {
        const pricing = this.CLAUDE_PRICING[model]
            || this.CLAUDE_PRICING['claude-3-5-sonnet-20241022'];
        const inputCost = (tokenUsage.inputTokens / 1000) * pricing.inputPer1K;
        const outputCost = (tokenUsage.outputTokens / 1000) * pricing.outputPer1K;
        return inputCost + outputCost;
    }
    /**
     * Check and generate budget alerts
     */
    checkBudgetAlerts() {
        const now = Date.now();
        const costs = this.getCostMetrics();
        // Check daily budget
        if (costs.daily.percentUsed >= 100) {
            this.generateAlert('exceeded', `Daily budget exceeded: $${costs.daily.cost.toFixed(2)} of $${costs.daily.budget}`, costs.daily.cost, costs.daily.budget);
        }
        else if (costs.daily.percentUsed >= 80) {
            this.generateAlert('critical', `Daily budget critical: $${costs.daily.cost.toFixed(2)} of $${costs.daily.budget} (${Math.round(costs.daily.percentUsed)}%)`, costs.daily.cost, costs.daily.budget);
        }
        else if (costs.daily.percentUsed >= 60) {
            this.generateAlert('warning', `Daily budget warning: $${costs.daily.cost.toFixed(2)} of $${costs.daily.budget} (${Math.round(costs.daily.percentUsed)}%)`, costs.daily.cost, costs.daily.budget);
        }
        // Check monthly budget
        if (costs.monthly.percentUsed >= 90) {
            this.generateAlert('critical', `Monthly budget critical: $${costs.monthly.cost.toFixed(2)} of $${costs.monthly.budget} (${Math.round(costs.monthly.percentUsed)}%)`, costs.monthly.cost, costs.monthly.budget);
        }
    }
    /**
     * Generate budget alert with cooldown
     */
    generateAlert(type, message, currentCost, budgetLimit) {
        const alertKey = `${type}-${message}`;
        const now = Date.now();
        // Check cooldown
        const lastAlert = this.lastAlerts.get(alertKey);
        if (lastAlert && (now - lastAlert) < this.config.alertCooldownMs) {
            return;
        }
        const alert = {
            type,
            message,
            currentCost,
            budgetLimit,
            timestamp: now
        };
        this.alerts.push(alert);
        this.lastAlerts.set(alertKey, now);
        // Emit alert event
        this.emit('budgetAlert', alert);
        console.warn(`💸 Budget Alert [${type.toUpperCase()}]:`, message);
    }
    /**
     * Start system metrics collection
     */
    startSystemMonitoring() {
        this.systemMetricsTimer = setInterval(() => {
            const usage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            const metric = {
                cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to milliseconds
                memoryUsage: (usage.rss / 1024 / 1024), // Convert to MB
                heapUsed: usage.heapUsed / 1024 / 1024,
                heapTotal: usage.heapTotal / 1024 / 1024,
                timestamp: Date.now()
            };
            this.systemMetrics.push(metric);
            // Maintain size limits
            if (this.systemMetrics.length > 1000) {
                this.systemMetrics.splice(0, 100);
            }
        }, this.config.systemMetricsIntervalMs);
    }
    /**
     * Start cleanup timer for old metrics
     */
    startCleanupTimer() {
        setInterval(() => {
            this.cleanupOldMetrics();
        }, 1000 * 60 * 10); // Cleanup every 10 minutes
    }
    /**
     * Clean up old metrics to prevent memory leaks
     */
    cleanupOldMetrics() {
        const now = Date.now();
        const cutoff = now - this.config.metricsRetentionMs;
        const metricsRemoved = this.metrics.length;
        const costsRemoved = this.costMetrics.length;
        const systemRemoved = this.systemMetrics.length;
        this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
        this.costMetrics = this.costMetrics.filter(c => c.timestamp > cutoff);
        this.systemMetrics = this.systemMetrics.filter(s => s.timestamp > cutoff);
        this.alerts = this.alerts.filter(a => a.timestamp > cutoff);
        const finalMetrics = this.metrics.length;
        const finalCosts = this.costMetrics.length;
        const finalSystem = this.systemMetrics.length;
        if (metricsRemoved > finalMetrics || costsRemoved > finalCosts || systemRemoved > finalSystem) {
            console.log(`🧹 Performance Monitor cleanup: Removed ${metricsRemoved - finalMetrics} metrics, ${costsRemoved - finalCosts} cost entries, ${systemRemoved - finalSystem} system entries`);
        }
    }
    /**
     * Maintain history size limits
     */
    maintainHistoryLimits() {
        if (this.metrics.length > this.config.maxMetricsHistory) {
            this.metrics.splice(0, Math.floor(this.config.maxMetricsHistory * 0.1));
        }
    }
    /**
     * Generate unique operation ID
     */
    generateOperationId() {
        return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    /**
     * Format time window for display
     */
    formatTimeWindow(ms) {
        const minutes = Math.floor(ms / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        return `${minutes}m`;
    }
    /**
     * Shutdown monitor
     */
    shutdown() {
        if (this.systemMetricsTimer) {
            clearInterval(this.systemMetricsTimer);
            this.systemMetricsTimer = null;
        }
        console.log('🔌 Performance Monitor shutdown');
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
// Singleton instance
let monitorInstance = null;
function getPerformanceMonitor(config) {
    if (!monitorInstance) {
        monitorInstance = new PerformanceMonitor(config);
    }
    return monitorInstance;
}
