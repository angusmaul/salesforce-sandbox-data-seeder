---
github_issue: 11
github_url: https://github.com/angusmaul/salesforce-sandbox-data-seeder/issues/11
title: "Advanced Business Context and Industry-Specific Patterns"
state: open
labels: ["task"]
created_at: 2025-08-22T04:27:08Z
updated_at: 2025-08-22T05:24:43Z
last_sync: 2025-08-24T18:25:00Z
depends_on: [5]
parallel: true
---

# Task: Advanced Business Context and Industry-Specific Patterns

## Description
Enhance data generation with sophisticated business context understanding and industry-specific data patterns. Enable the AI to generate realistic business scenarios that reflect actual industry practices, seasonal patterns, and complex business process workflows across different verticals (healthcare, finance, retail, manufacturing, etc.).

## Acceptance Criteria
- [ ] Industry-specific data pattern library (healthcare patient flows, financial trading patterns, retail seasonal data)
- [ ] Business process simulation for realistic data scenarios (lead-to-cash, order-to-fulfillment, case resolution)
- [ ] Seasonal and temporal pattern recognition for date-based fields (Q4 sales spikes, holiday patterns)
- [ ] Advanced relationship modeling for complex business scenarios (enterprise accounts with subsidiaries, project teams with roles)
- [ ] User interface for selecting industry context and business scenario templates
- [ ] AI-powered scenario generation based on user-provided business context descriptions
- [ ] Integration with existing data generation to apply business logic patterns

## Technical Details

### Implementation Approach
- Create `web/server/services/business-context-engine.ts` for industry-specific pattern application
- Build library of business scenario templates with realistic data patterns
- Use Claude API for understanding and applying complex business context from user descriptions
- Enhance suggestion engine (Task 005) with industry-aware recommendations

### Key Considerations
- **Realism**: Generated scenarios should reflect actual business practices and realistic data distributions
- **Flexibility**: Support custom business contexts while providing useful industry templates
- **Performance**: Business context processing should not significantly impact generation performance
- **User Control**: Users should be able to customize and override business context recommendations

### Code Locations/Files Affected
- `web/server/services/business-context-engine.ts` (new)
- `web/server/data/industry-patterns.json` (new - industry-specific data templates)
- `web/server/data/business-scenarios.json` (new - business process templates)
- `web/components/wizard/steps/ConfigurationStep.tsx` (add business context selection)
- `web/server/services/suggestion-engine.ts` (enhance with business context awareness)

## Dependencies
- [ ] Task 005: Smart Data Suggestions (provides foundation for context-aware generation)
- [ ] Research into industry-specific business patterns and data characteristics
- [ ] User research to understand most valuable business scenarios for testing

## Effort Estimate
- Size: M
- Hours: 20-24 hours
- Parallel: true (can develop alongside pre-validation and performance tasks)

## Definition of Done
- [ ] Business context engine implemented with industry-specific pattern support
- [ ] Industry template library created with realistic data patterns for major verticals
- [ ] User interface components for business context selection and customization
- [ ] Integration testing with various industry scenarios demonstrates realistic business data
- [ ] Performance testing ensures business context processing doesn't impact generation speed
- [ ] User acceptance testing validates usefulness of industry-specific scenarios