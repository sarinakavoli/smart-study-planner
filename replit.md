# Smart Study Planner

A full-stack study planner application that helps users organize their studies with tasks, categories, and generative AI features.

## Run & Operate

- **Start application**: `npm run dev` (frontend)
- **Backend**: `mvn spring-boot:run` (backend)
- **Environment Variables**: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `GCP_PROJECT_ID`, `VITE_FIREBASE_*`
- **Secrets**: `GCP_SERVICE_ACCOUNT_JSON`

## Stack

- **Frontend**: React, Vite
- **Backend**: Java Spring Boot (Maven), Java 17
- **Database**: PostgreSQL (managed by Flyway)
- **ORM**: Hibernate
- **Build Tool**: Vite, Maven
- **Validation**: Spring Validation
- **Auth**: JWT
- **Cloud Storage**: Firebase Storage
- **AI**: Google Gemini API (via Google Secret Manager)

## Where things live

- **Frontend Source**: `smart-study-planner-frontend/`
- **Backend Source**: `smart-study-planner-backend/`
- **Database Migrations**: `smart-study-planner-backend/src/main/resources/db/migration/`
- **Vite Configuration**: `smart-study-planner-frontend/vite.config.js`
- **Backend Application Properties**: `smart-study-planner-backend/src/main/resources/application.properties`
- **Firebase Configuration**: `smart-study-planner-frontend/src/firebase.js`
- **Firestore Schema Documentation**: `smart-study-planner-frontend/src/utils/firestoreSchema.js`
- **Firestore ID Generation**: `smart-study-planner-frontend/src/utils/firestoreIds.js`
- **Firebase Storage Rules**: `smart-study-planner-frontend/storage.rules`

## Architecture decisions

- **Flat Membership Model**: User organization membership is stored in flat fields on the `users/{uid}` Firestore document, simplifying membership management and removing the need for separate `memberships`, `invitations`, or `userIndex` collections.
- **Human-Readable Document IDs**: New tasks and categories use human-readable, prefixed document IDs generated client-side, improving debuggability and data traceability.
- **Server-Side AI Key Management**: Gemini API key is securely fetched from Google Secret Manager on the backend, ensuring the key is never exposed to the frontend.
- **Role-Based Access Control**: Implemented distinct roles (admin, teacher, student) with specific permissions for creating organizations, inviting users, and managing departments.
- **Database Schema Management**: Flyway is used for database migrations, ensuring schema evolution is controlled and applied before JPA initialization.

## Product

- User authentication (login/register) with JWTs.
- Per-user task and category management with data isolation.
- Support for creating and joining school organizations with role-based access.
- Generative AI assistance for tasks via Google Gemini.
- File attachment support for tasks using Firebase Storage.
- Calendar view, overdue task tracking, and search functionality.
- Drag-and-drop reordering for custom categories.

## User preferences

- _Populate as you build_

## Gotchas

- **GCP Setup Required for AI**: The `/api/generate` endpoint will not function until Google Cloud Platform Secret Manager is properly configured with the `GEMINI_API_KEY` and the backend has access via a service account.
- **Invitee Must Register First**: Users must have a registered account before an admin can invite them to an organization.
- **Flyway Baseline**: `baselineOnMigrate=true` allows Flyway to run on an existing database, but new migrations should be carefully managed.
- **CORS Configuration**: The backend currently allows all origins for CORS, which might need to be restricted for production environments.

## Pointers

- **React Documentation**: [https://react.dev/](https://react.dev/)
- **Vite Documentation**: [https://vitejs.dev/](https://vitejs.dev/)
- **Spring Boot Documentation**: [https://spring.io/projects/spring-boot](https://spring.io/projects/spring-boot)
- **PostgreSQL Documentation**: [https://www.postgresql.org/docs/](https://www.postgresql.org/docs/)
- **Firebase Documentation**: [https://firebase.google.com/docs](https://firebase.google.com/docs)
- **Google Cloud Secret Manager Documentation**: [https://cloud.google.com/secret-manager/docs](https://cloud.google.com/secret-manager/docs)
- **Google Gemini API Documentation**: [https://ai.google.dev/](https://ai.google.dev/)