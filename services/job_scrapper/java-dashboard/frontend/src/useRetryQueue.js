import { useEffect, useRef, useState } from 'react';

const isActive = run => ['running', 'stopping'].includes(run.status);
const terminal = run => ['done', 'failed', 'stopped'].includes(run.status);

// One server run at a time. Accepted runs must be observed finishing before draining.
export default function useRetryQueue({ runs, api, onStarted, ready }) {
  const [queue, setQueue] = useState([]);
  const [submitted, setSubmitted] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const queueRef = useRef([]);
  const sending = useRef(false);
  const submittedRef = useRef(null);
  const current = useRef({ runs, api, onStarted });
  current.current = { runs, api, onStarted };

  function updateQueue(next) {
    queueRef.current = next;
    setQueue(next);
  }
  function enqueue(slugs) {
    const active = current.current.runs.filter(isActive).flatMap(run => {
      const slugs = new Set([...(run.vendors || []), ...(run.steps || []).map(step => step.slug)]);
      return [...slugs].filter(slug => {
        const step = (run.steps || []).find(step => step.slug === slug);
        return !step || ['running', 'queued', 'stopping'].includes(step.status);
      });
    });
    const excluded = new Set([...queueRef.current, ...(submittedRef.current?.slugs || []), ...active]);
    const additions = [...new Set(slugs)].filter(slug => !excluded.has(slug));
    if (additions.length) updateQueue([...queueRef.current, ...additions]);
  }
  function cancel() {
    updateQueue([]);
    setError('');
  }

  useEffect(() => {
    if (submitted) {
      const run = runs.find(run => run.id === submitted.id);
      if (run && terminal(run)) {
        submittedRef.current = null;
        setSubmitted(null);
      }
      return;
    }
    if (!ready || sending.current || error || !queue.length || runs.some(isActive)) return;
    const batch = [...queueRef.current];
    sending.current = true;
    setStarting(true);
    (async () => {
      try {
        const result = await current.current.api('/api/scrape', {
          method: 'POST', body: JSON.stringify({ mode: 'selected', vendors: batch }),
        });
        if (!result.run_id) throw new Error('The server did not return a retry run ID. Check the current search before retrying.');
        const accepted = { id: result.run_id, slugs: batch };
        submittedRef.current = accepted;
        setSubmitted(accepted);
        updateQueue(queueRef.current.filter(slug => !batch.includes(slug)));
        await current.current.onStarted();
      } catch (failure) {
        // Retain requests; resuming is explicit so persistent failures cannot loop.
        setError(failure.message || 'Could not start retries.');
      } finally {
        sending.current = false;
        setStarting(false);
      }
    })();
  }, [runs, queue, submitted, ready, error]);

  return { queue, starting, submitted, error, enqueue, cancel, resume: () => setError('') };
}
