# Salesforce Sandbox Data Seeder - Web Application

A modern, browser-based wizard for generating realistic sample data in Salesforce sandbox environments, featuring real-time progress monitoring and AI assistance.

## Features

- 🧙‍♂️ **Step-by-Step Wizard**: Guided interface for data generation
- 🔐 **Secure OAuth 2.0**: Client Credentials Flow authentication
- 🔍 **Smart Discovery**: Automatic object filtering (excludes 780+ system objects)
- 🎯 **Intelligent Selection**: Field analysis with relationship mapping
- 📊 **Storage-Aware**: Real-time storage validation and optimization
- 🎨 **Business-Realistic Data**: Faker.js integration for realistic names, emails, addresses
- 📡 **Real-time Updates**: Live progress with WebSocket monitoring
- 📋 **Comprehensive Logging**: Detailed audit trails matching CLI format
- 📊 **Results Dashboard**: Executive summary with interactive charts and analytics
- 📦 **Complete Log Export**: ZIP downloads with all session logs
- 🤖 **AI Assistant**: Claude AI integration for help and troubleshooting
- 📱 **Responsive Design**: Works on desktop and mobile

## Architecture

### Backend (Express.js + TypeScript)
- **Authentication**: OAuth 2.0 Web Server Flow
- **Discovery**: Salesforce metadata analysis
- **Generation**: Intelligent data creation with relationships
- **Real-time**: WebSocket progress updates
- **AI Integration**: Claude API for assistance

### Frontend (Next.js + React + TypeScript)
- **Wizard Interface**: Multi-step guided experience
- **Real-time UI**: Progress indicators and live updates
- **Responsive Design**: Tailwind CSS for modern styling
- **State Management**: Custom hooks for session management

## Prerequisites

- Node.js 18+ 
- Salesforce Sandbox with Connected App
- (Optional) Anthropic API key for Claude AI

## Quick Start

### 1. Install Dependencies
```bash
cd web
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Salesforce Setup
Create an External Client App in your Salesforce org with:
- OAuth enabled with Client Credentials Flow
- Required scopes: `api`, `refresh_token`
- No callback URL needed for Client Credentials Flow
- Note: Salesforce now uses External Client Apps instead of Connected Apps

### 4. Start Development
```bash
# Start both server and client
npm run dev

# Or start individually
npm run server:dev  # Backend on :3001
npm run client:dev  # Frontend on :3000
```

### 5. Open Browser
Navigate to `http://localhost:3000` and start the wizard!

## Configuration

### Environment Variables
```bash
# Required
SF_CLIENT_ID=your_salesforce_client_id
SF_CLIENT_SECRET=your_salesforce_client_secret

# Optional  
ANTHROPIC_API_KEY=your_claude_api_key
SESSION_SECRET=your_session_secret
```

### Salesforce Connected App Settings
- **Callback URL**: `http://localhost:3001/api/auth/oauth/callback`
- **Scopes**: API, Refresh Token
- **Client Credentials Flow**: Enabled
- **Require Secret for Web Server Flow**: Enabled

## Project Structure

```
web/
├── server/                 # Express.js backend
│   ├── routes/            # API endpoints
│   ├── services/          # Business logic
│   └── types/             # TypeScript definitions
├── pages/                 # Next.js pages
├── components/            # React components
│   ├── wizard/           # Wizard step components
│   └── claude/           # AI assistant components
├── hooks/                # Custom React hooks
├── shared/               # Shared types and utilities
└── styles/               # Global styles
```

## API Endpoints

### Authentication
- `POST /api/auth/client-credentials` - Client Credentials authentication
- `GET /api/auth/status/:sessionId` - Check connection status with auto-reconnection
- `POST /api/auth/config` - Store OAuth credentials

### Discovery
- `POST /api/discovery/start/:sessionId` - Start enhanced schema discovery
- `GET /api/discovery/results/:sessionId` - Get filtered discovery results
- `GET /api/discovery/stats/:sessionId` - Get discovery statistics

### Generation & Execution
- `POST /api/execution/start/:sessionId` - Start data loading with real-time progress
- `GET /api/results/:sessionId` - Get comprehensive execution results
- `GET /api/logs/download/:loadSessionId` - Download all logs as ZIP

### Storage Management
- `GET /api/storage/info/:sessionId` - Get org storage limits and usage

### Claude AI
- `POST /api/claude/chat/:sessionId` - Chat with AI assistant
- `GET /api/claude/help/:sessionId` - Get contextual help
- `POST /api/claude/explain-error/:sessionId` - Explain errors

### Monitoring
- `GET /api/monitoring/system` - System health and stats
- `GET /api/monitoring/analytics` - Usage analytics
- `GET /api/health` - Health check

## WebSocket Events

The application uses WebSocket for real-time updates:

### Client → Server
- `join-session` - Join a session room

### Server → Client  
- `progress` - Real-time discovery and execution progress
- `execution-progress` - Detailed object-level progress updates
- `execution-complete` - Execution completion with loadSessionId
- `execution-log` - Live log streaming during data loading
- `execution-error` - Error notifications with details
- `step-complete` - Step completion notifications
- `error` - General error notifications

## Results Dashboard

The comprehensive Results page provides detailed analysis of data loading:

### Executive Summary
- **Success Rate**: Overall and per-object success metrics
- **Record Counts**: Total attempted, created, and failed records
- **Performance**: Processing time and throughput statistics
- **Storage Impact**: Data storage usage analysis

### Interactive Charts
- **Success Rate by Object**: Vertical bar chart showing completion rates
- **Records Distribution**: Colorized bar chart of records per object
- **Processing Time**: Line chart showing performance by object

### Error Analysis
- **Common Errors**: Most frequent error types with occurrence counts
- **Per-Object Errors**: Expandable error details by object
- **Individual Logs**: Direct access to per-object log files

### Export Options
- **Download All Logs**: ZIP file containing main log + all per-object logs
- **Export Results**: JSON export of summary data and performance metrics

## Development

### Adding New Wizard Steps
1. Create component in `components/wizard/steps/`
2. Add step definition to `pages/wizard.tsx`
3. Implement step logic and API endpoints
4. Add real-time progress handling

### Extending API
1. Create new route in `server/routes/`
2. Add service logic in `server/services/`
3. Update types in `shared/types/`
4. Add frontend integration

## Production Deployment

### Build for Production
```bash
npm run build
```

### Environment Setup
- Set `NODE_ENV=production`
- Use secure session secrets
- Configure HTTPS
- Set proper CORS origins
- Use production database

### Security Considerations
- HTTPS only in production
- Secure session configuration
- Rate limiting enabled
- Input validation
- Error message sanitization

## Troubleshooting

### Common Issues

**OAuth Errors**
- Check Connected App configuration
- Verify callback URL matches exactly
- Ensure Client Credentials Flow is enabled

**WebSocket Connection Issues**
- Check firewall settings
- Verify WebSocket proxy configuration
- Try different transport methods

**Discovery Timeouts**
- Large orgs may take longer
- API limits may cause delays
- Check network connectivity

### Getting Help
- Use the built-in AI assistant
- Check application logs
- Review Salesforce setup guide
- Contact support team

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.