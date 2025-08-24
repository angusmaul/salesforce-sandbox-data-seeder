interface CacheEntry<T = any> {
    key: string;
    data: T;
    timestamp: number;
    ttl: number;
    hitCount: number;
    lastAccess: number;
    metadata?: {
        requestType: string;
        tokenCount: number;
        responseTime: number;
        contentHash: string;
    };
}
interface CacheStats {
    totalRequests: number;
    hits: number;
    misses: number;
    hitRate: number;
    totalSize: number;
    entriesCount: number;
    oldestEntry: number | null;
    newestEntry: number | null;
}
interface CacheConfig {
    defaultTTL: number;
    maxSize: number;
    maxMemoryMB: number;
    enableCompression: boolean;
    gcIntervalMs: number;
}
export declare class AICacheService {
    private cache;
    private stats;
    private config;
    private gcTimer;
    constructor(config?: Partial<CacheConfig>);
    /**
     * Generate cache key for AI requests
     */
    private generateKey;
    /**
     * Get content hash for deduplication
     */
    private getContentHash;
    /**
     * Estimate memory usage of cache entry
     */
    private estimateSize;
    /**
     * Check if cache entry is valid
     */
    private isValid;
    /**
     * Cache AI chat responses
     */
    cacheChat(message: string, sessionId: string, response: any, responseTime: number): Promise<void>;
    /**
     * Get cached chat response
     */
    getCachedChat(message: string, sessionId: string): Promise<any | null>;
    /**
     * Cache schema analysis results
     */
    cacheSchemaAnalysis(schemaData: any, analysis: any, responseTime: number): Promise<void>;
    /**
     * Get cached schema analysis
     */
    getCachedSchemaAnalysis(schemaData: any): Promise<any | null>;
    /**
     * Cache field suggestions
     */
    cacheFieldSuggestions(objectType: string, fieldType: string, context: any, suggestions: any, responseTime: number): Promise<void>;
    /**
     * Get cached field suggestions
     */
    getCachedFieldSuggestions(objectType: string, fieldType: string, context: any): Promise<any | null>;
    /**
     * Cache validation pattern results
     */
    cacheValidationPattern(data: any, validationRules: any, result: any, responseTime: number): Promise<void>;
    /**
     * Get cached validation pattern result
     */
    getCachedValidationPattern(data: any, validationRules: any): Promise<any | null>;
    /**
     * Internal method to set cache entry
     */
    private setEntry;
    /**
     * Internal method to get cache entry
     */
    private getEntry;
    /**
     * Invalidate cache entries by pattern or criteria
     */
    invalidate(criteria: {
        operation?: string;
        olderThan?: number;
        sessionId?: string;
        contentType?: string;
    }): number;
    /**
     * Clear all cache entries
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats & {
        config: CacheConfig;
        memoryUsageMB: number;
    };
    /**
     * Get cache health information
     */
    getHealthInfo(): {
        status: 'healthy' | 'warning' | 'critical';
        hitRate: number;
        memoryUsage: number;
        entriesCount: number;
        recommendations: string[];
    };
    /**
     * Update cache statistics
     */
    private updateStats;
    /**
     * Update hit rate calculation
     */
    private updateHitRate;
    /**
     * Calculate total memory usage
     */
    private calculateMemoryUsage;
    /**
     * Enforce memory and size limits
     */
    private enforceMemoryLimits;
    /**
     * Start garbage collection timer
     */
    private startGarbageCollection;
    /**
     * Run garbage collection to remove expired entries
     */
    private runGarbageCollection;
    /**
     * Shutdown cache service
     */
    shutdown(): void;
}
export declare function getAICacheService(config?: Partial<CacheConfig>): AICacheService;
export { CacheEntry, CacheStats, CacheConfig };
