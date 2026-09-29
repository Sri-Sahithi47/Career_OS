import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import useRetryQueue from './useRetryQueue';

function setup(initialRuns = [], api = vi.fn().mockResolvedValue({ run_id: 'retry-1' })) {
  const onStarted = vi.fn().mockResolvedValue();
  const hook = renderHook(({ runs }) => useRetryQueue({ runs, api, onStarted, ready: true }), { initialProps: { runs: initialRuns } });
  return { ...hook, api, onStarted };
}
const payload = mock => JSON.parse(mock.mock.calls.at(-1)[1].body);

describe('retry queue', () => {
  it('batches failed portals and excludes duplicates before and during submission', async () => {
    const { result, api } = setup();
    act(() => { result.current.enqueue(['artech', 'ettaingroup', 'artech']); result.current.enqueue(['artech']); });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(payload(api).vendors).toEqual(['artech', 'ettaingroup']);
    await waitFor(() => expect(result.current.submitted?.id).toBe('retry-1'));
    act(() => result.current.enqueue(['artech', 'ettaingroup']));
    expect(result.current.queue).toEqual([]);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('queues a second portal while the first retry runs and waits for explicit completion', async () => {
    const api = vi.fn().mockResolvedValueOnce({ run_id: 'first' }).mockResolvedValueOnce({ run_id: 'second' });
    const { result, rerender } = setup([], api);
    act(() => result.current.enqueue(['artech']));
    await waitFor(() => expect(result.current.submitted?.id).toBe('first'));
    act(() => result.current.enqueue(['pyramidconsulting']));
    rerender({ runs: [] }); // Delayed status propagation is not completion.
    expect(api).toHaveBeenCalledTimes(1);
    rerender({ runs: [{ id: 'first', status: 'running', vendors: ['artech'] }] });
    expect(result.current.queue).toEqual(['pyramidconsulting']);
    expect(api).toHaveBeenCalledTimes(1);
    rerender({ runs: [{ id: 'first', status: 'failed', vendors: ['artech'] }] });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(payload(api).vendors).toEqual(['pyramidconsulting']);
  });

  it('waits behind an existing search, excludes its portals, and supports cancellation', async () => {
    const { result, rerender, api } = setup([{ id: 'existing', status: 'running', vendors: ['artech'] }]);
    act(() => result.current.enqueue(['artech', 'pyramidconsulting']));
    expect(result.current.queue).toEqual(['pyramidconsulting']);
    expect(api).not.toHaveBeenCalled();
    act(() => result.current.cancel());
    rerender({ runs: [{ id: 'existing', status: 'done' }] });
    expect(result.current.queue).toEqual([]);
    expect(api).not.toHaveBeenCalled();
  });

  it('retains failed submissions without looping and resumes only on request', async () => {
    const api = vi.fn().mockRejectedValueOnce(new Error('A scrape is already running.')).mockResolvedValueOnce({ run_id: 'retry' });
    const { result, rerender } = setup([], api);
    act(() => result.current.enqueue(['artech']));
    await waitFor(() => expect(result.current.error).toContain('already running'));
    expect(result.current.queue).toEqual(['artech']);
    rerender({ runs: [] });
    expect(api).toHaveBeenCalledTimes(1);
    act(() => result.current.resume());
    await waitFor(() => expect(result.current.submitted?.id).toBe('retry'));
    expect(api).toHaveBeenCalledTimes(2);
  });
});

it('can queue a failed step while the other portals in that run are still running', async () => {
  const { result, rerender, api } = setup([{ id: 'existing', status: 'running', vendors: ['artech', 'ettaingroup'], steps: [
    { slug: 'artech', status: 'failed' }, { slug: 'ettaingroup', status: 'running' },
  ] }]);
  act(() => result.current.enqueue(['artech', 'ettaingroup']));
  expect(result.current.queue).toEqual(['artech']);
  expect(api).not.toHaveBeenCalled();
  rerender({ runs: [{ id: 'existing', status: 'failed' }] });
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  expect(payload(api).vendors).toEqual(['artech']);
});

it('keeps another click made while the first submission is still in flight', async () => {
  let accept;
  const api = vi.fn(() => new Promise(resolve => { accept = resolve; }));
  const { result } = setup([], api);
  act(() => result.current.enqueue(['artech']));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  act(() => result.current.enqueue(['artech', 'pyramidconsulting']));
  await act(async () => accept({ run_id: 'first' }));
  expect(result.current.queue).toEqual(['pyramidconsulting']);
  expect(result.current.submitted.slugs).toEqual(['artech']);
  expect(api).toHaveBeenCalledTimes(1);
});
