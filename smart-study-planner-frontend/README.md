# Smart Study Planner — Frontend

## Firebase Environment Setup

This app uses **separate Firestore databases and Storage buckets** for development and production, inside the same Firebase project (`sarina-dev`). Firebase Auth is shared because it is project-scoped.

| Resource | Development | Production |
|---|---|---|
| Firestore database | `smart-study` | `smart-study-prd` |
| Storage bucket | *(your dev bucket)* | *(your prod bucket)* |
| Firebase Auth | shared | shared |

### Environment files

| File | Used when |
|---|---|
| `.env.development` | `npm run dev` (Vite dev server) |
| `.env.production` | `npm run build` (production build) |

Fill in the blank `VITE_FIREBASE_*` values in both files. Paste the dev bucket name in `.env.development` and the prod bucket name in `.env.production`.

Required variables in each file:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIRESTORE_DATABASE_ID   # smart-study (dev) or smart-study-prd (prod)
VITE_FIREBASE_STORAGE_BUCKET # bucket name for that environment
```

### Testing dev

Run `npm run dev` and open the browser console. You should see:

```
Current Firestore database: smart-study
Current Storage bucket: <your-dev-bucket>
```

### Testing a production build

```bash
npm run build
npm run preview
```

The console log is suppressed in production builds. To verify the correct database is in use, check the Firebase Console → Firestore → pick the `smart-study-prd` database and confirm writes appear there.

---

## React + Vite

This template uses [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) with Oxc transforms.

### Expanding the ESLint configuration

For production apps, consider TypeScript with type-aware lint rules. See the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) and [`typescript-eslint`](https://typescript-eslint.io).
