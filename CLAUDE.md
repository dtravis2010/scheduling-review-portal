# CLAUDE.md

## Project Overview

Scheduling Review Portal — a React web app for medical professionals to review and comment on scheduling instructions and clinical review information for medical procedures. Procedure data is synced to Firebase Firestore; reviewers can mark procedures complete and add comments.

## Tech Stack

- **Framework:** React 19 (JSX, no TypeScript)
- **Build:** Vite 8
- **Backend:** Firebase Firestore
- **Deployment:** GitHub Pages via `gh-pages`

## Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build to dist/
npm run lint       # ESLint (js/jsx)
npm test           # Node test runner: search rules + sample build has no Firebase
npm run preview    # Preview production build
npm run deploy     # Build + deploy to GitHub Pages
```

## Project Structure

```
src/
├── Home.jsx        # Entry view: Find an exam; #review opens Edit / Review (live builds only)
├── lookup/         # Find an exam: search.js (ranking + protocol rule), sampleExams.js (fictional data), UI
├── App.jsx         # Edit / Review tools — filtering, modality selection, upload, CSV export
├── App.css         # Dark theme with glassmorphism styling
├── index.css       # Global CSS variables and layout
├── main.jsx        # React entry point
├── firebase.js     # Firebase config and initialization
├── data.json       # Static procedure data
└── Batch_MRI.json  # MRI batch procedure data
```

## Code Conventions

- Pure JavaScript with JSX — no TypeScript
- Functional components with hooks (`useState`, `useEffect`, `useMemo`, `useCallback`)
- camelCase for variables/functions, PascalCase for components
- Arrow functions preferred
- Global CSS with CSS custom properties (no CSS modules)
- ESLint flat config with React Hooks and React Refresh plugins

## Data modes

- Default build is **sample**: fictional data only, Firebase not bundled (guarded by `src/sampleBuild.test.js`).
- `VITE_DATA_MODE=live` adds the Edit / Review tools, which read/write production Firestore.
- Keep the `import.meta.env.VITE_DATA_MODE === 'live'` check inline in `Home.jsx`; moving it into a shared variable stops Vite from dropping Firebase.

## Firebase / Firestore

- Project: `scheduling-review`
- Collections:
  - `reviews` — procedure review data (`comment`, `isFinished`)
  - `procedures` — uploaded procedure data
- Uses `onSnapshot()` for real-time updates, `writeBatch()` for bulk uploads (chunked at 400 ops)
- Procedure names sanitized to remove `/` characters (prevents Firestore subcollection issues)

## Deployment

- GitHub Pages at path `/scheduling-review-portal/`
- Vite `base` config set accordingly in `vite.config.js`
- `npm run deploy` handles build + push to `gh-pages` branch
