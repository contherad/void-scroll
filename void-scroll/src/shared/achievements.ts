// achievements.ts — Shared badge definitions. Both the client (display) and the
// server (unlock detection) evaluate the SAME rules, so they can never disagree.
// Each badge unlocks when a tracked stat crosses its threshold.

export type AchStat = 'best' | 'lifetime' | 'streak';

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
  stat: AchStat;
  threshold: number;
}

export interface AchStats {
  best: number;
  lifetime: number;
  streak: number;
}

// Ordered roughly by reach. Depth tiers mirror the HUD depth zones, so the badges
// read as "places you've been" in the void.
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', icon: '🌑', title: 'First Descent', desc: 'Send the feed into the void', stat: 'best', threshold: 1 },
  { id: 'drift', icon: '🌫️', title: 'The Drift', desc: 'Reach 4,000 deep', stat: 'best', threshold: 4000 },
  { id: 'deep', icon: '🪐', title: 'The Deep', desc: 'Reach 8,000 deep', stat: 'best', threshold: 8000 },
  { id: 'abyss', icon: '🕳️', title: 'The Abyss', desc: 'Reach 14,000 deep', stat: 'best', threshold: 14000 },
  { id: 'void', icon: '✦', title: 'The Void', desc: 'Reach 22,000 deep', stat: 'best', threshold: 22000 },
  { id: 'roll', icon: '🔥', title: 'On a Roll', desc: 'Play 3 days running', stat: 'streak', threshold: 3 },
  { id: 'devoted', icon: '🗓️', title: 'Devoted', desc: 'A 7-day streak', stat: 'streak', threshold: 7 },
  { id: 'marathon', icon: '♾️', title: 'Marathoner', desc: '50,000 lifetime depth', stat: 'lifetime', threshold: 50000 },
  { id: 'touched', icon: '🌌', title: 'Void-Touched', desc: '250,000 lifetime depth', stat: 'lifetime', threshold: 250000 },
];

/** IDs of every badge unlocked at these stats. */
export function unlockedIds(stats: AchStats): string[] {
  return ACHIEVEMENTS.filter((a) => stats[a.stat] >= a.threshold).map((a) => a.id);
}

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/**
 * The next depth-tier badge you haven't earned, with the gap (px) to reach it.
 * Depth tiers are the run-actionable progression — a single run can close the gap —
 * so this is what powers the "X deeper to unlock …" goal-gradient nudge. Returns null
 * once every depth tier is earned.
 */
export function nextDepthBadge(best: number): { def: AchievementDef; gap: number } | null {
  const tiers = ACHIEVEMENTS.filter((a) => a.stat === 'best').sort(
    (a, b) => a.threshold - b.threshold,
  );
  for (const a of tiers) {
    if (best < a.threshold) return { def: a, gap: a.threshold - best };
  }
  return null;
}
