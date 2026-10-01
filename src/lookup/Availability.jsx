const LABELS = {
  yes: { icon: '✓', text: 'Offered' },
  limited: { icon: '!', text: 'Limited' },
  no: { icon: '✕', text: 'Not offered' },
  unknown: { icon: '?', text: 'Not listed' },
};

export const AvailabilityBadge = ({ availability, compact = false }) => {
  const { icon, text } = LABELS[availability] || LABELS.unknown;
  return (
    <span className={`avail avail--${availability}${compact ? ' avail--compact' : ''}`}>
      <span aria-hidden="true">{icon}</span> {text}
    </span>
  );
};
