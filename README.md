# Salesforce Sandbox Data Seeder

A comprehensive tool with both **CLI** and **Web Interface** to discover Salesforce sandbox data models and generate realistic sample data for testing and development.

## Features

### Core Capabilities
- 🔍 **Data Model Discovery**: Automatically discover Salesforce objects, fields, and relationships with intelligent filtering
- 📊 **Storage-Aware Generation**: Intelligent record counting based on 80% storage threshold (2KB per record)
- 🎯 **Smart Object Selection**: Interactive selection with presets, load order analysis, and dependency detection
- 🎲 **Business-Realistic Data**: Generate contextual business data using Faker.js with proper Account-Contact relationships
- 🔗 **Relationship Management**: Automatic relationship linking with real Salesforce IDs
- 📝 **Comprehensive Logging**: Detailed session logs with generated data, success/failure tracking, and error details
- 📦 **REST API Integration**: Reliable data insertion using Salesforce REST API
- 🛡️ **Smart Field Handling**: Intelligent RecordType detection and system field exclusion
- ⚙️ **Configuration Management**: Save and reuse settings and object selections

### Web Interface Features
- 🌐 **Modern Web UI**: Full-featured web interface with guided wizard workflow
- 🔄 **Real-time Progress**: Live progress tracking with WebSocket updates during discovery and execution
- 🎨 **Interactive Selection**: Visual object selection with categorization and filtering
- 📈 **Storage Visualization**: Real-time storage usage monitoring and validation
- 🔧 **Field Analysis**: Detailed field analysis with dependency mapping
- 📋 **Session Management**: Persistent sessions with automatic credential storage and reconnection
- 🚀 **One-Click Setup**: Simple External Client App credential setup with clear instructions

## Prerequisites

- Node.js 16 or higher
- Salesforce External Client App with OAuth Client Credentials flow configured
- Access to a Salesforce sandbox (not production)

## Installation

```bash
npm install
npm run build
```

## Configuration

### External Client App Setup

1. In Salesforce Setup, create an External Client App with:
   - Enable OAuth Settings
   - Enable Client Credentials Flow
   - Select appropriate scopes (API, etc.)
   - Assign to an integration user

2. Set environment variables or use the config command:
   ```bash
   export SF_CLIENT_ID="your_client_id"
   export SF_CLIENT_SECRET="your_client_secret"
   export SF_USERNAME="integration_user@example.com"
   export SF_LOGIN_URL="https://test.salesforce.com"
   ```

### Configuration Commands

```bash
# Set configuration values
npm start config set salesforce.clientId "your_client_id"
npm start config set salesforce.clientSecret "your_client_secret"
npm start config set salesforce.username "user@example.com"

# View configuration
npm start config get

# List available presets
npm start config presets list

# Create a new preset
npm start config presets create --name "my-preset" --description "My custom objects" --objects "Account,Contact,MyObject__c"
```

## Usage

### 🌐 Web Interface (Recommended)

The web interface provides a modern, user-friendly experience with guided workflows:

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:3000 in your browser.

**Web Interface Workflow:**
1. **Authentication**: Enter your External Client App credentials
2. **Discovery**: Automatic Salesforce org discovery with real-time progress
3. **Selection**: Visual object selection with business context categories  
4. **Field Analysis**: Detailed field analysis for selected objects
5. **Configuration**: Record count configuration with storage validation
6. **Preview**: Sample data preview before generation
7. **Execution**: Real-time data generation and loading with progress tracking
8. **Results**: Completion summary with detailed log file references

### 📋 CLI Interface (Advanced Users)

The CLI provides scriptable access for automation and advanced use cases:

### Discover Data Model

```bash
# Discover all objects and fields
npm start discover -u user@example.com -c client_id -s client_secret

# Save discovery results to file
npm start discover --output data-model.json

# Discover objects only (skip field analysis)
npm start discover --objects-only
```

### Seed Data

```bash
# Interactive mode - guided object selection
npm start seed --interactive

# Seed specific objects
npm start seed --objects "Account,Contact,Lead" --records 50

# Use a preset
npm start seed --preset sales-cloud --records 100

# Dry run - show what would be generated
npm start seed --objects "Account,Contact" --dry-run
```

### Example Workflows

#### Basic Setup
```bash
# 1. Configure credentials
npm start config set salesforce.clientId "your_client_id"
npm start config set salesforce.clientSecret "your_client_secret"
npm start config set salesforce.username "user@sandbox.example.com"

# 2. Discover the data model
npm start discover --output my-sandbox-model.json

# 3. Seed data interactively
npm start seed --interactive
```

#### Storage-Aware Generation
```bash
# Let the tool automatically calculate safe record counts
npm start seed --preset core-objects

# Force exact counts (bypasses storage calculations)
npm start seed --objects "Account,Contact" --records 10

# Check what would be generated without loading
npm start seed --preset sales-cloud --dry-run
```

#### Business Data Generation
```bash
# Generate business accounts with linked contacts
npm start seed --objects "Account,Contact" --records 50

# Load with proper dependencies and relationships
npm start seed --preset core-objects

# Review generated data and relationships in logs/
ls logs/load_*.json
```

## Presets

The tool includes several built-in presets for common scenarios:

- **core-objects**: Essential business objects with proper load order
  - Account, Contact, Lead, Product2, Pricebook2, PricebookEntry, Opportunity, Case, Task
- **sales-cloud**: Complete sales cloud data model
  - Account, Contact, Lead, Opportunity, Case, Campaign, Task, Event  
- **custom-only**: All custom objects (ending with __c)
- **minimal**: Basic objects for simple testing (Account, Contact, Lead)
- **relationship-aware**: Objects optimized for relationship testing

## Storage-Aware Data Generation

The tool intelligently calculates safe record counts based on actual storage availability:

### Storage Calculation Logic
- **Detects current storage usage** from Salesforce org limits
- **Applies 80% safety threshold** to prevent storage issues
- **Calculates max records** based on 2KB per record estimate
- **Distributes records proportionally** across selected objects using smart ratios

### Sandbox Type Adjustments
- **Developer (15MB)**: Typically 6,000+ records total with 80% threshold
- **Developer Pro (1GB)**: Typically 400,000+ records total  
- **Partial Copy (5GB)**: Typically 2,000,000+ records total
- **Full**: Production storage limits apply

### Example for Developer Sandbox
```
Available Storage: 10MB remaining
80% Safe Limit: 8MB
Max Safe Records: 4,096 records
Distribution: Account(400), Contact(1,000), Lead(600)...
```

## Data Generation

### Enhanced Object Discovery
- **Smart Filtering**: Automatically excludes 780+ metadata and system objects (ApexClass, StaticResource, etc.)
- **Data-Only Focus**: Only discovers objects that can hold business records
- **Performance Optimized**: Faster discovery by processing only relevant objects
- **Business Context**: Prioritizes core business objects (Account, Contact, Lead, Opportunity, etc.)

### Business-Realistic Data with Faker.js
- **Contact Names**: Realistic first/last names using `faker.person.firstName()` and `faker.person.lastName()`
- **Account Names**: Proper business names using `faker.company.name()` (e.g., "Mitchell LLC", "Hills Inc")
- **Communication Data**: 
  - Emails: `faker.internet.email()` (naturally unique)
  - Phone/Fax: `faker.phone.number()` (realistic formats)
  - URLs: `faker.internet.url()`
- **Address & Geographic**:
  - Streets: `faker.location.streetAddress()`
  - Cities: `faker.location.city()`  
  - States: `faker.location.state({ abbreviated: true })`
  - Postal codes: `faker.location.zipCode()`
  - Countries: `faker.location.country()`
- **Business Context**:
  - Job titles: `faker.person.jobTitle()`
  - Departments: Realistic department names
  - Industries: Business industry categories
  - Product names: `faker.commerce.productName()`
- **Smart Relationships**: Automatically link Contacts to created Accounts with real Salesforce IDs
- **RecordType Intelligence**: Include RecordTypeId only when multiple record types exist

### Advanced Relationship Handling
- **Dependency-Aware Loading**: Objects loaded in correct order (Account → Contact → Opportunity)
- **Real Salesforce IDs**: Relationships use actual inserted record IDs, not fake references
- **Circular Reference Handling**: Skip optional self-references (ParentId, ReportsToId)
- **System Field Exclusion**: Automatically skip OwnerId, CreatedById, and other system fields

### Data Quality Features
- **Field Type Mapping**: Salesforce field types to appropriate Faker.js generators
- **Constraint Respect**: Field length, required, picklist values, etc.
- **Address Coordination**: Realistic address component generation
- **Referential Integrity**: Maintain data consistency across related objects

## Comprehensive Logging & Monitoring

### Unified Logging (CLI & Web Interface)
Both CLI and Web Interface create identical detailed log files in the `logs/` directory with:
- **Generated Data**: Complete payload for each object before insertion
- **Success/Failure Results**: Detailed record-by-record success tracking with Salesforce IDs
- **Error Analysis**: Complete error messages and failure analysis
- **Performance Metrics**: Timing per object and overall session duration
- **Storage Impact**: Estimated storage usage and remaining capacity

### Log File Structure
```json
{
  "sessionInfo": {
    "sessionId": "load_2025-08-03_09-33-07-098Z_i4z2gm",
    "startTime": "2025-08-03T09:33:07.098Z",
    "duration": "2513ms"
  },
  "summary": {
    "successRate": 100,
    "totalRecordsCreated": 42,
    "objectsWithErrors": [],
    "mostCommonErrors": []
  },
  "objectResults": [
    {
      "objectName": "Account",
      "generatedData": [...],
      "results": {
        "successful": [...],
        "failed": [...]
      }
    }
  ]
}
```

## Safety Features

- **Sandbox-only**: Refuses to connect to production orgs  
- **80% Storage Threshold**: Prevents storage limit issues
- **Smart Field Validation**: Respects field constraints and relationships with ~99% success rate
- **Required Field Detection**: Advanced logic handles metadata inconsistencies for critical fields
- **Comprehensive Error Handling**: Detailed error reporting with recovery suggestions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details