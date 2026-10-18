export interface DiscoveryCompletenessProfile {
  name?: string | null;
  gender?: string | null;
  age?: number | null;
  bio?: string | null;
  location?: string | null;
  timezone?: string | null;
  looking_for?: string[] | null;
  interests?: string[] | null;
  hobbies?: string[] | null;
  skills?: string[] | null;
  languages?: string[] | null;
}

export interface DiscoveryRankingSignals {
  compatibility: number | null;
  lookingForRelevance: number;
  completeness: number;
  recentActivity: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_WINDOW_DAYS = 30;

export function calculateLookingForRelevance(
  viewerLookingFor: string[] | null | undefined,
  candidateLookingFor: string[] | null | undefined,
): number {
  const viewer = new Set(normalizeValues(viewerLookingFor));
  const candidate = new Set(normalizeValues(candidateLookingFor));
  const union = new Set([...viewer, ...candidate]);
  if (union.size === 0) return 0;

  const shared = [...viewer].filter((value) => candidate.has(value)).length;
  return Math.round((shared / union.size) * 100);
}

export function calculateProfileCompleteness(
  profile: DiscoveryCompletenessProfile,
): number {
  const fields = [
    hasText(profile.name),
    hasText(profile.gender),
    profile.age !== null && profile.age !== undefined,
    hasText(profile.bio),
    hasText(profile.location),
    hasText(profile.timezone),
    hasValues(profile.looking_for),
    hasValues(profile.interests),
    hasValues(profile.hobbies),
    hasValues(profile.skills),
    hasValues(profile.languages),
  ];

  return Math.round(
    (fields.filter(Boolean).length / fields.length) * 100,
  );
}

export function calculateRecentActivity(
  lastSeen: string | null | undefined,
  now = Date.now(),
): number {
  if (!lastSeen) return 0;
  const lastSeenAt = Date.parse(lastSeen);
  if (!Number.isFinite(lastSeenAt)) return 0;

  const ageInDays = Math.max(0, (now - lastSeenAt) / DAY_MS);
  return Math.max(
    0,
    Math.round(100 * (1 - ageInDays / ACTIVITY_WINDOW_DAYS)),
  );
}

export function calculateDiscoveryRank(
  signals: DiscoveryRankingSignals,
): number {
  // Compatibility leads; reciprocal intent, profile detail, and recency add useful tie-break signal.
  return Math.round(
    (signals.compatibility ?? 0) * 0.55 +
      signals.lookingForRelevance * 0.2 +
      signals.completeness * 0.15 +
      signals.recentActivity * 0.1,
  );
}

function normalizeValues(values: string[] | null | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim().toLocaleLowerCase()).filter(Boolean))];
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValues(values: string[] | null | undefined): boolean {
  return Array.isArray(values) && values.some((value) => value.trim().length > 0);
}
