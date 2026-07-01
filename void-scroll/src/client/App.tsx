// App.tsx — Root component. Owns the game state machine (useReducer) and routes
// between screens. Two modes: the level campaign (all-time board) and the Daily
// Descent (one shared seeded run per day, with its own board + streaks).

import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { SwipeCard } from './components/SwipeCard';
import { HUD } from './components/HUD';
import { LevelTransition } from './components/LevelTransition';
import { Leaderboard } from './components/Leaderboard';
import { MilestoneToast } from './components/MilestoneToast';
import { EventBanner } from './components/EventBanner';
import { MiniGame } from './components/MiniGame';
import { ClashArena } from './components/ClashArena';
import { useSwipePhysics } from './hooks/useSwipePhysics';
import { useVoidEvents } from './hooks/useVoidEvents';
import { useBonusOrbs, ORB_BOOST, type OrbKind } from './hooks/useBonusOrbs';
import { useClash, type ClashNet } from './hooks/useClash';
import { KNOCKBACK } from './lib/clash';
import { openClash, type ClashConn } from './lib/clashNet';
import {
  getLevel,
  isEndless,
  highestMilestone,
  depthZone,
  ENDLESS_LEVEL,
  FEED_CARDS,
  LEVELS,
  type CardContent,
} from './lib/levels';
import { SLOT, dateSeed, seededShuffle } from './lib/feed';
import { phraseFor, wordAt, letterSlots } from './lib/phrase';
import {
  sfxTick,
  sfxThunk,
  sfxSting,
  sfxSwell,
  buzz,
  setMuted,
  isMuted,
  startAmbient,
  stopAmbient,
  unlockAudio,
} from './lib/sfx';
import {
  init,
  getLeaderboard,
  getStreakBoard,
  getUserBest,
  submitScore,
  getDaily,
  submitDailyScore,
  getProgress,
  submitProgress,
  shareRun,
  hasCurrentUser,
  currentUsername,
  getMenuStats,
  isCurrentUser,
  submitWord,
  createChallenge,
  submitChallengeScore,
  type ScoreEntry,
  type ChaseTarget,
  type ChallengeInfo,
  type ChallengeScoreResponse,
} from './lib/api';
import type { FeedMarker } from './components/SwipeCard';
import { ACHIEVEMENTS, nextDepthBadge } from '../shared/achievements';
import { validateWord, WORD_MAX } from '../shared/words';

type Phase = 'idle' | 'map' | 'playing' | 'transition' | 'leaderboard';
type Mode = 'campaign' | 'daily' | 'clash';

interface GameState {
  phase: Phase;
  mode: Mode;
  level: number;
  finalScore: number;
  finalSeed: number; // the seed of the run just ended — for "Post as Challenge"
}

type Action =
  | { type: 'SHOW_MAP' }
  | { type: 'START_LEVEL'; level: number }
  | { type: 'START_DAILY' }
  | { type: 'START_CLASH' }
  | { type: 'CLEAR_LEVEL'; score: number }
  | { type: 'CONTINUE' }
  | { type: 'END_RUN'; score: number; seed: number }
  | { type: 'QUIT' }
  | { type: 'BACK_TO_MENU' };

const INITIAL: GameState = { phase: 'idle', mode: 'campaign', level: 1, finalScore: 0, finalSeed: 0 };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SHOW_MAP':
      return { ...INITIAL, phase: 'map' };
    case 'START_LEVEL':
      return { ...INITIAL, phase: 'playing', level: action.level };
    case 'START_DAILY':
      return { ...INITIAL, phase: 'playing', mode: 'daily', level: ENDLESS_LEVEL };
    case 'START_CLASH':
      return { ...INITIAL, phase: 'playing', mode: 'clash', level: ENDLESS_LEVEL };
    case 'CLEAR_LEVEL':
      return { ...state, phase: 'transition', finalScore: action.score };
    case 'CONTINUE':
      return { ...state, phase: 'playing', level: state.level + 1 };
    case 'END_RUN':
      return { ...state, phase: 'leaderboard', finalScore: action.score, finalSeed: action.seed };
    case 'QUIT':
      return { ...INITIAL, phase: 'map' };
    case 'BACK_TO_MENU':
      return INITIAL;
    default:
      return state;
  }
}

// Daily feed order is the same for everyone today (seed shared with the server).
const DAILY_POOL = seededShuffle(FEED_CARDS, dateSeed());

const ORB_GLYPH: Record<OrbKind, string> = { rush: '⚡', spark: '💠' };

// A random orb PATTERN to collect (in order) to open the checkpoint gate. Length
// and the rush/spark mix vary each time, so it's a sequence to match, not a count.
function makePattern(): OrbKind[] {
  const len = 5 + Math.floor(Math.random() * 5); // 5–9
  return Array.from({ length: len }, () => (Math.random() < 0.5 ? 'rush' : 'spark'));
}

// Ambient parallax motes that rise through the void — bigger ones drift faster
// and farther (foreground), smaller ones slow and faint (depth). They fade in and
// out so the loop never jumps.
function Particles() {
  const [dots] = useState(() =>
    Array.from({ length: 42 }, (_, i) => {
      const size = 1.3 + Math.random() * 2.6; // 1.3–3.9 px
      return {
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size,
        sx: (Math.random() - 0.5) * 26, // ±13px horizontal sway
        sy: -(36 + size * 13 + Math.random() * 26), // rise ~50–100px (bigger = more)
        dur: 7 + (4 - size) * 2.6 + Math.random() * 6, // bigger = faster (parallax)
        delay: -Math.random() * 18,
        op: 0.14 + Math.random() * 0.34,
      };
    }),
  );
  return (
    <div className="particles" aria-hidden="true">
      {dots.map((d) => {
        const style: Record<string, string | number> = {
          left: `${d.left}%`,
          top: `${d.top}%`,
          width: `${d.size}px`,
          height: `${d.size}px`,
          animationDuration: `${d.dur}s`,
          animationDelay: `${d.delay}s`,
          '--sx': `${d.sx}px`,
          '--sy': `${d.sy}px`,
          '--op': d.op,
        };
        return <span key={d.id} className="particle" style={style as CSSProperties} />;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Challenge flow (UGC) — a fixed-seed run others play to beat the creator's score
// ---------------------------------------------------------------------------

function ChallengeFlow({ challenge }: { challenge: ChallengeInfo }) {
  const [phase, setPhase] = useState<'intro' | 'playing' | 'done'>('intro');
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<ChallengeScoreResponse | null>(null);

  if (phase === 'intro') {
    return (
      <div className="overlay">
        <div className="overlay__panel">
          <div className="overlay__eyebrow">🎯 Challenge · by u/{challenge.creator}</div>
          <div className="overlay__score">{challenge.target.toLocaleString()}</div>
          <div className="overlay__rank">beat this depth in the void</div>
          {challenge.word && (
            <div className="challenge-word">
              spell <strong>{challenge.word}</strong> on the way down
            </div>
          )}
          <button
            className="btn btn--primary btn--lg"
            onClick={() => {
              unlockAudio();
              startAmbient();
              setPhase('playing');
            }}
          >
            Take the Challenge
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'playing') {
    return (
      <Game
        level={ENDLESS_LEVEL}
        seedOverride={challenge.seed}
        firstWord={challenge.word ?? undefined}
        challengeTarget={challenge.target}
        onClear={() => {}}
        onEndRun={(s) => {
          setScore(s);
          setResult(null);
          void submitChallengeScore(s).then(setResult).catch(() => {});
          setPhase('done');
        }}
        onQuit={() => setPhase('intro')}
      />
    );
  }

  const beat = result?.beat ?? score >= challenge.target;
  return (
    <div className="overlay">
      <div className="overlay__panel overlay__panel--wide">
        <div className="overlay__eyebrow">🎯 Challenge · by u/{challenge.creator}</div>
        <div className="overlay__score">{score.toLocaleString()}</div>
        <div className={'challenge-verdict' + (beat ? ' is-win' : '')}>
          {beat
            ? `✦ You beat ${challenge.target.toLocaleString()}!`
            : `${(challenge.target - score).toLocaleString()} short of ${challenge.target.toLocaleString()}`}
        </div>
        {result?.rank != null && (
          <div className="overlay__rank">
            You rank <strong>#{result.rank}</strong> on this challenge
          </div>
        )}
        <div className="leaderboard">
          {!result ? (
            <div className="leaderboard__loading">Reading the void…</div>
          ) : result.entries.length === 0 ? (
            <div className="leaderboard__loading">Be the first to log a score.</div>
          ) : (
            result.entries.map((e, i) => (
              <div
                key={`${e.username}-${i}`}
                className={'leaderboard__row' + (isCurrentUser(e) ? ' leaderboard__row--you' : '')}
              >
                <span className="leaderboard__rank">{i + 1}</span>
                <span className="leaderboard__name">{e.username}</span>
                <span className="leaderboard__score">{e.score.toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
        <button
          className="btn btn--primary"
          onClick={() => {
            setResult(null);
            setScore(0);
            setPhase('intro');
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [muted, setMutedState] = useState(isMuted());
  const [unlocked, setUnlocked] = useState(1); // highest unlocked campaign level
  const [dailyWord, setDailyWord] = useState<string | null>(null); // community word for today
  const [dailyWordAuthor, setDailyWordAuthor] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<ChallengeInfo | null>(null); // set if this is a challenge post
  const [booted, setBooted] = useState(false); // init resolved (so we route correctly)

  // Pull today's community word — also re-run after a submit so a just-claimed word
  // shows up immediately (attribution + the daily run itself).
  const refreshDailyWord = useCallback(() => {
    void getDaily()
      .then((d) => {
        setDailyWord(d.word);
        setDailyWordAuthor(d.wordAuthor);
      })
      .catch(() => {});
  }, []);

  // Resolve the current user + load saved campaign progress.
  useEffect(() => {
    void init()
      .then((d) => {
        setChallenge(d.challenge);
        setBooted(true);
      })
      .catch(() => setBooted(true));
    void getProgress()
      .then((u) => setUnlocked(u))
      .catch(() => {});
    refreshDailyWord();
  }, [refreshDailyWord]);

  // Ambient bed: starts silent (suspended) and fades in on the first gesture that
  // unlocks audio. Off while muted. The mute toggle also stops/starts it.
  useEffect(() => {
    if (!isMuted()) startAmbient();
    return () => stopAmbient();
  }, []);

  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      const next = !m;
      setMuted(next);
      return next;
    });
  }, []);

  // Clearing a level unlocks the next and saves it server-side.
  const handleClear = useCallback((level: number, score: number) => {
    dispatch({ type: 'CLEAR_LEVEL', score });
    const next = Math.min(level + 1, ENDLESS_LEVEL);
    setUnlocked((u) => Math.max(u, next));
    void submitProgress(level)
      .then((u) => setUnlocked((cur) => Math.max(cur, u)))
      .catch(() => {});
  }, []);

  return (
    <div className="phone">
      <Particles />
      <button
        className="mute"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <div className="screen">
        {booted && challenge ? (
          <ChallengeFlow challenge={challenge} />
        ) : !booted ? null : (
          <>
        {state.phase === 'idle' && (
          <IdleScreen
            word={dailyWord}
            wordAuthor={dailyWordAuthor}
            onWordSubmitted={refreshDailyWord}
            onStart={() => {
              unlockAudio();
              startAmbient();
              dispatch({ type: 'SHOW_MAP' });
            }}
            onStartDaily={() => {
              unlockAudio();
              startAmbient();
              dispatch({ type: 'START_DAILY' });
            }}
            onStartClash={() => {
              unlockAudio();
              startAmbient();
              dispatch({ type: 'START_CLASH' });
            }}
          />
        )}

        {state.phase === 'map' && (
          <LevelMap
            unlocked={unlocked}
            onPick={(level) => dispatch({ type: 'START_LEVEL', level })}
            onBack={() => dispatch({ type: 'BACK_TO_MENU' })}
          />
        )}

        {state.phase === 'playing' && state.mode === 'clash' && (
          <ClashGame
            onEndRun={(score) => dispatch({ type: 'END_RUN', score, seed: 0 })}
            onQuit={() => dispatch({ type: 'BACK_TO_MENU' })}
          />
        )}

        {state.phase === 'playing' && state.mode !== 'clash' && (
          <Game
            key={`${state.mode}-${state.level}`}
            level={state.level}
            daily={state.mode === 'daily'}
            firstWord={state.mode === 'daily' ? (dailyWord ?? undefined) : undefined}
            pool={state.mode === 'daily' ? DAILY_POOL : FEED_CARDS}
            onClear={(score) => handleClear(state.level, score)}
            onEndRun={(score, seed) => dispatch({ type: 'END_RUN', score, seed })}
            onQuit={() => dispatch({ type: 'QUIT' })}
          />
        )}

        {state.phase === 'transition' && (
          <LevelTransition
            cleared={getLevel(state.level)}
            next={getLevel(state.level + 1)}
            onContinue={() => dispatch({ type: 'CONTINUE' })}
          />
        )}

        {state.phase === 'leaderboard' && (
          <LeaderboardScreen
            mode={state.mode}
            finalScore={state.finalScore}
            finalSeed={state.finalSeed}
            level={state.level}
            onPlayAgain={() => dispatch({ type: 'BACK_TO_MENU' })}
          />
        )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Level map — pick any unlocked level (saved progress)
// ---------------------------------------------------------------------------

function LevelMap({
  unlocked,
  onPick,
  onBack,
}: {
  unlocked: number;
  onPick: (level: number) => void;
  onBack: () => void;
}) {
  return (
    <div className="map">
      <div className="map__title">Choose your descent</div>
      <div className="map__levels">
        {LEVELS.map((lvl) => {
          const locked = lvl.level > unlocked;
          const endlessNode = lvl.items === Infinity;
          const cleared = lvl.level < unlocked && !endlessNode;
          return (
            <button
              key={lvl.level}
              className={
                'map__node' +
                (locked ? ' map__node--locked' : '') +
                (endlessNode ? ' map__node--endless' : '')
              }
              disabled={locked}
              onClick={() => onPick(lvl.level)}
            >
              <span className="map__node-glyph">{locked ? '🔒' : lvl.card.glyph}</span>
              <span className="map__node-main">
                <span className="map__node-label">
                  {endlessNode ? 'Endless' : `Level ${lvl.level}`}
                </span>
                <span className="map__node-sub">{endlessNode ? 'no end · leaderboard' : lvl.label}</span>
              </span>
              <span className="map__node-mark">{cleared ? '✓' : locked ? '' : '▶'}</span>
            </button>
          );
        })}
      </div>
      <button className="btn btn--daily" onClick={onBack}>
        ← Menu
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Community word submission (UGC) — a sent word may headline a future Daily Descent
// ---------------------------------------------------------------------------

function DailyWordSubmit({ onSubmitted }: { onSubmitted: () => void }) {
  const [val, setVal] = useState('');
  const [phase, setPhase] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const submit = () => {
    const check = validateWord(val);
    if (!check.ok) {
      setPhase('error');
      setMsg(check.reason);
      return;
    }
    setPhase('sending');
    void submitWord(check.word).then((r) => {
      if (r.ok) {
        setPhase('done');
        setMsg(
          r.today
            ? `“${r.word}” is today’s word — play the Daily Descent!`
            : `“${r.word}” queued — it’ll headline an upcoming descent.`,
        );
        onSubmitted(); // refresh so a just-claimed word shows immediately
      } else {
        setPhase('error');
        setMsg(r.reason);
      }
    });
  };

  if (phase === 'done') {
    return <div className="wordsub wordsub--done">✓ {msg}</div>;
  }
  return (
    <div className="wordsub">
      <div className="wordsub__label">✍ Send a word — first one each day headlines the Daily</div>
      <div className="wordsub__row">
        <input
          className="wordsub__input"
          value={val}
          maxLength={WORD_MAX}
          autoCapitalize="characters"
          placeholder="DRIFT"
          aria-label="Word to submit"
          onChange={(e) => {
            setVal(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z]/g, '')
                .slice(0, WORD_MAX),
            );
            if (phase === 'error') setPhase('idle');
          }}
        />
        <button
          className="btn wordsub__btn"
          disabled={phase === 'sending' || val.length === 0}
          onClick={submit}
        >
          {phase === 'sending' ? '…' : 'Send'}
        </button>
      </div>
      {phase === 'error' && <div className="wordsub__msg">{msg}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Idle / start screen
// ---------------------------------------------------------------------------

function IdleScreen({
  word,
  wordAuthor,
  onWordSubmitted,
  onStart,
  onStartDaily,
  onStartClash,
}: {
  word: string | null;
  wordAuthor: string | null;
  onWordSubmitted: () => void;
  onStart: () => void;
  onStartDaily: () => void;
  onStartClash: () => void;
}) {
  const [best, setBest] = useState(0);
  const [allBoard, setAllBoard] = useState<ScoreEntry[]>([]);
  const [todayBoard, setTodayBoard] = useState<ScoreEntry[]>([]);
  const [streakBoard, setStreakBoard] = useState<ScoreEntry[]>([]);
  const [boardTab, setBoardTab] = useState('all');
  const [dailyBest, setDailyBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lifetime, setLifetime] = useState(0);
  const [unlocked, setUnlocked] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void Promise.allSettled([
      getUserBest().then((b) => {
        if (alive) setBest(b);
      }),
      getLeaderboard(5).then((t) => {
        if (alive) setAllBoard(t);
      }),
      getStreakBoard(5).then((t) => {
        if (alive) setStreakBoard(t);
      }),
      getDaily().then((d) => {
        if (alive) {
          setDailyBest(d.best);
          setStreak(d.streak);
          setTodayBoard(d.entries.slice(0, 5));
        }
      }),
      getMenuStats().then((s) => {
        if (alive) {
          setLifetime(s.lifetime);
          setUnlocked(new Set(s.achievements));
        }
      }),
    ]).then(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const menuBoards = [
    { id: 'all', label: 'All-time', entries: allBoard, unit: 'depth', empty: 'Be the first to descend.' },
    { id: 'today', label: 'Today', entries: todayBoard, unit: 'depth', empty: 'No descents today yet.' },
    { id: 'streak', label: 'Streak', entries: streakBoard, unit: 'days', empty: 'No streaks yet.' },
  ];
  const activeBoard = menuBoards.find((b) => b.id === boardTab) ?? menuBoards[0]!;

  return (
    <div className="idle">
      <div className="idle__hero">
        <div className="idle__title">
          VOID<span>SCROLL</span>
        </div>
        <p className="idle__tag">The feed pushes back. Keep it aloft — how deep can you go?</p>
      </div>

      <div className="idle__stats">
        {loading ? (
          <>
            <div className="idle__stat idle__stat--skel" />
            <div className="idle__stat idle__stat--skel" />
            <div className="idle__stat idle__stat--skel" />
          </>
        ) : (
          <>
            <div className="idle__stat">
              <span className="idle__stat-n">{best > 0 ? best.toLocaleString() : '—'}</span>
              <span className="idle__stat-l">your best</span>
            </div>
            <div className="idle__stat">
              <span className="idle__stat-n">{streak > 0 ? `🔥 ${streak}` : '—'}</span>
              <span className="idle__stat-l">day streak</span>
            </div>
            <div className="idle__stat">
              <span className="idle__stat-n">{lifetime > 0 ? lifetime.toLocaleString() : '—'}</span>
              <span className="idle__stat-l">lifetime</span>
            </div>
          </>
        )}
      </div>

      <div className="idle__actions">
        <button className="btn btn--primary btn--lg" onClick={onStart}>
          Play
        </button>
        <button className="btn btn--daily" onClick={onStartDaily}>
          🗓 Daily Descent{!loading && dailyBest > 0 ? ` · today ${dailyBest.toLocaleString()}` : ''}
        </button>
        <button className="btn btn--daily btn--clash" onClick={onStartClash}>
          ⚔ Void Clash · live
        </button>
        {word && (
          <div className="idle__dailyword">
            today’s word <strong>{word}</strong>
            {wordAuthor ? (
              <>
                {' '}
                · by <span className="idle__dailyword-by">u/{wordAuthor}</span>
              </>
            ) : null}
          </div>
        )}
      </div>

      <DailyWordSubmit onSubmitted={onWordSubmitted} />

      <div className="idle__how">
        <div className="idle__how-row">
          <span className="idle__how-icon">⬆</span> Swipe up, alternating fingers — lift one
          before the next, or the feed falls back
        </div>
        <div className="idle__how-row">
          <span className="idle__how-icon idle__how-icon--gold">✦</span> Tap glowing letters
          &amp; ⚡ bonus orbs as they drift past
        </div>
      </div>

      <div className="idle__board">
        <div className="lbtabs lbtabs--menu">
          {menuBoards.map((b) => (
            <button
              key={b.id}
              className={'lbtabs__tab' + (b.id === activeBoard.id ? ' is-active' : '')}
              onClick={() => setBoardTab(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
        {loading ? (
          <>
            <div className="idle__board-row idle__board-row--skel" />
            <div className="idle__board-row idle__board-row--skel" />
            <div className="idle__board-row idle__board-row--skel" />
          </>
        ) : activeBoard.entries.length === 0 ? (
          <div className="idle__board-empty">{activeBoard.empty}</div>
        ) : (
          activeBoard.entries.map((e, i) => (
            <div className="idle__board-row" key={`${e.username}-${i}`}>
              <span>
                {i + 1}. {e.username}
              </span>
              <span>{activeBoard.unit === 'days' ? `🔥 ${e.score}` : e.score.toLocaleString()}</span>
            </div>
          ))
        )}
      </div>

      <div className="idle__badges">
        <div className="idle__board-title">
          Badges · {unlocked.size}/{ACHIEVEMENTS.length}
        </div>
        <div className="badges">
          {ACHIEVEMENTS.map((a) => {
            const got = unlocked.has(a.id);
            return (
              <div
                key={a.id}
                className={'badge' + (got ? ' is-got' : '')}
                title={`${a.title} — ${a.desc}`}
              >
                <span className="badge__icon">{a.icon}</span>
                <span className="badge__name">{got ? a.title : '???'}</span>
              </div>
            );
          })}
        </div>
        {!loading &&
          (() => {
            const nb = nextDepthBadge(best);
            return nb ? (
              <div className="nextbadge nextbadge--menu">
                Next: <span className="nextbadge__icon">{nb.def.icon}</span> {nb.def.title} ·{' '}
                <span className="nextbadge__gap">{nb.gap.toLocaleString()} deeper</span>
              </div>
            ) : null;
          })()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// In-play screen (remounts per level/mode via key, so physics resets cleanly)
// ---------------------------------------------------------------------------

function Game({
  level,
  daily = false,
  firstWord,
  seedOverride,
  challengeTarget,
  pool = FEED_CARDS,
  onClear,
  onEndRun,
  onQuit,
}: {
  level: number;
  daily?: boolean;
  firstWord?: string | undefined; // overrides the first endless word (daily/challenge)
  seedOverride?: number | undefined; // fixed seed (challenge = reproducible run)
  challengeTarget?: number | undefined; // draws a "target" chase line to beat
  pool?: CardContent[];
  onClear: (score: number) => void;
  onEndRun: (score: number, seed: number) => void;
  onQuit: () => void;
}) {
  const config = getLevel(level);
  const endless = isEndless(level);
  const clearedRef = useRef(false);

  // Void events (endless only) modulate resistance / gain.
  const events = useVoidEvents(endless);
  const physics = useSwipePhysics(config.k * events.kMultiplier, events.gainMultiplier);
  const { boost, slingshot } = physics;

  // Floating bonus orbs — tap one for a forward surge.
  const bonus = useBonusOrbs(true);

  // The level clears the moment the LAST tile leaves the top — SwipeCard measures
  // that distance from the live screen geometry and reports it here.
  const [clearDistance, setClearDistance] = useState(() =>
    config.items === Infinity ? Infinity : config.items * SLOT,
  );
  useEffect(() => {
    if (!endless && !clearedRef.current && Number.isFinite(clearDistance) && physics.score >= clearDistance) {
      clearedRef.current = true;
      sfxThunk();
      buzz(25);
      onClear(Math.round(clearDistance));
    }
  }, [endless, physics.score, clearDistance, onClear]);

  // Secret phrase: ONLY in endless/daily (no clear threshold to cut the letters
  // off). Endless cycles through a SEQUENCE of words — complete one, launch, the
  // next appears ahead. Campaign levels are a pure climb — empty phrase, no letters.
  // Daily is date-seeded (shared puzzle); a free endless run gets fresh random words.
  const [seed] = useState(
    () =>
      seedOverride ??
      (daily ? dateSeed() ^ level : (Math.floor(Math.random() * 0x100000000) >>> 0) || 1),
  );
  const [wordIndex, setWordIndex] = useState(0);
  // The FIRST endless word can be overridden (the community Daily word, or a
  // challenge's word); the rest come from the seeded sequence.
  const [phrase, setPhrase] = useState(() =>
    isEndless(level) ? (firstWord ?? phraseFor(seed)) : '',
  );
  const [letterMap, setLetterMap] = useState(() =>
    isEndless(level) ? letterSlots(phrase, seed) : new Map<number, number>(),
  );
  const [collected, setCollected] = useState<Set<number>>(() => new Set());
  const collectedRef = useRef(collected); // guards against double-fire on a same-frame double tap
  const [wordsDone, setWordsDone] = useState(0);
  const [phraseToast, setPhraseToast] = useState<string | null>(null);
  const phraseTimer = useRef<number | null>(null);
  const phraseDoneRef = useRef(false);

  // Bonus-orb pickup feedback.
  const [orbToast, setOrbToast] = useState<string | null>(null);
  const orbTimer = useRef<number | null>(null);

  // Checkpoint gate: collect a random PATTERN of orbs IN ORDER to open a mini-game.
  // A wrong-kind orb resets the streak. Pattern (length + mix) re-rolls each gate.
  const [gatePattern, setGatePattern] = useState<OrbKind[]>(() => (endless ? makePattern() : []));
  const [gateProgress, setGateProgress] = useState(0);
  const gateProgressRef = useRef(0);
  const [gateReady, setGateReady] = useState(false);
  const [gateFlash, setGateFlash] = useState(false); // brief flash when the pattern resets
  const gateFlashTimer = useRef<number | null>(null);
  const [inMini, setInMini] = useState(false);
  const [resumeCount, setResumeCount] = useState<number | null>(null); // post-mini-game countdown
  const resumeTimer = useRef<number | null>(null);

  const handleCollect = useCallback((order: number) => {
    if (collectedRef.current.has(order)) return; // already collected — ignore
    const next = new Set(collectedRef.current);
    next.add(order);
    collectedRef.current = next;
    sfxTick(); // light up + chirp, but DON'T jolt the feed forward (no scroll jump)
    buzz(8);
    setCollected(next);
  }, []);

  // Completing the phrase ARMS a launch — the player taps to fire it (clear
  // cause → effect), rather than it auto-firing out of nowhere.
  const [launchReady, setLaunchReady] = useState(false);
  useEffect(() => {
    if (!phraseDoneRef.current && phrase.length > 0 && collected.size >= phrase.length) {
      phraseDoneRef.current = true;
      sfxSwell();
      buzz([12, 24, 12]);
      setLaunchReady(true);
    }
  }, [collected, phrase]);

  // Plain function (not memoised) so it closes over the live best/word each render.
  const fireLaunch = () => {
    setLaunchReady(false);
    slingshot(560); // jump to a NEW record (always raises your score)
    sfxThunk();
    buzz(35);
    setPhraseToast(`⏫ ${phrase} — next word!`);
    if (phraseTimer.current) clearTimeout(phraseTimer.current);
    phraseTimer.current = window.setTimeout(() => setPhraseToast(null), 1400);

    // Advance to the next word, laid out ahead of where the slingshot lands.
    const nextIndex = wordIndex + 1;
    const nextWord = wordAt(seed, nextIndex);
    const landingIndex = Math.floor((physics.best + 560) / SLOT) + 4;
    phraseDoneRef.current = false;
    collectedRef.current = new Set();
    setWordIndex(nextIndex);
    setWordsDone((n) => n + 1);
    setPhrase(nextWord);
    setCollected(new Set());
    setLetterMap(letterSlots(nextWord, seed ^ (nextIndex * 0x9e3779b1), landingIndex));
  };

  // Opening the gate: freeze the descent so the mini-game doesn't cost your depth.
  const enterMini = () => {
    physics.hold();
    sfxSting();
    setInMini(true);
  };

  // A locked 3·2·1 countdown after the mini-game: the feed ignores ALL input (so the
  // frantic leftover swipes from the task can't fling it), then unlocks and waits for a
  // deliberate upward swipe to resume.
  const startResumeCountdown = () => {
    let n = 3;
    setResumeCount(n);
    const tick = () => {
      n -= 1;
      if (n <= 0) {
        setResumeCount(null);
        physics.allowResume();
        resumeTimer.current = null;
      } else {
        setResumeCount(n);
        resumeTimer.current = window.setTimeout(tick, 800);
      }
    };
    resumeTimer.current = window.setTimeout(tick, 800);
  };

  // Leaving the checkpoint mini-game: a win slingshots you deep (and the feed stays
  // parked at the reward — no reset to 0). Either way the gate is consumed, a fresh
  // pattern rolls, and the locked countdown guards the resume.
  const endMini = (success: boolean) => {
    setInMini(false);
    setGateReady(false);
    setGatePattern(makePattern());
    gateProgressRef.current = 0;
    setGateProgress(0);
    if (success) {
      slingshot(1800);
      sfxSwell();
      buzz([14, 28, 14]);
      setPhraseToast('✦ GATE CLEARED · +depth!');
      if (phraseTimer.current) clearTimeout(phraseTimer.current);
      phraseTimer.current = window.setTimeout(() => setPhraseToast(null), 1500);
    }
    startResumeCountdown();
  };

  // Endless milestones — cheer the first time `best` crosses each threshold.
  const [milestone, setMilestone] = useState<string | null>(null);
  const lastMilestoneRef = useRef(0);
  const milestoneTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!endless) return;
    const m = highestMilestone(physics.best);
    if (m && m.value > lastMilestoneRef.current) {
      lastMilestoneRef.current = m.value;
      sfxSting();
      setMilestone(m.message);
      if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
      milestoneTimer.current = window.setTimeout(() => setMilestone(null), 1700);
    }
  }, [endless, physics.best]);

  // New personal best — a one-time celebration the first time THIS run surpasses
  // your all-time best (captured at run start). New players with no prior record are
  // covered by the milestone cheers instead, so this only fires for a real PB.
  const prevBestRef = useRef(0);
  const pbDoneRef = useRef(false);
  const [pb, setPb] = useState(false);
  const pbTimer = useRef<number | null>(null);

  // In-feed chase lines: your best + the #1 player's depth, drawn in the feed so you
  // climb toward and overtake them. Caught the leader → a one-time payoff.
  const [markers, setMarkers] = useState<FeedMarker[]>([]);
  const topDepthRef = useRef(0);
  const topUserRef = useRef('');
  const caughtRef = useRef(false);

  useEffect(() => {
    if (!endless) return;
    let alive = true;
    void (async () => {
      try {
        const [b, top1] = await Promise.all([getUserBest(), getLeaderboard(1)]);
        if (!alive) return;
        prevBestRef.current = b;
        const ms: FeedMarker[] = [];
        if (challengeTarget && challengeTarget > 0) {
          ms.push({ depth: challengeTarget, label: '🎯 TARGET', kind: 'target' });
        }
        if (b > 0) ms.push({ depth: b, label: 'YOUR BEST', kind: 'best' });
        const t = top1[0];
        if (t && t.score > 0 && !isCurrentUser(t)) {
          topDepthRef.current = t.score;
          topUserRef.current = t.username;
          ms.push({ depth: t.score, label: `#1 ${t.username}`, kind: 'top' });
        }
        setMarkers(ms);
      } catch {
        /* markers are optional polish — ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [endless, challengeTarget]);

  useEffect(() => {
    if (!endless || pbDoneRef.current) return;
    if (prevBestRef.current > 0 && physics.best > prevBestRef.current) {
      pbDoneRef.current = true;
      setPb(true);
      sfxSwell();
      buzz([20, 40, 20]);
      if (pbTimer.current) clearTimeout(pbTimer.current);
      pbTimer.current = window.setTimeout(() => setPb(false), 2200);
    }
  }, [endless, physics.best]);

  // Overtook the #1 player live — a big social moment.
  useEffect(() => {
    if (!endless || caughtRef.current) return;
    if (topDepthRef.current > 0 && physics.best > topDepthRef.current) {
      caughtRef.current = true;
      sfxSwell();
      buzz([18, 30, 18]);
      setMilestone(`✦ caught ${topUserRef.current}!`);
      if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
      milestoneTimer.current = window.setTimeout(() => setMilestone(null), 2200);
    }
  }, [endless, physics.best]);

  useEffect(() => () => {
    if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
    if (phraseTimer.current) clearTimeout(phraseTimer.current);
    if (orbTimer.current) clearTimeout(orbTimer.current);
    if (gateFlashTimer.current) clearTimeout(gateFlashTimer.current);
    if (pbTimer.current) clearTimeout(pbTimer.current);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  const handleEnd = useCallback(() => onEndRun(physics.best, seed), [onEndRun, physics.best, seed]);

  // Vertical depth gauge fills top→down: endless = progress toward your best, a
  // campaign level = progress toward clearing.
  const depthPct = endless
    ? physics.best > 0
      ? Math.min(100, (physics.score / physics.best) * 100)
      : 100
    : Math.min(100, (physics.score / clearDistance) * 100);
  const atRecord = endless && physics.score >= physics.best;

  return (
    <div className={'game' + (events.event ? ` game--${events.event.type}` : '')}>
      <HUD
        score={physics.score}
        best={physics.best}
        level={level}
        label={config.label}
        target={clearDistance}
        endless={endless}
        daily={daily}
        phrase={phrase}
        collected={collected}
        wordsDone={wordsDone}
        gatePattern={gatePattern}
        gateProgress={gateProgress}
        gateFlash={gateFlash}
        gateReady={gateReady}
        gateGlyphs={ORB_GLYPH}
        onEndRun={handleEnd}
        onQuit={onQuit}
      />
      <div className="depthgauge" aria-hidden="true">
        <div
          className={'depthgauge__fill' + (atRecord ? ' is-record' : '')}
          style={{ height: `${depthPct}%` }}
        />
      </div>
      <SwipeCard
        distance={-physics.visualY}
        hero={config.card}
        pool={pool}
        items={config.items}
        onMeasure={setClearDistance}
        phrase={phrase}
        letterMap={letterMap}
        collected={collected}
        onCollect={handleCollect}
        markers={markers}
        tint={events.event?.type}
        handlers={physics.handlers}
      />
      {(level === 1 || endless) && (
        <div className="coach">
          {endless
            ? '✦ tap the glowing letters as they pass to spell the word'
            : '⬆ swipe up, alternating fingers — lift one before the next'}
        </div>
      )}
      {launchReady && (
        <button
          className="launch"
          onPointerDown={(e) => {
            e.stopPropagation();
            fireLaunch();
          }}
        >
          <span className="launch__word">{phrase} spelled!</span>
          <span className="launch__cta">TAP TO LAUNCH ⏫</span>
          <span className="launch__sub">slingshot deeper</span>
        </button>
      )}
      {bonus.orbs.map((o) => (
        <button
          key={o.id}
          className={`orb orb--${o.kind}`}
          style={{ left: `${o.xPct}%`, top: `${o.yPct}%` }}
          aria-label="bonus"
          onPointerDown={(e) => {
            e.stopPropagation(); // fire instantly even while another finger scrolls
            boost(ORB_BOOST[o.kind]);
            sfxSting();
            buzz(12);
            bonus.remove(o.id);
            // Match the gate pattern in order; a wrong kind resets the streak.
            let gateNote = '';
            if (endless && !gateReady && !inMini && gatePattern.length > 0) {
              if (o.kind === gatePattern[gateProgressRef.current]) {
                const np = gateProgressRef.current + 1;
                gateProgressRef.current = np;
                setGateProgress(np);
                if (np >= gatePattern.length) {
                  setGateReady(true);
                  gateNote = ' · ◆ GATE OPEN!';
                } else {
                  gateNote = ` · ◆ ${np}/${gatePattern.length}`;
                }
              } else {
                const np = o.kind === gatePattern[0] ? 1 : 0; // keep it if it matches step 1
                gateProgressRef.current = np;
                setGateProgress(np);
                gateNote = ' · ✗ pattern reset';
                setGateFlash(true);
                if (gateFlashTimer.current) clearTimeout(gateFlashTimer.current);
                gateFlashTimer.current = window.setTimeout(() => setGateFlash(false), 450);
              }
            }
            const base = o.kind === 'rush' ? `⚡ RUSH +${ORB_BOOST.rush}` : `💠 +${ORB_BOOST.spark}`;
            setOrbToast(base + gateNote);
            if (orbTimer.current) clearTimeout(orbTimer.current);
            orbTimer.current = window.setTimeout(() => setOrbToast(null), 1100);
          }}
        >
          {o.kind === 'rush' ? '⚡' : '💠'}
        </button>
      ))}
      {gateReady && !inMini && !launchReady && (
        <button
          className="gate"
          onPointerDown={(e) => {
            e.stopPropagation(); // tappable even while another finger scrolls
            enterMini();
          }}
        >
          <span className="gate__icon">◆</span>
          <span className="gate__cta">CHECKPOINT</span>
          <span className="gate__sub">tap to enter the gate</span>
        </button>
      )}
      {resumeCount != null && (
        <div className="resume-count" aria-hidden="true">
          <div className="resume-count__num" key={resumeCount}>
            {resumeCount}
          </div>
          <div className="resume-count__label">resuming — depth saved</div>
        </div>
      )}
      {physics.held && !inMini && resumeCount == null && (
        <div className="coach coach--resume">⬆ swipe up to resume — your depth is safe</div>
      )}
      {pb && (
        <div className="pb" aria-hidden="true">
          <div className="pb__glow" />
          <div className="pb__text">✦ NEW PERSONAL BEST</div>
        </div>
      )}
      <div className="toasts">
        {events.event && <EventBanner event={events.event} />}
        {milestone && <MilestoneToast message={milestone} />}
        {phraseToast && <MilestoneToast message={phraseToast} />}
        {orbToast && <MilestoneToast message={orbToast} />}
      </div>
      {inMini && <MiniGame onDone={endMini} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Void Clash — live multiplayer descent: race + fight other players (and bots)
// ---------------------------------------------------------------------------

const EMPTY_LETTERS = new Map<number, number>();
const EMPTY_COLLECTED = new Set<number>();
function noop() {}

function ClashGame({
  onEndRun,
  onQuit,
}: {
  onEndRun: (score: number) => void;
  onQuit: () => void;
}) {
  const config = getLevel(ENDLESS_LEVEL);
  const physics = useSwipePhysics(config.k);
  const selfName = currentUsername() ?? 'you';

  // Realtime transport — undefined until we've joined a real post's channel; the
  // sim runs bots-only until then (and always, in the standalone web build).
  const [net, setNet] = useState<ClashNet | undefined>(undefined);

  const clash = useClash({
    active: true,
    selfName,
    selfDepth: physics.score,
    net,
    onSelfHit: () => {
      physics.knockback(KNOCKBACK);
      sfxSting();
      buzz([20, 40, 20]);
    },
    onSelfDeflect: () => {
      sfxTick();
      buzz(15);
    },
  });

  // Bridge the realtime channel to the sim. Ingest fns are read through a ref so the
  // subscription (opened once) always calls the latest without re-subscribing.
  const ingestRef = useRef({
    state: clash.ingestState,
    fire: clash.ingestFire,
    leave: clash.ingestLeave,
  });
  useEffect(() => {
    ingestRef.current = {
      state: clash.ingestState,
      fire: clash.ingestFire,
      leave: clash.ingestLeave,
    };
  });
  useEffect(() => {
    let conn: ClashConn | null = null;
    let closed = false;
    void openClash(selfName, {
      onState: (s) => ingestRef.current.state(s),
      onFire: (from, target) => ingestRef.current.fire(from, target),
      onLeave: (id) => ingestRef.current.leave(id),
    }).then((c) => {
      if (closed) {
        c?.close();
        return;
      }
      conn = c;
      if (c) setNet(c.net);
    });
    return () => {
      closed = true;
      conn?.close();
    };
  }, [selfName]);

  // Combat toasts, driven off the sim's event stream (one per new seq).
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const lastSeq = useRef(0);
  useEffect(() => {
    if (!clash.event || clash.event.seq === lastSeq.current) return;
    lastSeq.current = clash.event.seq;
    const e = clash.event.event;
    let msg: string | null = null;
    switch (e.kind) {
      case 'hit-them':
        msg = `🎯 tagged ${e.name} · −1000`;
        break;
      case 'hit-you':
        msg = `💥 ${e.name} hit you · −1000`;
        break;
      case 'deflect-you':
        msg = `🛡 blocked ${e.name}`;
        break;
      case 'deflect-them':
        msg = `🛡 ${e.name} blocked it`;
        break;
      case 'pickup':
        msg = e.pickup === 'ammo' ? '🔩 +1 ammo' : '🛡 +1 shield';
        break;
      case 'no-ammo':
        msg = 'no ammo — grab 🔩';
        break;
      case 'cooldown':
        msg = 'reloading…';
        break;
      case 'out-of-range':
        msg = 'too far to hit';
        break;
    }
    if (!msg) return;
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1100);
  }, [clash.event]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // Live standing among all racers (deepest = #1).
  const ahead = clash.racers.filter((r) => !r.isSelf && r.depth > physics.score).length;
  const rank = ahead + 1;
  const total = Math.max(1, clash.racers.length);

  const [coach, setCoach] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setCoach(false), 5600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="game game--clash">
      <div className="hud">
        <div className="hud__top">
          <button className="hud__quit" onClick={onQuit} aria-label="Quit to menu">
            ✕
          </button>
          <span className="hud__level">
            VOID CLASH · #{rank} of {total}
          </span>
          <button className="hud__end" onClick={() => onEndRun(physics.best)}>
            End run
          </button>
        </div>
        <div className="hud__score">{physics.best.toLocaleString()}</div>
        <div className="hud__readout">now {physics.score.toLocaleString()} · depth</div>
      </div>

      <SwipeCard
        distance={-physics.visualY}
        hero={config.card}
        pool={FEED_CARDS}
        items={config.items}
        phrase=""
        letterMap={EMPTY_LETTERS}
        collected={EMPTY_COLLECTED}
        onCollect={noop}
        handlers={physics.handlers}
      />

      <ClashArena
        racers={clash.racers}
        now={clash.clock}
        selfDepth={physics.score}
        ammo={clash.ammo}
        shields={clash.shields}
        pickups={clash.pickups}
        onFire={clash.fireAt}
        onCollect={clash.collect}
      />

      {coach && (
        <div className="coach">
          ⚔ tap a rival to fire · grab 🔩 ammo &amp; 🛡 shields · a hit costs 1,000 depth
        </div>
      )}

      <div className="toasts">{toast && <MilestoneToast message={toast} />}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard screen (submits the run, then shows the right board)
// ---------------------------------------------------------------------------

function hoursToNextUtcMidnight(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.round((next - now.getTime()) / 3_600_000));
}

function LeaderboardScreen({
  mode,
  finalScore,
  finalSeed,
  level,
  onPlayAgain,
}: {
  mode: Mode;
  finalScore: number;
  finalSeed: number;
  level: number;
  onPlayAgain: () => void;
}) {
  const [allBoard, setAllBoard] = useState<ScoreEntry[]>([]);
  const [todayBoard, setTodayBoard] = useState<ScoreEntry[]>([]);
  const [streakBoard, setStreakBoard] = useState<ScoreEntry[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [newAch, setNewAch] = useState<string[]>([]);
  const [chase, setChase] = useState<ChaseTarget>(null);
  const [best, setBest] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        // Submit the run first (so the boards reflect it), then pull all three.
        if (mode === 'daily') {
          const r = await submitDailyScore(finalScore);
          if (alive) {
            setRank(r.rank);
            setStreak(r.streak);
            setNewAch(r.newAchievements);
            setChase(r.chase);
          }
        } else {
          const r = await submitScore(finalScore, level);
          if (alive) {
            setRank(r.rank);
            setNewAch(r.newAchievements);
            setChase(r.chase);
          }
        }
        // getUserBest is the GLOBAL all-time best (both modes feed it) — the basis
        // for the depth-badge nudge, unlike the daily board's per-day best.
        const [all, daily, streaks, globalBest] = await Promise.all([
          getLeaderboard(7),
          getDaily(),
          getStreakBoard(7),
          getUserBest(),
        ]);
        if (alive) setBest(globalBest);
        if (!alive) return;
        setAllBoard(all);
        setTodayBoard(daily.entries.slice(0, 7));
        setStreakBoard(streaks);
        if (mode !== 'daily') setStreak(daily.streak);
      } catch {
        /* keep whatever we have; show empty boards */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, finalScore, level]);

  const [shareState, setShareState] = useState<'idle' | 'sharing' | 'done' | 'failed'>('idle');
  const handleShare = useCallback(() => {
    if (shareState === 'sharing' || shareState === 'done') return;
    setShareState('sharing');
    void shareRun(finalScore, mode, depthZone(finalScore)).then((ok) =>
      setShareState(ok ? 'done' : 'failed'),
    );
  }, [shareState, finalScore, mode]);

  // Post this run as a Challenge others can beat (creates a new post).
  const [challengeState, setChallengeState] = useState<'idle' | 'posting' | 'done' | 'failed'>(
    'idle',
  );
  const handleChallenge = useCallback(() => {
    if (challengeState === 'posting' || challengeState === 'done') return;
    setChallengeState('posting');
    void createChallenge(finalScore, finalSeed, null).then((r) =>
      setChallengeState(r.ok ? 'done' : 'failed'),
    );
  }, [challengeState, finalScore, finalSeed]);

  const daily = mode === 'daily';
  const clash = mode === 'clash';
  return (
    <Leaderboard
      boards={[
        { id: 'all', label: 'All-time', entries: allBoard, unit: 'depth' },
        { id: 'today', label: 'Today', entries: todayBoard, unit: 'depth' },
        { id: 'streak', label: 'Streak', entries: streakBoard, unit: 'days' },
      ]}
      defaultTab={daily ? 'today' : 'all'}
      finalScore={finalScore}
      rank={rank}
      loading={loading}
      streak={daily ? streak : null}
      title={daily ? 'Daily descent' : clash ? 'Clash over' : 'Run complete'}
      rankNoun={daily ? "today's descent" : 'the void'}
      footnote={daily ? `New descent in ~${hoursToNextUtcMidnight()}h` : undefined}
      playAgainLabel={daily ? 'Back to menu' : 'Play again'}
      onPlayAgain={onPlayAgain}
      onShare={finalScore > 0 && hasCurrentUser() ? handleShare : undefined}
      shareState={shareState}
      onChallenge={finalScore > 0 && finalSeed > 0 && hasCurrentUser() ? handleChallenge : undefined}
      challengeState={challengeState}
      newAchievements={newAch}
      chase={chase}
      best={best}
    />
  );
}
