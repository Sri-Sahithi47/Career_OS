import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PortalLogo, PortalProgress, portalProgress, portalState, storedPanel, IMPORTANT_PORTALS, portalCategory } from './PortalPresentation';

describe('Portal presentation', () => {
  it('distinguishes failed searches with old jobs from successful empty searches', () => {
    const vendor = { slug: 'test', latest_count: 12 };
    expect(portalState(vendor, [{ steps: [{ slug: 'test', status: 'failed' }] }])).toBe('attention');
    expect(portalState(vendor, [{ steps: [{ slug: 'test', status: 'running' }] }])).toBe('running');
    expect(portalState({ slug: 'test', latest_count: 0 }, [])).toBe('unsearched');
    expect(portalState({ slug: 'test', latest_count: 0, latest_file: 'results.json' }, [])).toBe('empty');
    expect(portalState(vendor, [])).toBe('ready');
  });
  it('falls back to initials if a company icon fails', () => {
    const { container } = render(<PortalLogo slug="judgegroup" label="Judge Group" />);
    fireEvent.error(container.querySelector('img'));
    expect(screen.getByText('JG')).toBeInTheDocument();
  });
  it('clamps saved panel widths and reads embedded preferences', () => {
    window.__scraperPanel = { width: 900, open: false };
    expect(storedPanel()).toEqual({ width: 460, open: false });
    delete window.__scraperPanel;
  });
});


describe('Live company progress', () => {
  const vendor = { slug: 'test', label: 'Test Company' };
  it('moves from queued to searching to complete without leaving a spinner', () => {
    const run = status => [{ status: status === 'done' ? 'done' : 'running', vendors: ['test'], steps: [{ slug: 'test', status }] }];
    const { rerender, container } = render(<PortalProgress vendor={vendor} runs={run('queued')} />);
    expect(screen.getByRole('status')).toHaveTextContent('Queued');
    expect(container.querySelector('.portal-spinner')).toBeNull();
    rerender(<PortalProgress vendor={vendor} runs={run('running')} />);
    expect(screen.getByRole('status')).toHaveTextContent('Searching');
    expect(container.querySelector('.portal-spinner')).not.toBeNull();
    rerender(<PortalProgress vendor={vendor} runs={run('done')} />);
    expect(screen.getByRole('status')).toHaveTextContent('Complete');
    expect(container.querySelector('.portal-spinner')).toBeNull();
  });
  it('uses the newest run even before its steps arrive', () => {
    expect(portalProgress(vendor, [{ status: 'done', steps: [{ slug: 'test', status: 'done' }] }, { status: 'running', vendors: ['test'], steps: [] }])).toBe('queued');
  });
  it('handles stopping, failure and incomplete terminal steps', () => {
    for (const state of ['stopping', 'stopped', 'failed']) {
      expect(portalProgress(vendor, [{ status: state, vendors: ['test'], steps: [{ slug: 'test', status: 'running' }] }])).toBe(state);
    }
    expect(portalProgress(vendor, [{ status: 'running', vendors: ['other'], steps: [] }])).toBeNull();
  });
});


it('defaults the requested 17 portals to important and respects both move directions', () => {
  expect(IMPORTANT_PORTALS).toHaveLength(17);
  expect(new Set(IMPORTANT_PORTALS).size).toBe(17);
  expect(portalCategory('cbts')).toBe('important');
  expect(portalCategory('pyramidconsulting')).toBe('important');
  expect(portalCategory('vaco')).toBe('optional');
  expect(portalCategory('teksystems', { teksystems: 'optional' })).toBe('optional');
  expect(portalCategory('vaco', { vaco: 'important' })).toBe('important');
  expect(portalCategory('teksystems', { teksystems: 'invalid' })).toBe('important');
});
