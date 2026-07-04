export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return body as T;
}

export const apiGet = <T>(path: string) => request<T>(path);
export const apiPost = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiDelete = <T>(path: string) => request<T>(path, { method: 'DELETE' });

export interface Profile {
  handle: string;
  level: number;
  rank: string;
  lifetimeXp: number;
  seasonXp: number;
  seasonId: string;
  currentStreak: number;
  longestStreak: number;
  timezone: string;
  progress: { intoLevel: number; neededForNext: number };
}

export interface StatsDay {
  day: string;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  providers: string[];
  models: string[];
  toolUseSession: boolean;
  deepSession: boolean;
  usageXpAwarded: number;
}

export interface AchievementItem {
  id: string;
  name: string;
  description: string;
  xp: number;
  grantedAt: string | null;
}

export interface KeyItem {
  id: string;
  label: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface Onboarding {
  connected: boolean;
  eventCount: number;
  firstEventAt: string | null;
}

export interface SessionUser {
  id: string;
  handle: string;
  email: string;
}

export interface PostChips {
  rank?: string;
  level?: number;
  streak?: number;
  models?: string[];
  moment?: Record<string, unknown>;
}

export interface FeedPost {
  id: string;
  title: string;
  url: string | null;
  body: string;
  recipe: string | null;
  chips: PostChips;
  kudosCount: number;
  copyCount: number;
  commentCount: number;
  createdAt: string;
  author: { handle: string; level: number; rank: string };
  myKudos: boolean;
}

export interface CommentItem {
  id: string;
  body: string;
  createdAt: string;
  author: { handle: string; level: number; rank: string };
}

export interface MomentSuggestion {
  momentId: string;
  kind: string;
  ts: string;
  metadata: Record<string, unknown>;
  draft: { title: string; body: string };
}

export interface LeaderboardEntry {
  position: number | null;
  handle: string;
  level: number;
  rank: string;
  xp: number;
  lifetimeXp: number;
  seasonXp: number;
  currentStreak: number;
  isMe?: boolean;
}

export interface Leaderboard {
  board: 'season' | 'lifetime';
  season: string;
  meijin: string | null;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

export interface PublicProfile {
  handle: string;
  level: number;
  rank: string;
  lifetimeXp: number;
  seasonXp: number;
  seasonId: string;
  currentStreak: number;
  longestStreak: number;
  memberSince: string;
  followerCount: number;
  followingCount: number;
  iFollow: boolean;
  isMe: boolean;
  achievements: Array<{ achievementId: string; grantedAt: string }>;
  posts: FeedPost[];
}
