// FICTIONAL people for the preview's demo sign-in and for tests. In the real
// site, supervisors sign in with an emailed link and the list lives in the
// `supervisors` collection.

export const PREVIEW_SUPERVISORS = [
  { email: 'avery.lead@example.org', name: 'Avery Lead', active: true, canManageSupervisors: true },
  { email: 'blake.sup@example.org', name: 'Blake Sup', active: true, canManageSupervisors: false },
  { email: 'former.sup@example.org', name: 'Former Sup', active: false, canManageSupervisors: false },
];

// Who you can "sign in as" in the preview, including people who can't edit,
// so the permission rules can be tried out.
export const PREVIEW_PEOPLE = [
  { uid: 'u-avery', email: 'avery.lead@example.org', name: 'Avery Lead', hint: 'Supervisor who also manages the supervisor list' },
  { uid: 'u-blake', email: 'blake.sup@example.org', name: 'Blake Sup', hint: 'Supervisor' },
  { uid: 'u-former', email: 'former.sup@example.org', name: 'Former Sup', hint: 'Former supervisor whose access was turned off' },
  { uid: 'u-viewer', email: 'casey.viewer@example.org', name: 'Casey Viewer', hint: 'Not on the supervisor list' },
];
