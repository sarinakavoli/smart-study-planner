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

- `POST /api/auth/login` – Takes `{username, password}`, returns `{id, name, token}` (signed JWT)
- `POST /api/auth/register` – Same response shape as login, also issues a JWT
- Frontend stores user in `localStorage` as `currentUser`
- All protected API requests must include `Authorization: Bearer <token>` header
- JWT is signed with HMAC-SHA256 using `jwt.secret` from application.properties (24-hour expiry)
- `JwtAuthFilter` validates the token on every request and sets the caller identity in the request attribute `authenticatedUserId`
- `SecurityConfig` permits `/api/auth/**` without auth; all other endpoints require a valid JWT
- The old `X-Requesting-User-Id` header and `HttpSession`-based identity checks have been removed

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
| `GCP_SERVICE_ACCOUNT_JSON` | Replit Secret (encrypted) | Backend only (`SecretManagerService`) | Never |
| `GCP_PROJECT_ID` | Replit Environment Variable | Backend only (`application.properties`) | Never |
| `VITE_FIREBASE_*` | Replit Environment Variables | Frontend build (public identifiers) | Yes (by design — Firebase web SDK requires this) |
| `PGHOST/PGUSER/etc.` | Replit Secrets (auto-provisioned) | Backend only | Never |

- Firebase config values are Google-documented as safe to include in frontend code. What keeps Firebase secure is your Security Rules, not hiding the config values.
- The Gemini API key is **not** stored in Replit at all — it lives only in Google Secret Manager under the secret name `GEMINI_API_KEY`.
- `GCP_SERVICE_ACCOUNT_JSON` holds the full JSON content of a GCP service account key. The service account must have the **Secret Manager Secret Accessor** role.

### GCP setup required before /api/generate works

1. **Enable the Secret Manager API** — GCP Console → APIs & Services → Enable APIs →
   search for "Secret Manager API" → Enable.

2. **Create a service account** — IAM & Admin → Service Accounts → Create Service Account.
   Grant it the role **Secret Manager Secret Accessor**.
   Go to its Keys tab → Add Key → Create new key → JSON. Download the file.

3. **Add to Replit Secrets:** `GCP_SERVICE_ACCOUNT_JSON` = paste the entire JSON file content.
   **Add to Replit Environment Variables:** `GCP_PROJECT_ID` = your GCP project ID.

4. **Create the secret in Secret Manager** — GCP Console → Secret Manager → Create Secret,
   name it exactly `GEMINI_API_KEY`, paste the Gemini API key as the value.

## Generative AI (Gemini)

- `POST /api/generate` — accepts `{"prompt": "..."}`, returns `{"result": "..."}` or an error body.
- `SecretManagerService.java` — authenticates to GCP using the service account JSON key, fetches the `GEMINI_API_KEY` secret from Secret Manager.
- `GenerativeService.java` — calls `SecretManagerService.getSecret("GEMINI_API_KEY")` on the first request, caches the result, then makes the HTTPS call to the Gemini API server-side. The key is never serialised into any response.
- `GenerativeController.java` — the secure proxy endpoint. The browser sends a prompt; the server fetches the key (from cache or Secret Manager) and calls Gemini; only the AI text is returned to the browser.
- If `GCP_SERVICE_ACCOUNT_JSON` or `GCP_PROJECT_ID` are missing the endpoint returns HTTP 503 naming what is absent. If quota is hit it returns HTTP 429.

### How to verify Secret Manager is being used

The `GEMINI_API_KEY` Replit Secret does not exist — it was deleted when the GSM integration was built.
Any successful response from `POST /api/generate` proves the key came from Google Secret Manager,
since there is no other source for it. On the first request the backend log will print:
`GEMINI_API_KEY retrieved from Secret Manager and cached.`

## School Organization & Membership Model

The app uses a **school-org model**: one admin creates a school organization, then invites teachers and students. Invited users auto-join on their next login. No organization is auto-created for every new user.

### Organizations collection (`organizations/{organizationId}`)

```
  id:                  organizationId
  name:                school name
  ownerId:             uid of admin creator      ← used by Firestore rules
  ownerEmail:          email of admin            ← debugging/display only
  memberIds:           [uid1, uid2, ...]          ← used by Firestore rules
  memberEmails:        [email1, email2, ...]      ← parallel to memberIds, debugging only
  pendingInviteEmails: [email, ...]               ← emails with pending invitations, Firestore rules
  createdAt:           serverTimestamp()
  updatedAt:           serverTimestamp()
```

### Memberships collection (`memberships/{membershipId}`)

```
  organizationId:  target organization ID
  userId:          Firebase Auth UID of the member
  email:           member's email
  role:            "admin" | "teacher" | "student"
  status:          "active"
  createdAt:       serverTimestamp()
```

- Membership ID format: `mbr_<shortUserId>_<shortOrgId>`
- Service: `src/services/membershipService.js` — `getActiveMembership(uid)`, `createMembership({...})`

### Role-based behavior

| Role    | Can create org | Can invite | Can add/edit tasks | Can see tasks |
|---------|---------------|------------|-------------------|---------------|
| admin   | ✅             | ✅          | ✅                 | ✅             |
| teacher | ❌             | ❌          | ✅                 | ✅             |
| student | ❌             | ❌          | ✅                 | ✅             |

- The **Invite User** sidebar button is only visible to admins.
- Teachers and students never see the org creation screen.

### Login flow (onAuthStateChanged in App.jsx)

1. Read `users/<uid>` to get existing data.
2. Query `memberships` for an active membership → if found, set `resolvedOrgId` and `resolvedRole`.
3. If no membership found:
   - Check `invitations` for a pending invite matching the user's email.
   - If found: call `acceptInvitation()` + `createMembership()` with the invited role.
   - If not found: show the `CREATE_ORG` screen ("only if you are the school/admin owner").
4. Refresh the `users/<uid>` doc.
5. Write the debugging `userIndex/<readableId>` entry.

> **No auto-org, no auto-admin.** There is no automatic personal workspace or admin role assignment.
> Every user must either have an active membership, accept an invitation, or explicitly create a school org.

## Organization Invitation System

Only admins can invite users. The **Invite User** panel lets admins choose a role (teacher or student).

### Invitation document schema (`invitations/{inviteId}`)

```
  readableId:       same as document ID
  organizationId:   target organization ID
  organizationName: display name of the target org
  invitedEmail:     email being invited (normalized to lower-case)
  invitedByUserId:  UID of the inviting admin
  invitedByEmail:   email of the inviting admin
  role:             "teacher" | "student"
  status:           "pending" | "accepted" | "declined"
  createdAt:        serverTimestamp()
  acceptedAt:       null | serverTimestamp()
  declinedAt:       null | serverTimestamp()
  expiresAt:        null (optional future use)
```

### Invitation document ID format

`invite_<shortOrgId>_<emailSlug>_<shortRandom>`
- Generated by `generateInviteId()` in `src/utils/firestoreIds.js`

### Flow

1. Admin opens **Invite User** panel → enters email + selects role (teacher/student).
2. `createInvitation()` writes the invitation with the chosen role and adds the email to `pendingInviteEmails`.
3. On the invited user's next sign-in, `onAuthStateChanged` (Step 3):
   - Detects pending invitation for their email.
   - Calls `acceptInvitation()` — adds to `memberIds`, removes from `pendingInviteEmails`, updates `users/<uid>.organizationId`.
   - Calls `createMembership()` with the invitation's role.
4. User lands in the app with the correct org and role already set.

### Firestore security rules for invitations

- **Read**: inviter (`invitedByUserId == auth.uid`) or invitee (`auth.token.email == invitedEmail`).
- **Create**: inviter must be an org member (checked via `get()` on the org doc).
- **Update**: only the invitee (`auth.token.email == invitedEmail`) can update (to accept).
- **Delete**: not allowed.
- **Organization update rule**: extended to allow a user whose email is in `pendingInviteEmails` to add themselves as a member.

## Firestore Document ID Strategy & Multi-Org Design

- All newly created tasks and categories use **human-readable, prefixed document IDs** instead of Firestore auto-IDs
- ID generation lives in `smart-study-planner-frontend/src/utils/firestoreIds.js`:
  - `slugify(text)` — lowercase, alphanumeric + hyphens, max 30 chars
  - `personalOrgId(uid)` → `org_<uid>` (personal-org placeholder, ready to swap for a real org ID)
  - `generateTaskId(orgId, userId)` → `task_<orgId>_<userId>_<nanoid(10)>`
  - `generateCategoryId(orgId, name)` → `cat_<orgId>_<slugifiedName>_<nanoid(10)>`
- Schema documentation (comment-only, not imported) lives in `smart-study-planner-frontend/src/utils/firestoreSchema.js`
- New tasks and categories include `organizationId` and `readableId` fields in every document
- On every login/signup, a `users/<uid>` document is written (with `merge: true`) containing `{ email, organizationId, createdAt }`
- Existing data is untouched — the new ID strategy applies only to newly created documents
- `taskService.js` has comments marking exactly where to add `organizationId` filters when real multi-org support is activated
- `scripts/seed-organizations.mjs` — Admin SDK script that creates personal org docs in the `organizations` collection and refreshes `users/<uid>` docs; supports `--delete` to clean up seed data

## Seed Script Testing

- `smart-study-planner-frontend/scripts/seed-scripts-cli.test.js` — CLI integration tests for `seed-categories.mjs` and `seed-tasks.mjs`
- Tests spawn the scripts as child processes using `--dry-run` mode, which skips Firebase SDK init so no GCP credentials are needed
- 45 tests covering: `--dry-run` (basic, `--count`, `--users`, `--email`, `--delete`, `--undo-last`), error paths (invalid flags, empty args, conflicting flags), and the credential-guard (exits 1 without `GCP_SERVICE_ACCOUNT_JSON`)
- The CI cache key for `frontend-check` now includes `scripts/**` so any change to a seed script or its test file busts the cache and triggers a fresh test run
- `smart-study-planner-frontend/scripts/seed-user-resolver.test.js` — unit tests for `seed-user-resolver.mjs` (file loading, email-to-UID resolution, mixed-entry resolution)
- All seed tests run automatically under `npm test` (vitest)

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
