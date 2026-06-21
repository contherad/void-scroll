// MilestoneToast.tsx — A transient cheer that pops when an endless milestone is
// crossed ("Whoa — 1,000!"). Keyed by message so each one replays the pop.

interface Props {
  message: string;
}

export function MilestoneToast({ message }: Props) {
  return (
    <div className="milestone" key={message} aria-live="polite">
      <span className="milestone__text">{message}</span>
    </div>
  );
}
