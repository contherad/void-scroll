// App.tsx — Root component. Owns the game state machine (useReducer) and routes
// between screens: idle -> playing -> transition -> playing... -> leaderboard.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { SwipeCard } from './components/SwipeCard';
import { HUD } from './components/HUD';
import { LevelTransition } from './components/LevelTransition';
import { Leaderboard } from './components/Leaderboard';
import { MilestoneToast } from './components/MilestoneToast';
import { EventBanner } from './components/EventBanner';
import { useSwipePhysics } from './hooks/useSwipePhysics';
import { useVoidEvents } from './hooks/useVoidEvents';
import { getLevel, isEndless, highestMilestone, FEED_CARDS } from './lib/levels';
import { getLeaderboard, getUserBest, submitScore, type ScoreEntry } from './lib/api';

type Phase = 'idle' | 'playing' | 'transition' | 'leaderboard';

interface GameState {
  phase: Phase;
  level: number;
  finalScore: number;
}

type Action =
  | { type: 'START' }
  | { type: 'CLEAR_LEVEL'; score: number }
  | { type: 'CONTINUE' }
  | { type: 'END_RUN'; score: number }
  | { type: 'PLAY_AGAIN' };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START':
      return { phase: 'playing', level: 1, finalScore: 0 };
    case 'CLEAR_LEVEL':
      return { ...state, phase: 'transition', finalScore: action.score };
    case 'CONTINUE':
      return { ...state, phase: 'playing', level: state.level + 1 };
    case 'END_RUN':
      return { ...state, phase: 'leaderboard', finalScore: action.score };
    case 'PLAY_AGAIN':
      return { phase: 'idle', level: 1, finalScore: 0 };
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, { phase: 'idle', level: 1, finalScore: 0 });

  return (
    <div className="phone">
      <div className="screen">
        {state.phase === 'idle' && <IdleScreen onStart={() => dispatch({ type: 'START' })} />}

        {state.phase === 'playing' && (
          <Game
            key={state.level}
            level={state.level}
            onClear={(score) => dispatch({ type: 'CLEAR_LEVEL', score })}
            onEndRun={(score) => dispatch({ type: 'END_RUN', score })}
          />
        )}

        {state.phase === 'transition' && (
          <LevelTransition
            cleared={getLevel(state.level)}
            next={getLevel(state.level + 1)}
            score={state.finalScore}
            onContinue={() => dispatch({ type: 'CONTINUE' })}
          />
        )}

        {state.phase === 'leaderboard' && (
          <LeaderboardScreen
            finalScore={state.finalScore}
            level={state.level}
            onPlayAgain={() => dispatch({ type: 'PLAY_AGAIN' })}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Idle / start screen
// ---------------------------------------------------------------------------

function IdleScreen({ onStart }: { onStart: () => void }) {
  const [best, setBest] = useState<number | null>(null);
  const [top, setTop] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    let alive = true;
    void getUserBest().then((b) => alive && setBest(b));
    void getLeaderboard(3).then((t) => alive && setTop(t));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="idle">
      <div className="idle__title">VOID&nbsp;SCROLL</div>
      <p className="idle__tag">Swipe the card into the void. It pushes back.</p>

      <button className="btn btn--primary btn--lg" onClick={onStart}>
        Tap to play
      </button>

      {best !== null && best > 0 && (
        <div className="idle__best">Your best: {best.toLocaleString()}</div>
      )}

      <div className="idle__board">
        <div className="idle__board-title">Top of the void</div>
        {top.map((e, i) => (
          <div className="idle__board-row" key={`${e.username}-${i}`}>
            <span>{i + 1}. {e.username}</span>
            <span>{e.score.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <p className="idle__hint">It falls back to the middle · keep it aloft with two thumbs</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// In-play screen (remounts per level via key, so physics resets cleanly)
// ---------------------------------------------------------------------------

function Game({
  level,
  onClear,
  onEndRun,
}: {
  level: number;
  onClear: (score: number) => void;
  onEndRun: (score: number) => void;
}) {
  const config = getLevel(level);
  const endless = isEndless(level);
  const clearedRef = useRef(false);

  // Void events (endless only) modulate resistance / gain.
  const events = useVoidEvents(endless);
  const physics = useSwipePhysics(config.k * events.kMultiplier, events.gainMultiplier);

  // Clear when your LIVE score reaches the target (the bar must be full) — you
  // have to get there while the feed is aloft, not bank it across falls.
  useEffect(() => {
    if (!endless && !clearedRef.current && physics.score >= config.target) {
      clearedRef.current = true;
      onClear(physics.score);
    }
  }, [endless, physics.score, config.target, onClear]);

  // Endless milestones — cheer the first time `best` crosses each threshold.
  const [milestone, setMilestone] = useState<string | null>(null);
  const lastMilestoneRef = useRef(0);
  const milestoneTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!endless) return;
    const m = highestMilestone(physics.best);
    if (m && m.value > lastMilestoneRef.current) {
      lastMilestoneRef.current = m.value;
      setMilestone(m.message);
      if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
      milestoneTimer.current = window.setTimeout(() => setMilestone(null), 1700);
    }
  }, [endless, physics.best]);

  useEffect(() => () => { if (milestoneTimer.current) clearTimeout(milestoneTimer.current); }, []);

  const handleEnd = useCallback(() => onEndRun(physics.best), [onEndRun, physics.best]);

  return (
    <div className={'game' + (events.event ? ` game--${events.event.type}` : '')}>
      <HUD
        score={physics.score}
        best={physics.best}
        level={level}
        label={config.label}
        target={config.target}
        endless={endless}
        onEndRun={handleEnd}
      />
      <SwipeCard
        distance={-physics.visualY}
        hero={config.card}
        pool={FEED_CARDS}
        tint={events.event?.type}
        handlers={physics.handlers}
      />
      {events.event && <EventBanner event={events.event} />}
      {milestone && <MilestoneToast message={milestone} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard screen (submits the run, then shows the board)
// ---------------------------------------------------------------------------

function LeaderboardScreen({
  finalScore,
  level,
  onPlayAgain,
}: {
  finalScore: number;
  level: number;
  onPlayAgain: () => void;
}) {
  const [entries, setEntries] = useState<ScoreEntry[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { rank } = await submitScore(finalScore, level);
      const board = await getLeaderboard(10);
      if (!alive) return;
      setRank(rank);
      setEntries(board);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [finalScore, level]);

  return (
    <Leaderboard
      entries={entries}
      finalScore={finalScore}
      rank={rank}
      loading={loading}
      onPlayAgain={onPlayAgain}
    />
  );
}
