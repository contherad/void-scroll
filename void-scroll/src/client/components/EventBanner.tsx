// EventBanner.tsx — Sustained banner for an active void event (endless mode).

import type { VoidEvent } from '../hooks/useVoidEvents';

interface Props {
  event: VoidEvent;
}

export function EventBanner({ event }: Props) {
  return (
    <div className={`event-banner event-banner--${event.type}`} role="status">
      {event.label}
    </div>
  );
}
