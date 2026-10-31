import { finishMasumenPlay, startMasumenPlay, submitAndLoadRanking } from './platform';

interface CompletedResult {
  score: number;
  resultType: 'clear' | 'game_over';
  reachedWave: number;
}
interface PlayApi {
  start: typeof startMasumenPlay;
  finish: typeof finishMasumenPlay;
  legacy: typeof submitAndLoadRanking;
}
/** Consent and remote identity belong to a start, never to an editable home field. */
export function createPlaySession(name: string, api: PlayApi = {
  start: startMasumenPlay, finish: finishMasumenPlay, legacy: submitAndLoadRanking,
}) {
  const playerName = name.trim();
  // Starting the network request does not delay gameplay. Always handle its rejection.
  const start = playerName ? api.start(playerName).catch(() => null) : Promise.resolve(null);
  let submission: Promise<void> | null = null;
  return {
    playerName,
    submit(result: CompletedResult): Promise<void> {
      if (!submission) {
        const captured = { ...result };
        submission = playerName ? start.then(async playId => {
          if (playId) await api.finish({ ...captured, playId, playerName });
          else await api.legacy(captured.score, playerName);
        }) : Promise.resolve();
      }
      // The legacy RPC has no idempotency key: an ambiguous failure must not be
      // automatically retried. Ranking refreshes only perform the separate read.
      return submission;
    },
  };
}
