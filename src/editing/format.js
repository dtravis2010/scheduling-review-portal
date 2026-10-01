export const formatWhen = (iso) => {
  if (!iso) return 'Date not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date not recorded';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
