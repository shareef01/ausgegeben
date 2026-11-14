/**
 * AUS-202: one catch-up pass materializes at most MAX_OCCURRENCES_PER_PASS (20) due
 * dates, and nothing ran the next pass until something else happened (going online,
 * the tab becoming visible). A backlog of 45 due dates left 25 waiting indefinitely,
 * so balances and budgets stayed behind and people added the missing charges by hand.
 *
 * Now a pass that used its whole budget and made progress is followed by another,
 * after a short pause, until the backlog is done. The run is bounded
 * ([MAX_CATCH_UP_CONTINUATIONS] extra passes per trigger, i.e. up to 500 more dates)
 * and stops as soon as [shouldContinue] says no (another account signed in, or the
 * listener was torn down). Each pass is still bounded, so one trigger can't hold the
 * network for long.
 */
export const MAX_CATCH_UP_CONTINUATIONS = 25;
export const CATCH_UP_CONTINUATION_DELAY_MS = 1_000;

/**
 * Runs [pass] until it reports no remaining work. [pass] returns whether more due work
 * is left. Returns the number of passes run.
 */
export async function runCatchUp(
  pass: () => Promise<boolean>,
  shouldContinue: () => boolean,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxContinuations = MAX_CATCH_UP_CONTINUATIONS,
): Promise<number> {
  let passes = 0;
  let more = await pass();
  passes++;
  for (let continuation = 0; more && continuation < maxContinuations; continuation++) {
    await wait(CATCH_UP_CONTINUATION_DELAY_MS);
    if (!shouldContinue()) break;
    more = await pass();
    passes++;
  }
  return passes;
}
