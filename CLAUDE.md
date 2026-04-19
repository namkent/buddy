# Project Context: MES Buddy

Professional AI chat application built with Next.js and Assistant-UI.

## Technology Stack
- **Framework**: Next.js 16+ (App Router)
- **UI Library**: assistant-ui (https://www.assistant-ui.com)
- **Styling**: Vanilla CSS, Shadcn UI
- **Database**: PostgreSQL (pg)
- **Authentication**: NextAuth.js

## Agent Skills & External Documentation
This project is integrated with `assistant-ui` Agent Skills. Always use these URLs as context for development:
- **Comprehensive Docs**: https://www.assistant-ui.com/llms-full.txt
- **Quick Reference**: https://www.assistant-ui.com/llms.txt

## Development Workflow
1.  **Code Style**: TypeScript, strictly typed.
2.  **Linting**: Use Biome (`pnpm lint`).
3.  **UI/UX**: Prioritize premium aesthetics and smooth animations.
4.  **Database**: Migrations and schema changes should be added to `lib/db.ts` in the `initTables` method.

## Cleanup & Maintenance
- **Cron Jobs**: Daily maintenance at 00:00 (see `lib/cron.ts`).

## Instructions for AI Assistants
- When working on chat features, always fetch the latest primitives documentation from the URLs above.
- Follow the architectural patterns established in `lib/` for database and API logic.
