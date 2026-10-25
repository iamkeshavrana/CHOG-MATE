interface SwipeMatchRow {
  id: string;
  status: "active" | "unmatched";
  unmatched_by: string | null;
  compatibility_score: number;
  created_at: string;
  last_activity: string | null;
}

export function toSwipeMatchResponse(
  row: SwipeMatchRow,
  profile: unknown,
  currentUserId: string,
) {
  return {
    id: row.id,
    profile,
    compatibility: row.compatibility_score,
    createdAt: row.created_at,
    lastActivity: row.last_activity,
    unreadCount: 0,
    status: row.status,
    rematchAvailable:
      row.status === "unmatched" && row.unmatched_by === currentUserId,
  };
}
