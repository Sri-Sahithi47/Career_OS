import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Results, { engagement } from './Results';

const vendors = [{ slug: 'alpha', label: 'Alpha', latest_count: 1 }, { slug: 'beta', label: 'Beta', latest_count: 1 }];
const job = { title: 'Python Developer', job_url: 'https://example.com/job', location: 'Remote', description_snippet: 'C2C accepted', raw_text: 'Complete job description with C2C terms and requirements beyond the snippet'  };
describe('Results workspace', () => {
  it('keeps loaded results when another portal fails and filters engagement', async () => {
    const api = vi.fn(path => path.includes('alpha') ? Promise.resolve({ jobs: [job] }) : Promise.reject(new Error('unavailable')));
    render(<Results vendors={vendors} loaded api={api} refreshKey="one" onReview={vi.fn()} />);
    await screen.findByRole('button', { name: 'Python Developer' });
    expect(screen.getByRole('alert')).toHaveTextContent('Some portal results');
    await userEvent.selectOptions(screen.getByLabelText('Filter by engagement'), 'Not specified');
    expect(screen.getByText('No matching results')).toBeInTheDocument();
  });
  it('saves the selected real posting and confirms only after success', async () => {
    const api = vi.fn(path => Promise.resolve(path.includes('workspace-save') ? { ok: true } : { jobs: [job] }));
    render(<Results vendors={vendors.slice(0,1)} loaded api={api} refreshKey="two" onReview={vi.fn()} />);
    await screen.findByRole('button', { name: 'Python Developer' });
    await userEvent.click(screen.getByRole('button', { name: 'Save job', exact: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved to shortlist' })).toBeDisabled());
    const request = api.mock.calls.find(([path]) => path === '/api/workspace-save');
    expect(JSON.parse(request[1].body)).toMatchObject({ title: job.title, url: job.job_url, source: 'alpha', description: job.raw_text });
  });
  it('prioritizes restrictions over positive C2C mentions', () => {
    expect(engagement({ description_snippet: 'C2C not accepted. W2 only.' })).toBe('Restrictions found');
    expect(engagement({ employment_type: 'Contract' })).toBe('Not specified');
  });
});
