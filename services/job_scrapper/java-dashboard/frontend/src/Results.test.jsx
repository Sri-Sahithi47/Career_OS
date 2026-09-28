import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Results, { engagement, dateBounds } from './Results';

const vendors = [{ slug: 'alpha', label: 'Alpha', latest_count: 1 }];
const job = { key: '1', sourceSlug: 'alpha', sourceLabel: 'Alpha', review_state: 'new', title: 'Python Developer', job_url: 'https://example.com/job', location: 'Remote', description_snippet: 'C2C accepted', raw_text: 'Complete job description with C2C terms and requirements beyond the snippet' };
const data = { jobs: [job], total: 1, counts: { new: 1 }, warnings: [] };
describe('Collected jobs', () => {
  it('loads stored jobs without scraping and sends date and portal filters', async () => {
    const api = vi.fn(() => Promise.resolve(data));
    render(<Results vendors={vendors} loaded api={api} refreshKey="one" />);
    await screen.findByRole('button', { name: job.title });
    await userEvent.selectOptions(screen.getByLabelText('Date range'), '7');
    await userEvent.selectOptions(screen.getByLabelText('Collected portal'), 'alpha');
    await waitFor(() => expect(api.mock.calls.at(-1)[0]).toContain('portal=alpha'));
    const params = new URLSearchParams(api.mock.calls.at(-1)[0].split('?')[1]);
    expect(params.get('from')).toBeTruthy();
    expect(params.get('date_field')).toBe('first_seen');
    expect(api.mock.calls.every(([path]) => path.startsWith('/api/collected?'))).toBe(true);
  });
  it('saves the full posting and confirms only after success', async () => {
    const api = vi.fn(path => Promise.resolve(path.includes('workspace-save') ? { ok: true } : data));
    render(<Results vendors={vendors} loaded api={api} refreshKey="two" />);
    await screen.findByRole('button', { name: job.title });
    await userEvent.click(screen.getByRole('button', { name: 'Save job', exact: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved to shortlist' })).toBeDisabled());
    const request = api.mock.calls.find(([path]) => path === '/api/workspace-save');
    expect(JSON.parse(request[1].body)).toMatchObject({ title: job.title, url: job.job_url, source: 'alpha', description: job.raw_text });
  });
  it('persists bulk dismissal and supports restoring dismissed jobs', async () => {
    const api = vi.fn(() => Promise.resolve(data));
    render(<Results vendors={vendors} loaded api={api} />);
    await screen.findByRole('button', { name: job.title });
    await userEvent.click(screen.getByLabelText('Select this page'));
    await userEvent.click(screen.getAllByRole('button', { name: 'Dismiss', exact: true })[0]);
    expect(api.mock.calls.some(([path, options]) => path === '/api/collected/review' && JSON.parse(options.body).state === 'dismissed')).toBe(true);
    await screen.findByText(/Moved to Dismissed/);
  });
  it('preserves the list and shows an error if review fails', async () => {
    const api = vi.fn(path => path === '/api/collected/review' ? Promise.reject(new Error('Save failed')) : Promise.resolve(data));
    render(<Results vendors={vendors} loaded api={api} />);
    await screen.findByRole('button', { name: job.title });
    await userEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
    expect(screen.getByRole('button', { name: job.title })).toBeInTheDocument();
  });
  it('uses inclusive local calendar days with an exclusive end boundary', () => {
    const now = new Date(2026, 8, 27, 12);
    const bounds = dateBounds('7', 7, '', '', now);
    expect(new Date(bounds.from).getDate()).toBe(21);
    expect(new Date(bounds.until).getDate()).toBe(28);
    const custom = dateBounds('custom', 7, '2026-09-01', '2026-09-02', now);
    expect(new Date(custom.until).getDate()).toBe(3);
  });
  it('prioritizes restrictions over positive C2C mentions', () => {
    expect(engagement({ description_snippet: 'C2C not accepted. W2 only.' })).toBe('Restrictions found');
  });
});
