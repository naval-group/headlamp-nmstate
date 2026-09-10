/**
 * Pulls the actual error out of an enactment's failure message.
 *
 * nmstate returns its whole apply log, and on a busy node that is dominated by
 * one INFO line per interface it chose to ignore — a measured failure ran to
 * 5468 characters, of which two lines said what went wrong. Showing the blob
 * verbatim recreates exactly the problem this plugin exists to solve: the
 * reason buried in a dump.
 */
export interface NmstateFailure {
  /** The error itself, ready to show as the headline. */
  summary: string;
  /** Everything nmstate printed, for when the headline is not enough. */
  detail: string;
  /** True when the summary was found rather than guessed at. */
  recognised: boolean;
}

/**
 * Lines nmstate emits while deciding what to leave alone.
 *
 * The level sits inside the bracket alongside the timestamp and module, as in
 * `[2026-09-09T21:36:25Z INFO  nmstate::ifaces] Ignoring interface ...`.
 */
const NOISE = /^\[[^\]]*\b(INFO|DEBUG|TRACE)\b[^\]]*\]/;

export function parseFailure(message: string): NmstateFailure {
  const detail = (message ?? '').trim();
  if (!detail) return { summary: '', detail: '', recognised: false };

  const lines = detail.split('\n');

  // The error nmstate raises, which is what someone reading this needs first.
  const errorLines = lines.filter(line => /NmstateError:|^Error:|\bERROR\b/.test(line));
  if (errorLines.length > 0) {
    return {
      summary: errorLines.map(line => line.replace(/^.*?NmstateError:\s*/, '').trim()).join('\n'),
      detail,
      recognised: true,
    };
  }

  // No recognisable error: fall back to whatever is left once the running
  // commentary is stripped, so the headline is at least not a log line.
  const meaningful = lines.map(line => line.trim()).filter(line => line && !NOISE.test(line));
  return {
    summary: meaningful.slice(0, 3).join('\n') || detail.slice(0, 200),
    detail,
    recognised: false,
  };
}

/** How many times this generation has been retried, if the enactment says. */
export function retriesFor(
  retryCount: Record<string, number> | undefined,
  generation: number | null
): number {
  if (!retryCount) return 0;
  if (generation !== null && retryCount[String(generation)] !== undefined) {
    return retryCount[String(generation)];
  }
  return Math.max(0, ...Object.values(retryCount));
}
