// HUD.tsx — Level/zone heading, the big number, a compact depth readout, the
// secret-phrase row and the gate pattern. The depth GAUGE itself is a vertical
// bar on the right edge (rendered in App) — this is just the textual readout.
//
// `score` is the feed's current distance from the middle (rises and falls live).
// `best` is the high-water mark (the endless leaderboard number).

import { depthZone } from '../lib/levels';
import type { OrbKind } from '../hooks/useBonusOrbs';

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
  gatePattern?: OrbKind[];
  gateProgress?: number;
  gateFlash?: boolean;
  gateReady?: boolean;
  gateGlyphs?: Record<OrbKind, string>;
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
  gatePattern = [],
  gateProgress = 0,
  gateFlash = false,
  gateReady = false,
  gateGlyphs,
  onEndRun,
  onQuit,
}: Props) {
  const zone = depthZone(best);
  const heading = daily ? `DAILY · ${zone}` : endless ? `ENDLESS · ${zone}` : `LEVEL ${level}`;
  const phraseDone = phrase != null && collected != null && collected.size >= phrase.length;

  const readout = endless
    ? score >= best
      ? `now ${score.toLocaleString()} · deepest yet`
      : `now ${score.toLocaleString()} · ${(best - score).toLocaleString()} to your best`
    : `${score.toLocaleString()} / ${target.toLocaleString()}`;

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

      <div className={'hud__readout' + (endless && score >= best ? ' hud__readout--record' : '')}>
        {readout}
      </div>

      {phrase && collected && (
        <div className={'hud__phrase' + (phraseDone ? ' hud__phrase--done' : '')}>
          {wordsDone > 0 && <span className="hud__phrase-count">✦{wordsDone}</span>}
          {phrase.split('').map((ch, i) => (
            <span key={i} className={'hud__phrase-ch' + (collected.has(i) ? ' is-lit' : '')}>
              {collected.has(i) ? ch : '·'}
            </span>
          ))}
        </div>
      )}

      {endless && gateGlyphs && gatePattern.length > 0 && !gateReady && (
        <div className={'gatebar' + (gateFlash ? ' gatebar--flash' : '')}>
          <span className="gatebar__label">◆ gate</span>
          {gatePattern.map((k, i) => (
            <span key={i} className={'gatebar__pip' + (i < gateProgress ? ' is-got' : '')}>
              {gateGlyphs[k]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
