# Smart Study Planner

A full-stack study planner app with a React/Vite frontend and Spring Boot backend connected to PostgreSQL.

## Architecture

- **Frontend**: React + Vite, running on port 5000 (`smart-study-planner-frontend/`)
- **Backend**: Java Spring Boot (Maven), running on port 8080 (`smart-study-planner-backend/`)
- **Database**: Replit PostgreSQL (env vars: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)

## Running the Project

Two workflows are configured:
1. **Start application** – Runs the Vite dev server on port 5000 (webview)
2. **Backend** – Runs Spring Boot on port 8080 (console)

The Vite dev server proxies all `/api` requests to `http://localhost:8080`.

## Key Config

- `smart-study-planner-frontend/vite.config.js` – Vite config with host `0.0.0.0`, port 5000, `allowedHosts: true`, and `/api` proxy
- `smart-study-planner-backend/src/main/resources/application.properties` – DB config using env vars
- `smart-study-planner-backend/src/main/java/.../config/WebConfig.java` – CORS config (allows all origins)

## Authentication

- `POST /api/auth/login` – Takes `{username, password}`, auto-registers new users, returns `{id, name}`
- Frontend stores user in `localStorage` as `currentUser`
- All task and category API calls include `?userId=` query param for per-user data isolation
- `Login.jsx` – Login/register screen shown when no user is in localStorage

## Per-User Data

- Tasks and categories both have a `user_id` FK to the `users` table
- All read/write operations are scoped by userId
- The `categories.name` unique constraint was removed (handled at service level per user)

## Features

- Login/register (one-step, auto-registers new users)
- Per-user tasks and categories (data isolation)
- Input validation with field-level error messages
- Loading states on form submission
- Category colors for built-in and custom categories
- Calendar view, overdue task tracking, search
- Drag-to-reorder custom categories

## Frontend API Calls

All API URLs use relative paths (`/api/...`) which Vite proxies to the backend.

## Database

The Replit built-in PostgreSQL database is used. Spring Boot's `ddl-auto=update` auto-creates/updates the schema on startup.
