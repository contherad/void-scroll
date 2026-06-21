// HUD.tsx — Score display, level indicator, and target progress.
//
// `score` is the feed's current distance from the middle (rises and falls live);
// the progress bar tracks it, so it drops back when you let the feed fall — you
// only clear by reaching the target while aloft. `best` is the high-water mark
// (the endless leaderboard number).

import { depthZone } from '../lib/levels';

interface Props {
  score: number;
  best: number;
  level: number;
  label: string;
  target: number;
  endless: boolean;
  daily?: boolean;
  phrase?: string;
  collected?: Set<number>;
  wordsDone?: number;
  onEndRun: () => void;
  onQuit?: () => void;
}

export function HUD({
  score,
  best,
  level,
  label,
  target,
  wordsDone = 0,
  endless,
  daily,
  phrase,
  collected,
  onEndRun,
  onQuit,
}: Props) {
  const progress = endless ? 0 : Math.min(100, (score / target) * 100);
  const zone = depthZone(best);
  const heading = daily
    ? `DAILY · ${zone}`
    : endless
      ? `ENDLESS · ${zone}`
      : `LEVEL ${level}`;
  const phraseDone = phrase != null && collected != null && collected.size >= phrase.length;

  return (
    <div className="hud">
      <div className="hud__top">
        {onQuit && (
          <button className="hud__quit" onClick={onQuit} aria-label="Quit to menu">
            ✕
          </button>
        )}
        <span className="hud__level">
          {heading}
          {!endless && ` · ${label}`}
        </span>
        {endless && (
          <button className="hud__end" onClick={onEndRun}>
            End run
          </button>
        )}
      </div>

      <div className="hud__score" aria-live="off">
        {(endless ? best : score).toLocaleString()}
      </div>

      {endless ? (
        <div className="hud__progress">
          <div
            className={'hud__progress-bar' + (score >= best ? ' hud__progress-bar--record' : '')}
            style={{ width: `${best > 0 ? Math.min(100, (score / best) * 100) : 100}%` }}
          />
          <span className="hud__progress-label">
            {score >= best
              ? `now ${score.toLocaleString()} · deepest yet`
              : `now ${score.toLocaleString()} · ${(best - score).toLocaleString()} to your best`}
          </span>
        </div>
      ) : (
        <div className="hud__progress">
          <div className="hud__progress-bar" style={{ width: `${progress}%` }} />
          <span className="hud__progress-label">
            {score.toLocaleString()} / {target.toLocaleString()}
          </span>
        </div>
      )}

      {phrase && collected && (
        <div className={'hud__phrase' + (phraseDone ? ' hud__phrase--done' : '')}>
          {wordsDone > 0 && <span className="hud__phrase-count">✦{wordsDone}</span>}
          {phrase.split('').map((ch, i) => (
            <span
              key={i}
              className={'hud__phrase-ch' + (collected.has(i) ? ' is-lit' : '')}
            >
              {collected.has(i) ? ch : '·'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
