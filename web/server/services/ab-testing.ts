/**
 * A/B Testing Framework for AI Suggestion Acceptance Analysis
 * Tracks user interactions with suggestions to measure effectiveness
 */

export interface ABTestVariant {
  id: string;
  name: string;
  description: string;
  config: {
    suggestionsEnabled: boolean;
    confidenceThreshold?: number;
    maxSuggestions?: number;
    businessContextRequired?: boolean;
    suggestionDisplayStyle?: 'inline' | 'panel' | 'modal';
  };
}

export interface ABTestExperiment {
  id: string;
  name: string;
  description: string;
  startDate: Date;
  endDate?: Date;
  status: 'draft' | 'running' | 'completed' | 'paused';
  variants: ABTestVariant[];
  trafficSplit: { [variantId: string]: number }; // Percentage split (should sum to 100)
  targetMetrics: string[];
  criteria: {
    minSampleSize?: number;
    significanceLevel?: number;
    expectedEffect?: number;
  };
}

export interface ABTestParticipant {
  sessionId: string;
  experimentId: string;
  variantId: string;
  assignedAt: Date;
  demographics?: {
    userType?: 'new' | 'returning';
    orgType?: 'sandbox' | 'production';
    industry?: string;
    experience?: 'beginner' | 'intermediate' | 'advanced';
  };
}

export interface ABTestMetric {
  sessionId: string;
  experimentId: string;
  variantId: string;
  metricName: string;
  value: number;
  timestamp: Date;
  metadata?: any;
}

export interface SuggestionInteraction {
  sessionId: string;
  suggestionId: string;
  objectName: string;
  fieldName: string;
  action: 'viewed' | 'accepted' | 'rejected' | 'modified' | 'ignored';
  confidence: number;
  businessContext?: string;
  timeToDecision?: number; // milliseconds
  originalValue?: any;
  finalValue?: any;
  timestamp: Date;
}

export interface ABTestResults {
  experimentId: string;
  status: 'insufficient_data' | 'no_significant_difference' | 'significant_difference';
  results: {
    [variantId: string]: {
      participants: number;
      metrics: {
        [metricName: string]: {
          value: number;
          standardError: number;
          confidenceInterval: [number, number];
        };
      };
    };
  };
  winningVariant?: string;
  confidence: number;
  analysisDate: Date;
}

export class ABTestingService {
  private experiments: Map<string, ABTestExperiment> = new Map();
  private participants: Map<string, ABTestParticipant> = new Map(); // sessionId -> participant
  private metrics: ABTestMetric[] = [];
  private interactions: SuggestionInteraction[] = [];

  constructor() {
    this.initializeDefaultExperiments();
  }

  /**
   * Initialize default experiments for suggestion effectiveness testing
   */
  private initializeDefaultExperiments() {
    // Experiment 1: AI Suggestions vs Control
    const aiSuggestionsExperiment: ABTestExperiment = {
      id: 'ai-suggestions-v1',
      name: 'AI Suggestions Effectiveness',
      description: 'Test whether AI suggestions improve user satisfaction and data quality',
      startDate: new Date(),
      status: 'running',
      variants: [
        {
          id: 'control',
          name: 'Control (No AI)',
          description: 'Standard data generation without AI suggestions',
          config: {
            suggestionsEnabled: false
          }
        },
        {
          id: 'ai-enabled',
          name: 'AI Suggestions Enabled',
          description: 'Data generation with AI-powered field suggestions',
          config: {
            suggestionsEnabled: true,
            confidenceThreshold: 0.6,
            maxSuggestions: 3,
            suggestionDisplayStyle: 'panel'
          }
        }
      ],
      trafficSplit: {
        'control': 50,
        'ai-enabled': 50
      },
      targetMetrics: [
        'suggestion_acceptance_rate',
        'time_to_completion',
        'user_satisfaction',
        'data_quality_score',
        'task_completion_rate'
      ],
      criteria: {
        minSampleSize: 30,
        significanceLevel: 0.05,
        expectedEffect: 0.15 // 15% improvement expected
      }
    };

    // Experiment 2: Business Context Impact
    const businessContextExperiment: ABTestExperiment = {
      id: 'business-context-v1',
      name: 'Business Context Impact',
      description: 'Measure impact of business context selection on suggestion quality',
      startDate: new Date(),
      status: 'running',
      variants: [
        {
          id: 'no-context',
          name: 'No Business Context',
          description: 'AI suggestions without specific business context',
          config: {
            suggestionsEnabled: true,
            businessContextRequired: false,
            maxSuggestions: 3
          }
        },
        {
          id: 'required-context',
          name: 'Required Business Context',
          description: 'AI suggestions with required business context selection',
          config: {
            suggestionsEnabled: true,
            businessContextRequired: true,
            maxSuggestions: 3
          }
        }
      ],
      trafficSplit: {
        'no-context': 50,
        'required-context': 50
      },
      targetMetrics: [
        'suggestion_relevance_score',
        'suggestion_acceptance_rate',
        'user_satisfaction',
        'business_context_completion_rate'
      ],
      criteria: {
        minSampleSize: 25,
        significanceLevel: 0.05,
        expectedEffect: 0.20
      }
    };

    this.experiments.set(aiSuggestionsExperiment.id, aiSuggestionsExperiment);
    this.experiments.set(businessContextExperiment.id, businessContextExperiment);
  }

  /**
   * Assign a user to an experiment variant
   */
  assignToExperiment(sessionId: string, experimentId: string, demographics?: any): ABTestParticipant | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      return null;
    }

    // Check if already assigned
    const existingParticipant = this.participants.get(sessionId);
    if (existingParticipant?.experimentId === experimentId) {
      return existingParticipant;
    }

    // Randomly assign based on traffic split
    const random = Math.random() * 100;
    let cumulativePercentage = 0;
    let assignedVariantId = experiment.variants[0].id; // Default fallback

    for (const [variantId, percentage] of Object.entries(experiment.trafficSplit)) {
      cumulativePercentage += percentage;
      if (random <= cumulativePercentage) {
        assignedVariantId = variantId;
        break;
      }
    }

    const participant: ABTestParticipant = {
      sessionId,
      experimentId,
      variantId: assignedVariantId,
      assignedAt: new Date(),
      demographics
    };

    this.participants.set(sessionId, participant);
    
    console.log(`🧪 A/B Test: Assigned session ${sessionId} to variant ${assignedVariantId} in experiment ${experimentId}`);
    
    return participant;
  }

  /**
   * Get experiment configuration for a session
   */
  getExperimentConfig(sessionId: string, experimentId: string): any | null {
    const participant = this.participants.get(sessionId);
    if (!participant || participant.experimentId !== experimentId) {
      return null;
    }

    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      return null;
    }

    const variant = experiment.variants.find(v => v.id === participant.variantId);
    return variant?.config || null;
  }

  /**
   * Record a metric for A/B testing analysis
   */
  recordMetric(sessionId: string, metricName: string, value: number, metadata?: any) {
    const participant = this.participants.get(sessionId);
    if (!participant) {
      return;
    }

    const metric: ABTestMetric = {
      sessionId,
      experimentId: participant.experimentId,
      variantId: participant.variantId,
      metricName,
      value,
      timestamp: new Date(),
      metadata
    };

    this.metrics.push(metric);
    
    console.log(`📊 A/B Test Metric: ${metricName} = ${value} for variant ${participant.variantId}`);
  }

  /**
   * Record suggestion interaction for analysis
   */
  recordSuggestionInteraction(interaction: Omit<SuggestionInteraction, 'timestamp'>) {
    const fullInteraction: SuggestionInteraction = {
      ...interaction,
      timestamp: new Date()
    };

    this.interactions.push(fullInteraction);

    // Also record as metrics
    const participant = this.participants.get(interaction.sessionId);
    if (participant) {
      // Record different metrics based on interaction type
      switch (interaction.action) {
        case 'accepted':
          this.recordMetric(interaction.sessionId, 'suggestion_accepted', 1, {
            confidence: interaction.confidence,
            fieldType: interaction.fieldName,
            objectType: interaction.objectName
          });
          break;
        case 'rejected':
          this.recordMetric(interaction.sessionId, 'suggestion_rejected', 1, {
            confidence: interaction.confidence
          });
          break;
        case 'modified':
          this.recordMetric(interaction.sessionId, 'suggestion_modified', 1, {
            confidence: interaction.confidence
          });
          break;
      }

      if (interaction.timeToDecision) {
        this.recordMetric(interaction.sessionId, 'time_to_decision', interaction.timeToDecision);
      }
    }
  }

  /**
   * Calculate acceptance rate for suggestions
   */
  calculateSuggestionAcceptanceRate(sessionId: string): number {
    const sessionInteractions = this.interactions.filter(i => i.sessionId === sessionId);
    if (sessionInteractions.length === 0) return 0;

    const acceptedOrModified = sessionInteractions.filter(i => 
      i.action === 'accepted' || i.action === 'modified'
    ).length;

    return acceptedOrModified / sessionInteractions.length;
  }

  /**
   * Get current experiment results
   */
  getExperimentResults(experimentId: string): ABTestResults {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Get all participants for this experiment
    const experimentParticipants = Array.from(this.participants.values())
      .filter(p => p.experimentId === experimentId);

    if (experimentParticipants.length < (experiment.criteria.minSampleSize || 10)) {
      return {
        experimentId,
        status: 'insufficient_data',
        results: {},
        confidence: 0,
        analysisDate: new Date()
      };
    }

    // Calculate metrics by variant
    const results: any = {};
    
    for (const variant of experiment.variants) {
      const variantParticipants = experimentParticipants.filter(p => p.variantId === variant.id);
      const variantMetrics = this.metrics.filter(m => 
        m.experimentId === experimentId && m.variantId === variant.id
      );

      results[variant.id] = {
        participants: variantParticipants.length,
        metrics: {}
      };

      // Calculate metrics for each target metric
      for (const targetMetric of experiment.targetMetrics) {
        const metricValues = variantMetrics
          .filter(m => m.metricName === targetMetric || this.isRelatedMetric(targetMetric, m.metricName))
          .map(m => m.value);

        if (metricValues.length > 0) {
          const mean = metricValues.reduce((a, b) => a + b, 0) / metricValues.length;
          const variance = metricValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / metricValues.length;
          const standardError = Math.sqrt(variance / metricValues.length);
          
          // 95% confidence interval
          const margin = 1.96 * standardError;
          
          results[variant.id].metrics[targetMetric] = {
            value: mean,
            standardError,
            confidenceInterval: [mean - margin, mean + margin]
          };
        }
      }
    }

    // Simple significance test (would use proper statistical tests in production)
    const hasSignificantDifference = this.checkStatisticalSignificance(results, experiment);
    
    return {
      experimentId,
      status: hasSignificantDifference ? 'significant_difference' : 'no_significant_difference',
      results,
      winningVariant: hasSignificantDifference ? this.determineWinningVariant(results) : undefined,
      confidence: hasSignificantDifference ? 0.95 : 0,
      analysisDate: new Date()
    };
  }

  /**
   * Get suggestion analytics for dashboard
   */
  getSuggestionAnalytics(): any {
    const totalInteractions = this.interactions.length;
    if (totalInteractions === 0) {
      return {
        totalInteractions: 0,
        acceptanceRate: 0,
        avgTimeToDecision: 0,
        topFields: [],
        confidenceDistribution: {}
      };
    }

    const acceptedInteractions = this.interactions.filter(i => 
      i.action === 'accepted' || i.action === 'modified'
    ).length;

    const acceptanceRate = acceptedInteractions / totalInteractions;

    const decisionsWithTiming = this.interactions.filter(i => i.timeToDecision);
    const avgTimeToDecision = decisionsWithTiming.length > 0 
      ? decisionsWithTiming.reduce((sum, i) => sum + (i.timeToDecision || 0), 0) / decisionsWithTiming.length
      : 0;

    // Top fields by interaction count
    const fieldCounts: { [key: string]: number } = {};
    this.interactions.forEach(i => {
      const fieldKey = `${i.objectName}.${i.fieldName}`;
      fieldCounts[fieldKey] = (fieldCounts[fieldKey] || 0) + 1;
    });

    const topFields = Object.entries(fieldCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([field, count]) => ({ field, count }));

    // Confidence distribution
    const confidenceDistribution: { [range: string]: number } = {
      'high (0.8-1.0)': 0,
      'medium (0.6-0.8)': 0,
      'low (0-0.6)': 0
    };

    this.interactions.forEach(i => {
      if (i.confidence >= 0.8) {
        confidenceDistribution['high (0.8-1.0)']++;
      } else if (i.confidence >= 0.6) {
        confidenceDistribution['medium (0.6-0.8)']++;
      } else {
        confidenceDistribution['low (0-0.6)']++;
      }
    });

    return {
      totalInteractions,
      acceptanceRate,
      avgTimeToDecision,
      topFields,
      confidenceDistribution
    };
  }

  /**
   * Get all running experiments
   */
  getRunningExperiments(): ABTestExperiment[] {
    return Array.from(this.experiments.values()).filter(e => e.status === 'running');
  }

  // Private helper methods

  private isRelatedMetric(targetMetric: string, actualMetric: string): boolean {
    const relationMap: { [key: string]: string[] } = {
      'suggestion_acceptance_rate': ['suggestion_accepted', 'suggestion_rejected', 'suggestion_modified'],
      'time_to_completion': ['time_to_decision'],
      'user_satisfaction': ['user_rating', 'satisfaction_score']
    };

    return relationMap[targetMetric]?.includes(actualMetric) || false;
  }

  private checkStatisticalSignificance(results: any, experiment: ABTestExperiment): boolean {
    // Simple placeholder - in production, would use proper statistical tests
    const variants = Object.keys(results);
    if (variants.length < 2) return false;

    // Check if we have enough data points
    const totalParticipants = variants.reduce((sum, v) => sum + results[v].participants, 0);
    return totalParticipants >= (experiment.criteria.minSampleSize || 30);
  }

  private determineWinningVariant(results: any): string | undefined {
    // Simple implementation - find variant with highest acceptance rate
    let bestVariant = '';
    let bestScore = 0;

    for (const [variantId, data] of Object.entries(results)) {
      const acceptanceMetric = (data as any).metrics['suggestion_acceptance_rate'];
      if (acceptanceMetric && acceptanceMetric.value > bestScore) {
        bestScore = acceptanceMetric.value;
        bestVariant = variantId;
      }
    }

    return bestVariant || undefined;
  }
}

// Export singleton instance
export const abTestingService = new ABTestingService();
export default abTestingService;