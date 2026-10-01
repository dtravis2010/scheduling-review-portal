// Hash routes for the editing screens. The lookup owns #find and #review.
export const editHref = (id) => `#edit/${encodeURIComponent(id)}`;
export const newExamHref = (parentId) => (parentId ? `#new/${encodeURIComponent(parentId)}` : '#new');
export const historyHref = (id) => `#history/${encodeURIComponent(id)}`;
export const examHref = (id) => `#find/${encodeURIComponent(id)}`;
export const ATTENTION_HREF = '#attention';
export const SUPERVISORS_HREF = '#supervisors';
export const DRAFTS_HREF = '#drafts';
export const SIGN_IN_HREF = '#sign-in';

const ROUTES = ['edit', 'new', 'history', 'attention', 'supervisors', 'drafts', 'sign-in'];

// '#edit/ct-mako' → { name: 'edit', id: 'ct-mako' }; null when not an editing route.
export function parseEditingHash(hash) {
  const [name, raw] = String(hash || '').replace(/^#/, '').split('/');
  if (!ROUTES.includes(name)) return null;
  return { name, id: raw ? decodeURIComponent(raw) : '' };
}
