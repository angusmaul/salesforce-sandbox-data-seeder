---
github_issue: 14
github_url: https://github.com/angusmaul/salesforce-sandbox-data-seeder/issues/14
title: "Epic: Backlog Enhancements"
state: open
labels: ["epic", "enhancement"]
created_at: 2025-08-24T04:22:10Z
updated_at: 2025-08-24T04:22:10Z
last_sync: 2025-08-24T04:22:10Z
---

# Epic: Backlog Enhancements

## Overview
Future improvements and optimizations for the Salesforce Data Seeder tool that are not critical for core functionality but would enhance user experience and data quality.

## Tasks
- [ ] Improve unique field constraint handling
  - **Problem**: Data generator creates duplicate values for fields with unique constraints (e.g., GEH_Tenant_Number__c)
  - **Impact**: 2% failure rate due to duplicate key violations  
  - **Solution**: Implement UUID/sequential generation, pre-query existing values, add retry logic
  - **Priority**: Low (tool designed for empty sandboxes)

## Context
This epic captures enhancement opportunities discovered during testing and usage, focusing on data quality improvements that would benefit production scenarios.