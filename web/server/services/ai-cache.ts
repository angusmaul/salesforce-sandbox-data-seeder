// AI Cache Service - Intelligent caching for Claude API responses
import crypto from 'crypto';

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
  defaultTTL: number; // milliseconds
  maxSize: number; // max number of entries
  maxMemoryMB: number; // max memory usage
  enableCompression: boolean;
  gcIntervalMs: number; // garbage collection interval
}

export class AICacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private stats: CacheStats = {
    totalRequests: 0,
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalSize: 0,
    entriesCount: 0,
    oldestEntry: null,
    newestEntry: null
  };
  
  private config: CacheConfig = {
    defaultTTL: 1000 * 60 * 60, // 1 hour default
    maxSize: 1000, // max 1000 cache entries
    maxMemoryMB: 50, // max 50MB cache size
    enableCompression: true,
    gcIntervalMs: 1000 * 60 * 5 // GC every 5 minutes
  };
  
  private gcTimer: NodeJS.Timeout | null = null;
  
  constructor(config?: Partial<CacheConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    
    // Start garbage collection timer
    this.startGarbageCollection();
    
    console.log('✅ AI Cache Service initialized', {
      defaultTTL: this.config.defaultTTL / 1000 / 60 + ' minutes',
      maxSize: this.config.maxSize,
      maxMemory: this.config.maxMemoryMB + 'MB'
    });
  }

  /**
   * Generate cache key for AI requests
   */
  private generateKey(operation: string, input: any, context?: any): string {
    const content = JSON.stringify({
      operation,
      input: typeof input === 'string' ? input : JSON.stringify(input),
      context: context ? JSON.stringify(context) : null
    });
    
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Get content hash for deduplication
   */
  private getContentHash(data: any): string {
    const content = JSON.stringify(data);
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Estimate memory usage of cache entry
   */
  private estimateSize(entry: CacheEntry): number {
    const jsonSize = JSON.stringify(entry).length;
    // Rough estimate: 2 bytes per character + overhead
    return jsonSize * 2 + 1024; // 1KB overhead per entry
  }

  /**
   * Check if cache entry is valid
   */
  private isValid(entry: CacheEntry): boolean {
    const now = Date.now();
    return (now - entry.timestamp) < entry.ttl;
  }

  /**
   * Cache AI chat responses
   */
  async cacheChat(message: string, sessionId: string, response: any, responseTime: number): Promise<void> {
    const key = this.generateKey('chat', message, { sessionId });
    const contentHash = this.getContentHash(response);
    
    const entry: CacheEntry = {
      key,
      data: response,
      timestamp: Date.now(),
      ttl: this.config.defaultTTL,
      hitCount: 0,
      lastAccess: Date.now(),
      metadata: {
        requestType: 'chat',
        tokenCount: response.usage?.input_tokens + response.usage?.output_tokens || 0,
        responseTime,
        contentHash
      }
    };
    
    this.setEntry(key, entry);
  }

  /**
   * Get cached chat response
   */
  async getCachedChat(message: string, sessionId: string): Promise<any | null> {
    const key = this.generateKey('chat', message, { sessionId });
    return this.getEntry(key);
  }

  /**
   * Cache schema analysis results
   */
  async cacheSchemaAnalysis(schemaData: any, analysis: any, responseTime: number): Promise<void> {
    const key = this.generateKey('schema-analysis', schemaData);
    const contentHash = this.getContentHash(analysis);
    
    const entry: CacheEntry = {
      key,
      data: analysis,
      timestamp: Date.now(),
      ttl: this.config.defaultTTL * 2, // Schema analysis can be cached longer
      hitCount: 0,
      lastAccess: Date.now(),
      metadata: {
        requestType: 'schema-analysis',
        tokenCount: 0, // Estimate if needed
        responseTime,
        contentHash
      }
    };
    
    this.setEntry(key, entry);
  }

  /**
   * Get cached schema analysis
   */
  async getCachedSchemaAnalysis(schemaData: any): Promise<any | null> {
    const key = this.generateKey('schema-analysis', schemaData);
    return this.getEntry(key);
  }

  /**
   * Cache field suggestions
   */
  async cacheFieldSuggestions(objectType: string, fieldType: string, context: any, suggestions: any, responseTime: number): Promise<void> {
    const key = this.generateKey('field-suggestions', { objectType, fieldType, context });
    const contentHash = this.getContentHash(suggestions);
    
    const entry: CacheEntry = {
      key,
      data: suggestions,
      timestamp: Date.now(),
      ttl: this.config.defaultTTL * 0.5, // Field suggestions expire faster
      hitCount: 0,
      lastAccess: Date.now(),
      metadata: {
        requestType: 'field-suggestions',
        tokenCount: 0,
        responseTime,
        contentHash
      }
    };
    
    this.setEntry(key, entry);
  }

  /**
   * Get cached field suggestions
   */
  async getCachedFieldSuggestions(objectType: string, fieldType: string, context: any): Promise<any | null> {
    const key = this.generateKey('field-suggestions', { objectType, fieldType, context });
    return this.getEntry(key);
  }

  /**
   * Cache validation pattern results
   */
  async cacheValidationPattern(data: any, validationRules: any, result: any, responseTime: number): Promise<void> {
    const key = this.generateKey('validation-pattern', { data, validationRules });
    const contentHash = this.getContentHash(result);
    
    const entry: CacheEntry = {
      key,
      data: result,
      timestamp: Date.now(),
      ttl: this.config.defaultTTL * 0.25, // Validation results expire quickly
      hitCount: 0,
      lastAccess: Date.now(),
      metadata: {
        requestType: 'validation-pattern',
        tokenCount: 0,
        responseTime,
        contentHash
      }
    };
    
    this.setEntry(key, entry);
  }

  /**
   * Get cached validation pattern result
   */
  async getCachedValidationPattern(data: any, validationRules: any): Promise<any | null> {
    const key = this.generateKey('validation-pattern', { data, validationRules });
    return this.getEntry(key);
  }

  /**
   * Internal method to set cache entry
   */
  private setEntry(key: string, entry: CacheEntry): void {
    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // Check memory limits before adding
    this.enforceMemoryLimits();
    
    // Add new entry
    this.cache.set(key, entry);
    
    // Update stats
    this.updateStats();
  }

  /**
   * Internal method to get cache entry
   */
  private getEntry(key: string): any | null {
    this.stats.totalRequests++;
    
    const entry = this.cache.get(key);
    
    if (!entry || !this.isValid(entry)) {
      this.stats.misses++;
      if (entry) {
        // Remove expired entry
        this.cache.delete(key);
      }
      this.updateHitRate();
      return null;
    }
    
    // Update entry access stats
    entry.hitCount++;
    entry.lastAccess = Date.now();
    
    this.stats.hits++;
    this.updateHitRate();
    
    return entry.data;
  }

  /**
   * Invalidate cache entries by pattern or criteria
   */
  invalidate(criteria: {
    operation?: string;
    olderThan?: number;
    sessionId?: string;
    contentType?: string;
  }): number {
    let removedCount = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      let shouldRemove = false;
      
      if (criteria.operation && entry.metadata?.requestType === criteria.operation) {
        shouldRemove = true;
      }
      
      if (criteria.olderThan && (now - entry.timestamp) > criteria.olderThan) {
        shouldRemove = true;
      }
      
      if (criteria.sessionId && key.includes(criteria.sessionId)) {
        shouldRemove = true;
      }
      
      if (shouldRemove) {
        this.cache.delete(key);
        removedCount++;
      }
    }
    
    this.updateStats();
    return removedCount;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.updateStats();
    console.log(`🗑️ AI Cache cleared: ${size} entries removed`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { config: CacheConfig; memoryUsageMB: number } {
    const memoryUsage = this.calculateMemoryUsage();
    return {
      ...this.stats,
      config: this.config,
      memoryUsageMB: memoryUsage / (1024 * 1024)
    };
  }

  /**
   * Get cache health information
   */
  getHealthInfo(): {
    status: 'healthy' | 'warning' | 'critical';
    hitRate: number;
    memoryUsage: number;
    entriesCount: number;
    recommendations: string[];
  } {
    const stats = this.getStats();
    const recommendations: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    // Check hit rate
    if (stats.hitRate < 0.3) {
      status = 'warning';
      recommendations.push('Cache hit rate is low. Consider tuning TTL settings or request patterns.');
    } else if (stats.hitRate > 0.7) {
      recommendations.push('Excellent cache hit rate! Cache is performing well.');
    }
    
    // Check memory usage
    if (stats.memoryUsageMB > this.config.maxMemoryMB * 0.9) {
      status = 'critical';
      recommendations.push('Cache memory usage is critical. Consider reducing TTL or max size.');
    } else if (stats.memoryUsageMB > this.config.maxMemoryMB * 0.7) {
      status = status === 'healthy' ? 'warning' : status;
      recommendations.push('Cache memory usage is high. Monitor for potential evictions.');
    }
    
    // Check entries count
    if (stats.entriesCount > this.config.maxSize * 0.9) {
      status = status === 'healthy' ? 'warning' : status;
      recommendations.push('Cache is near capacity. Consider increasing max size or reducing TTL.');
    }
    
    return {
      status,
      hitRate: stats.hitRate,
      memoryUsage: stats.memoryUsageMB,
      entriesCount: stats.entriesCount,
      recommendations
    };
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    this.stats.entriesCount = this.cache.size;
    this.stats.totalSize = this.calculateMemoryUsage();
    
    const timestamps = Array.from(this.cache.values()).map(entry => entry.timestamp);
    this.stats.oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : null;
    this.stats.newestEntry = timestamps.length > 0 ? Math.max(...timestamps) : null;
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    this.stats.hitRate = this.stats.totalRequests > 0 
      ? this.stats.hits / this.stats.totalRequests 
      : 0;
  }

  /**
   * Calculate total memory usage
   */
  private calculateMemoryUsage(): number {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += this.estimateSize(entry);
    }
    return totalSize;
  }

  /**
   * Enforce memory and size limits
   */
  private enforceMemoryLimits(): void {
    const currentMemory = this.calculateMemoryUsage();
    const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;
    
    // If over memory limit or max size, remove LRU entries
    if (currentMemory > maxMemoryBytes || this.cache.size >= this.config.maxSize) {
      const entries = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.lastAccess - b.lastAccess); // Sort by least recently used
      
      const targetRemoval = Math.max(
        Math.ceil(this.cache.size * 0.2), // Remove at least 20%
        this.cache.size - this.config.maxSize + 1 // Or enough to get under size limit
      );
      
      for (let i = 0; i < targetRemoval && entries.length > 0; i++) {
        const [key] = entries[i];
        this.cache.delete(key);
      }
      
      console.log(`🧹 AI Cache: Removed ${targetRemoval} LRU entries (Memory: ${Math.round(currentMemory / 1024 / 1024)}MB)`);
    }
  }

  /**
   * Start garbage collection timer
   */
  private startGarbageCollection(): void {
    this.gcTimer = setInterval(() => {
      this.runGarbageCollection();
    }, this.config.gcIntervalMs);
  }

  /**
   * Run garbage collection to remove expired entries
   */
  private runGarbageCollection(): void {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValid(entry)) {
        this.cache.delete(key);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`🧹 AI Cache GC: Removed ${removedCount} expired entries`);
      this.updateStats();
    }
  }

  /**
   * Shutdown cache service
   */
  shutdown(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    
    console.log('🔌 AI Cache Service shutdown');
  }
}

// Singleton instance
let cacheInstance: AICacheService | null = null;

export function getAICacheService(config?: Partial<CacheConfig>): AICacheService {
  if (!cacheInstance) {
    cacheInstance = new AICacheService(config);
  }
  return cacheInstance;
}

// Export for testing
export { CacheEntry, CacheStats, CacheConfig };