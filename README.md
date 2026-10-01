# Scheduling Review Portal

Lookup-first site for Enterprise Scheduling and Clinical Review exam guidance.
The homepage is **Find an exam**: search by exam name, common wording or order
name, filter by facility and exam type, and see scheduling guidance, clinical
review guidance and facility availability.

## Data modes

| Build | Command | What it includes |
| --- | --- | --- |
| Sample (default) | `npm run build` | Find an exam on fictional sample data (`src/lookup/sampleExams.js`). No Firebase code is bundled, so it cannot read or write the live database. Edit / Review shows an "off in this preview" notice. |
| Live | `VITE_DATA_MODE=live npm run build` | Same homepage, plus the existing Edit / Review tools (`src/App.jsx`) behind the **Edit / Review tools** link. These read and write live Firestore. |

## Search rules

- Ranking: exam name, then common wording (aliases), then order names.
- Aliases (protocol matching wording) are stored separately from orderables
  (transcription / order names).
- A special protocol (for example MAKO) is only found by wording that belongs to
  the protocol and not to its parent exam. "CT lower extremity" finds CT Lower
  Extremity, never MAKO. Protocol order names are never searched.

## Commands

```bash
npm run dev     # dev server
npm test        # search tests + a check that the sample build has no Firebase
npm run lint
npm run build
```
