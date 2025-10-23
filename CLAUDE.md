# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Outline is a fast, collaborative knowledge base built using React and Node.js. The codebase is a monorepo with frontend, backend, and shared code all written in TypeScript. It uses a real-time collaborative editor powered by ProseMirror and Hocuspocus (Yjs).

## Development Commands

### Setup and Running
```bash
# Start development environment (starts Redis, Postgres, installs SSL certs, and runs dev server)
make up

# Start development with auto-reload on backend changes
yarn dev:watch

# Start backend only (after building)
yarn dev:backend

# Start frontend dev server only
yarn vite:dev
```

### Building
```bash
# Build everything (client, i18n, server)
yarn build

# Build components separately
yarn build:server
yarn vite:build
yarn build:i18n
```

### Testing
```bash
# Run all tests (creates test DB automatically)
make test

# Run tests in watch mode
make watch

# Run specific test suites
yarn test:app        # Frontend tests only
yarn test:server     # Backend tests only
yarn test:shared     # Shared code tests

# Run a single test file in watch mode
yarn test path/to/file.test.ts --watch
```

### Database Migrations
```bash
# Create a new migration
yarn db:create-migration --name my-migration

# Run migrations
yarn db:migrate

# Run migrations on test database
yarn db:migrate --env test

# Rollback last migration
yarn db:rollback

# Reset database (drop, create, migrate)
yarn db:reset
```

### Code Quality
```bash
# Lint code with oxlint (type-aware)
yarn lint

# Lint only changed files
yarn lint:changed

# Format code with Prettier
yarn format

# Check formatting without modifying files
yarn format:check
```

## Architecture

### Monorepo Structure

The codebase is organized into three main directories:

- **`app/`** - Frontend React application
- **`server/`** - Backend API and services
- **`shared/`** - Code shared between frontend and backend
- **`plugins/`** - Plugin system for integrations (auth providers, storage, etc.)

### Frontend (`app/`)

Built with React, MobX for state management, and Styled Components for styling. Uses Vite for bundling.

Key directories:
- `actions/` - Reusable actions (navigating, opening, creating entities)
- `components/` - Reusable React components
- `editor/` - Editor-specific React components
- `hooks/` - Custom React hooks
- `menus/` - Context menus used across the UI
- `models/` - MobX observable state models (Document, Collection, User, etc.)
- `routes/` - Route definitions with lazy-loaded chunks
- `scenes/` - Full-page views composed of multiple components
- `stores/` - Collections of models with fetch logic (RootStore pattern)
- `utils/` - Frontend-specific utilities

State management follows MobX patterns with observables. Styles are co-located with components.

### Backend (`server/`)

Built with Koa for HTTP server, Sequelize ORM for PostgreSQL, Bull for job queues, and Redis for caching/pub-sub.

Key directories:
- `routes/api/` - All API endpoints (REST)
- `routes/auth/` - Authentication routes for OAuth providers
- `commands/` - Complex multi-model operations (e.g., DocumentMover, CollectionExporter)
- `models/` - Sequelize models (Document, Collection, User, Team, etc.)
- `policies/` - Authorization logic using cancan pattern
- `presenters/` - JSON serializers that format models for API responses
- `middlewares/` - Koa middlewares (authentication, rate limiting, etc.)
- `queues/` - Background job definitions
  - `processors/` - Event-based job processors (handle events from event bus)
  - `tasks/` - Arbitrary async tasks (scheduled jobs, imports, exports)
- `services/` - Distinct services that can be run separately:
  - `web` - Main HTTP API server
  - `websockets` - Real-time event notifications via Socket.io
  - `collaboration` - Real-time document collaboration via Hocuspocus/Yjs
  - `worker` - Background job processor
  - `cron` - Scheduled tasks
  - `admin` - Bull admin UI
- `collaboration/` - Hocuspocus extensions for collaborative editing
- `emails/` - Email templates and sending logic
- `migrations/` - Database schema migrations
- `storage/` - Storage adapters (S3, local, etc.)
- `test/` - Test helpers and fixtures

### Shared (`shared/`)

Code shared between client and server:
- `editor/` - ProseMirror-based editor (nodes, marks, plugins, commands)
  - Core editor implementation with custom nodes (headings, lists, tables, etc.)
  - Editor extensions and plugins
  - Markdown serialization/deserialization
- `components/` - React components used in both frontend and backend (email templates)
- `i18n/locales/` - Translation files
- `utils/` - Shared utility functions
- `validations.ts` - Shared validation schemas

### Plugin System

Outline has a plugin architecture (`server/utils/PluginManager.ts`) for extending functionality:

**Plugin Types (Hooks):**
- `Hook.API` - Additional API routes
- `Hook.AuthProvider` - OAuth authentication providers (Google, Slack, Azure, OIDC, etc.)
- `Hook.EmailTemplate` - Custom email templates
- `Hook.IssueProvider` - Issue tracking integrations (Linear, GitHub)
- `Hook.Processor` - Custom event processors
- `Hook.Task` - Custom background tasks
- `Hook.UnfurlProvider` - URL preview providers
- `Hook.Uninstall` - Cleanup logic when integrations are removed

Plugins are organized in `plugins/` directory by integration type (e.g., `plugins/google/`, `plugins/slack/`).

### Real-time Collaboration

Documents use Yjs for CRDT-based collaborative editing:

1. **Hocuspocus Server** (`server/services/collaboration.ts`) - WebSocket server for syncing Yjs documents
2. **Extensions** (`server/collaboration/`) - Custom Hocuspocus extensions:
   - `AuthenticationExtension` - Validates user tokens
   - `PersistenceExtension` - Saves document state to database
   - `ViewsExtension` - Tracks document views
   - `ConnectionLimitExtension` - Rate limiting for connections
   - `EditorVersionExtension` - Version compatibility checks
   - `LoggerExtension` & `MetricsExtension` - Observability
3. **Redis Extension** - Multi-server synchronization (when `REDIS_COLLABORATION_URL` is set)
4. **Frontend Provider** - `@hocuspocus/provider` connects ProseMirror to Yjs

### Database & ORM

- **PostgreSQL** - Primary database
- **Sequelize** - ORM with TypeScript decorators (`sequelize-typescript`)
- **Models** - Located in `server/models/`, using class-based definitions with decorators
- **Migrations** - Located in `server/migrations/`, managed by Sequelize CLI

Key models: Document, Collection, User, Team, Group, Comment, Revision, Share, Integration

### Background Jobs

Uses Bull (Redis-based queue):
- **Event Bus** - `server/models/` emit events that trigger processors
- **Processors** (`server/queues/processors/`) - React to events (e.g., when document is updated, send notifications)
- **Tasks** (`server/queues/tasks/`) - Standalone async jobs (imports, exports, email sending)
- **Worker Service** - Processes jobs from queues

### Path Aliases

TypeScript path aliases are configured in `tsconfig.json` and `vite.config.ts`:
- `~/*` → `app/*` (frontend code)
- `@server/*` → `server/*` (backend code)
- `@shared/*` → `shared/*` (shared code)

## Key Technical Details

### Services Architecture

The backend can run multiple services simultaneously or separately. The main entry point (`server/index.ts`) accepts a `--services` flag:

```bash
# Run all services (typical production)
node build/server/index.js --services=web,collaboration,websockets,worker,cron

# Development (from package.json)
yarn dev  # runs api,collaboration services
```

Services can scale independently - e.g., run multiple worker processes or separate collaboration servers.

### Authorization Pattern

Uses cancan-style policies (`server/policies/`):
- Each model has a corresponding policy (e.g., `DocumentPolicy.ts`)
- Policies define abilities: `read`, `update`, `delete`, `share`, etc.
- Middleware (`server/middlewares/authentication.ts`) loads user and enforces policies
- Check abilities: `authorize(user, "read", document)`

### API Response Format

All API responses use presenters (`server/presenters/`) to serialize models:
- Presenters transform Sequelize models into JSON
- Include only necessary fields for API consumers
- Apply permissions (e.g., hide email addresses based on user role)
- Middleware (`server/routes/api/middlewares/apiResponse.ts`) wraps responses

### Editor Architecture

The editor is built on ProseMirror with custom schema:
- **Nodes** (`shared/editor/nodes/`) - Document elements (paragraph, heading, image, table, etc.)
- **Marks** (`shared/editor/marks/`) - Text formatting (bold, italic, link, etc.)
- **Commands** (`shared/editor/commands/`) - Editor actions
- **Plugins** (`shared/editor/plugins/`) - Editor behavior (history, keymaps, collab)
- **Markdown** - Bidirectional conversion between ProseMirror and Markdown

Collaboration uses Y.js binding (`y-prosemirror`) to sync editor state.

### Environment Configuration

Configuration is loaded from:
1. `.env` file (development) or `.env.test` (testing)
2. Environment variables (production)
3. Parsed and validated in `server/env.ts`

Use `@dotenvx/dotenvx` for loading environment variables.

### Testing Strategy

- Tests are co-located with source files (`*.test.ts`)
- Jest is the test runner
- Frontend tests use `jsdom` environment
- Backend tests use real Postgres database (automatically created by `make test`)
- Factories and fixtures in `server/test/`
- Run tests in timezone-safe mode: `TZ=UTC jest`

## Common Development Patterns

### Creating a New API Endpoint

1. Create route file in `server/routes/api/[resource]/`
2. Define route with schema validation (using Zod or class-validator)
3. Add authorization check using policy
4. Implement business logic (consider using `commands/` for complex operations)
5. Return data using presenter
6. Add tests in co-located `.test.ts` file

### Creating a New Model

1. Create model class in `server/models/[Model].ts` with Sequelize decorators
2. Export from `server/models/index.ts`
3. Create migration in `server/migrations/`
4. Create policy in `server/policies/[Model]Policy.ts`
5. Create presenter in `server/presenters/[model].ts`
6. Add model to TypeScript types if needed

### Adding a Background Job

1. Create processor in `server/queues/processors/` for event-driven jobs
2. Or create task in `server/queues/tasks/` for standalone jobs
3. Register via PluginManager if from a plugin
4. Emit events from models to trigger processors

### Creating a Plugin

1. Create directory in `plugins/[name]/`
2. Create `server/` subdirectory for backend code
3. Create `app/` subdirectory for frontend code (if needed)
4. Use `PluginManager.add()` to register hooks
5. See existing plugins (e.g., `plugins/slack/`, `plugins/google/`) for examples

## Debugging

Set environment variables to enable debug logging:
- `DEBUG=http` - HTTP request logging
- `DEBUG=database` - Database query logging
- `DEBUG=*` - All debug logs
- `LOG_LEVEL=debug` or `LOG_LEVEL=silly` - More verbose logging

Logs are JSON in production, human-readable in development.

## Important Notes

- Tests must be sufficiently comprehensive for API endpoints and authentication
- Prettier and Oxlint are enforced by CI
- Use TypeScript strict mode features (nullability checks, etc.)
- Follow existing patterns for state management (MobX observables)
- Keep components and styles co-located
- Use presenters for all API responses
- Always use policies for authorization checks
- Commands should be used for complex operations across multiple models
