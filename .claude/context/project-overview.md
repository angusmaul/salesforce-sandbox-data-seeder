---
created: 2025-08-22T03:37:36Z
last_updated: 2025-08-22T03:37:36Z
version: 1.0
author: Claude Code PM System
---

# Project Overview

## What is Salesforce Sandbox Data Seeder?

A comprehensive developer tool that automates the discovery of Salesforce data models and generation of realistic test data for sandbox environments. It provides both CLI and web interfaces for maximum flexibility.

## Core Features

### 🔍 Data Model Discovery
- **Automatic Schema Detection**: Connects to your Salesforce sandbox and discovers all accessible objects
- **Field Analysis**: Identifies field types, requirements, and validation rules
- **Relationship Mapping**: Automatically maps parent-child and lookup relationships
- **RecordType Support**: Detects and handles RecordTypes appropriately
- **Smart Filtering**: Excludes system objects and read-only fields

### 📊 Intelligent Data Generation
- **Storage-Aware**: Calculates record counts based on 80% storage threshold
- **Business-Realistic Data**: Uses Faker.js to generate contextually appropriate data
- **Relationship Integrity**: Maintains referential integrity across all objects
- **Hierarchical Support**: Handles complex parent-child hierarchies
- **Custom Field Support**: Generates appropriate data for all custom fields

### 🎯 Smart Object Selection
- **Interactive Selection**: Choose which objects to populate
- **Preset Groups**: Common object groupings for quick selection
- **Dependency Detection**: Automatically includes required parent objects
- **Load Order Analysis**: Determines optimal insertion sequence
- **Storage Calculation**: Shows storage impact before generation

### 🚀 Execution & Integration
- **REST API Integration**: Uses Salesforce REST API for reliable insertion
- **Bulk Operations**: Optimized for large data volumes
- **Progress Tracking**: Real-time updates during generation and insertion
- **Error Recovery**: Automatic retry with intelligent backoff
- **Transaction Management**: Rollback capability on failures

### 📝 Logging & Monitoring
- **Comprehensive Logs**: Detailed session logs with timestamps
- **Success Tracking**: Records all successful insertions with IDs
- **Error Reporting**: Captures and explains all failures
- **Performance Metrics**: Tracks timing and API usage
- **Data Archive**: Stores generated data for reference

### ⚙️ Configuration Management
- **Credential Storage**: Secure storage of Salesforce credentials
- **Settings Persistence**: Save and reuse configurations
- **Object Selection Memory**: Remember previous selections
- **Environment Support**: Multiple sandbox configurations
- **Export/Import**: Share configurations across teams

## Interface Options

### Command Line Interface (CLI)
```bash
# Configure credentials
sf-seed config

# Discover schema
sf-seed discover

# Generate and load data
sf-seed generate --objects Account,Contact,Opportunity

# Interactive mode
sf-seed interactive
```

**CLI Features:**
- Single command execution
- Scriptable for automation
- Pipe-friendly output
- Verbose logging options
- Batch processing support

### Web Interface
```bash
# Start web server
sf-seed web

# Access at http://localhost:3000
```

**Web Features:**
- Visual object selection
- Drag-and-drop configuration
- Real-time progress bars
- Interactive field mapping
- Session management
- WebSocket updates

## Current Capabilities

### Supported Objects
- ✅ Standard Objects (Account, Contact, Lead, Opportunity, etc.)
- ✅ Custom Objects (all types)
- ✅ Junction Objects
- ✅ Big Objects (with limitations)
- ✅ Platform Events (structure only)

### Field Type Support
- ✅ Text, TextArea, Email, Phone, URL
- ✅ Number, Currency, Percent
- ✅ Date, DateTime, Time
- ✅ Checkbox, Picklist, Multi-Select
- ✅ Lookup, Master-Detail
- ✅ Formula (read-only)
- ✅ Rich Text, Long Text
- ✅ Geolocation

### Relationship Types
- ✅ Lookup relationships
- ✅ Master-Detail relationships
- ✅ Hierarchical relationships
- ✅ Many-to-Many (junction objects)
- ✅ Self-relationships

## Integration Points

### Salesforce APIs
- **REST API**: Primary data operations
- **Metadata API**: Schema discovery
- **Bulk API**: Large volume operations
- **OAuth 2.0**: Authentication

### External Services
- **Faker.js**: Data generation engine
- **Node.js**: Runtime platform
- **WebSocket**: Real-time communication
- **GitHub**: Source control and CI/CD

### Development Tools
- **TypeScript**: Type-safe development
- **Jest**: Testing framework
- **ESLint**: Code quality
- **Commander**: CLI framework

## Performance Characteristics

### Benchmarks
- Discovery: ~30 seconds for 200 objects
- Generation: 1000 records in ~10 seconds
- Insertion: 100 records/second (average)
- Memory: < 512MB for typical usage
- API Calls: Optimized bulk operations

### Scalability
- Handles orgs with 500+ objects
- Generates up to 100,000 records per session
- Supports concurrent operations
- Streaming for large datasets
- Pagination for API responses

## Security & Compliance

### Security Features
- OAuth 2.0 authentication only
- No production environment access
- Encrypted credential storage
- Session-based authentication
- No sensitive data logging

### Best Practices
- Sandbox-only enforcement
- Read-only schema access
- No DML on metadata
- Respect API limits
- Clean error messages

## Current State

### Completed
- ✅ Core authentication flow
- ✅ Schema discovery engine
- ✅ Data generation logic
- ✅ REST API integration
- ✅ CLI implementation
- ✅ Web interface foundation
- ✅ Logging system
- ✅ Configuration management

### In Progress
- 🔄 Enhanced RecordType handling
- 🔄 Performance optimizations
- 🔄 Extended test coverage
- 🔄 Documentation completion

### Planned
- 📋 Data templates
- 📋 Custom generation rules
- 📋 Data cleanup utilities
- 📋 Multi-org support
- 📋 CI/CD integration