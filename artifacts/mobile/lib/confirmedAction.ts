export async function runConfirmedAction(
  confirm: () => Promise<boolean>,
  action: () => Promise<void>,
): Promise<boolean> {
  if (!(await confirm())) return false;
  await action();
  return true;
}