export function isGiftMatchAuthorized(
  match: {
    user_a: string;
    user_b: string;
    status: string;
  },
  userId: string,
): boolean {
  return (
    match.status === "active" &&
    (match.user_a === userId || match.user_b === userId)
  );
}
