export async function commitProviderSelection({
  persist,
  sessionIsCurrent,
  destinationChanged,
  endSession,
  commit,
}: {
  persist: () => Promise<void>;
  sessionIsCurrent: () => boolean;
  destinationChanged: () => boolean;
  endSession: () => void;
  commit: () => void;
}): Promise<void> {
  await persist();
  // Keep this check and commit synchronous: a session that appeared while
  // persistence was pending must be ended before the new adapter is exposed.
  if (sessionIsCurrent() && destinationChanged()) endSession();
  commit();
}