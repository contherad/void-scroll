// HUD.tsx — Score display, level indicator, and target progress.
//
// `score` is the feed's current distance from the middle (rises and falls live);
// the progress bar tracks it, so it drops back when you let the feed fall — you
// only clear by reaching the target while aloft. `best` is the high-water mark
// (the endless leaderboard number).

interface Props {
  score: number;
  best: number;
  level: number;
  label: string;
  target: number;
  endless: boolean;
  onEndRun: () => void;
}

export function HUD({ score, best, level, label, target, endless, onEndRun }: Props) {
  const progress = endless ? 0 : Math.min(100, (score / target) * 100);

  return (
    <div className="hud">
      <div className="hud__top">
        <span className="hud__level">
          {endless ? 'ENDLESS' : `LEVEL ${level}`} · {label}
        </span>
        {endless && (
          <button className="hud__end" onClick={onEndRun}>
            End run
          </button>
        )}
      </div>

      <div className="hud__score" aria-live="off">
        {score.toLocaleString()}
      </div>

      {endless ? (
        <div className="hud__hint">best {best.toLocaleString()} · keep it aloft</div>
      ) : (
        <div className="hud__progress">
          <div className="hud__progress-bar" style={{ width: `${progress}%` }} />
          <span className="hud__progress-label">
            {score.toLocaleString()} / {target.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
