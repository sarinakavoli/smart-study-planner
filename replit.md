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
- Task file attachments stored in Firebase Storage, with metadata stored on each Firestore task document

## Secrets & Environment Variables

| Name | Where stored | Who reads it | Exposed to browser? |
|------|-------------|--------------|---------------------|
| `GOOGLE_CLIENT_ID` | Replit Secret (encrypted) | Backend only (`SecretManagerService`) | Never |
| `GOOGLE_CLIENT_SECRET` | Replit Secret (encrypted) | Backend only (`SecretManagerService`) | Never |
| `GOOGLE_REFRESH_TOKEN` | Replit Secret (encrypted) | Backend only (`SecretManagerService`) | Never |
| `GCP_PROJECT_ID` | Replit Environment Variable | Backend only (`application.properties`) | Never |
| `VITE_FIREBASE_*` | Replit Environment Variables | Frontend build (public identifiers) | Yes (by design — Firebase web SDK requires this) |
| `PGHOST/PGUSER/etc.` | Replit Secrets (auto-provisioned) | Backend only | Never |

- Firebase config values are Google-documented as safe to include in frontend code. What keeps Firebase secure is your Security Rules, not hiding the config values.
- The Gemini API key is **not** stored in Replit at all — it lives only in Google Secret Manager under the secret name `GEMINI_API_KEY`. The three `GOOGLE_*` Replit Secrets are bootstrap OAuth2 credentials that allow the backend to authenticate to GCP and read the secret from Secret Manager.

### Why OAuth2 refresh token instead of a service account key?

The GCP org policy `iam.disableServiceAccountKeyCreation` blocks downloading JSON key files.
Workload Identity Federation requires the workload to run on GCP infrastructure — Replit is not GCP.
The solution is **OAuth2 user credentials** (a refresh token tied to your personal Google account).
These three values are stored in Replit Secrets:
  - `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — identify the OAuth2 "Desktop app" client you created in GCP Console.
  - `GOOGLE_REFRESH_TOKEN` — obtained by running `gcloud auth application-default login` locally once.

At runtime, the GCP client library automatically exchanges the refresh token for a short-lived access token. The Gemini key itself is fetched from Secret Manager on the first request and cached in memory.

### GCP setup required before /api/generate works

1. **Create OAuth2 Client ID** — GCP Console → APIs & Services → Credentials →
   Create Credentials → OAuth 2.0 Client ID → Application type: **Desktop app**.
   Download the JSON; copy `client_id` and `client_secret`.

2. **Grant Secret Manager access** — IAM & Admin → IAM → find your personal Google account
   email → Add role: **Secret Manager Secret Accessor**.

3. **Get a refresh token** — run locally:
   ```
   gcloud auth application-default login \
     --client-id-file=<path-to-downloaded-json> \
     --scopes=https://www.googleapis.com/auth/cloud-platform
   ```
   Open `~/.config/gcloud/application_default_credentials.json` and copy `"refresh_token"`.

4. **Add to Replit Secrets:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
   **Add to Replit Environment Variables:** `GCP_PROJECT_ID` = `dev-sarina`

5. **Create the secret in Secret Manager** — GCP Console → Secret Manager → Create Secret,
   name it exactly `GEMINI_API_KEY`, paste the Gemini API key as the value.

## Generative AI (Gemini)

- `POST /api/generate` — accepts `{"prompt": "..."}`, returns `{"result": "..."}` or an error body.
- `SecretManagerService.java` — authenticates to GCP via OAuth2 user credentials, fetches the `GEMINI_API_KEY` secret from Secret Manager.
- `GenerativeService.java` — calls `SecretManagerService.getSecret("GEMINI_API_KEY")` on the first request, caches the result, then makes the HTTPS call to the Gemini API server-side. The key is never serialised into any response.
- `GenerativeController.java` — the secure proxy endpoint. The browser sends a prompt; the server fetches the key (from cache or Secret Manager) and calls Gemini; only the AI text is returned to the browser.
- If any of the four required config values are missing the endpoint returns HTTP 503 with a message naming the missing values. If the free-tier quota is hit it returns HTTP 429.

### How to verify Secret Manager is being used

The `GEMINI_API_KEY` Replit Secret has been deleted — it no longer exists in Replit.
Any successful response from `POST /api/generate` proves the key was fetched from
Google Secret Manager, since there is no other source for it.

## Firebase Attachments

- Frontend initializes Firebase Auth, Firestore (`smart-study` database), and Storage in `smart-study-planner-frontend/src/firebase.js`
- Task documents include an `attachments` array containing metadata only: `name`, `url`, `path`, `type`, `size`, and `uploadedAt`
- Files are stored in Firebase Storage under `tasks/{taskId}/attachments/{generatedId}-{safeFileName}`
- Creating/editing a task uploads selected files to Storage, gets the download URL, then appends metadata to the task document
- Removing an attachment deletes the Storage object first, then updates the task document attachments array
- Uploaded Storage objects include custom metadata for `userId` and `taskId` to support ownership-aware Storage rules

## Frontend API Calls

All API URLs use relative paths (`/api/...`) which Vite proxies to the backend.

## Database

The Replit built-in PostgreSQL database is used. Schema is managed by **Flyway** (v11.14.1).

- Migrations live in `smart-study-planner-backend/src/main/resources/db/migration/`
- `spring.jpa.hibernate.ddl-auto=validate` — Hibernate validates the schema but never modifies it
- Flyway runs before JPA initializes (ensured by `FlywayConfig` + `EntityManagerFactoryDependsOnPostProcessor`)
- `baselineOnMigrate=true` / `baselineVersion=0` allows the first run on an existing DB
- V1: initial schema (users, courses, tasks)
- V2: dropped the orphaned `categories` table
