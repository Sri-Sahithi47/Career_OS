import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import PortalDropdown from './PortalDropdown';

const options = [{ value: 'prime', label: 'Prime', count: 18 }, { value: 'optional', label: 'Others', count: 15 }];
it('supports keyboard selection and restores focus', async () => {
  const onChange = vi.fn();
  render(<PortalDropdown label="Portal category" value="prime" options={options} onChange={onChange} />);
  const trigger = screen.getByRole('button', { name: 'Portal category' });
  trigger.focus();
  await userEvent.keyboard('{ArrowDown}');
  expect(screen.getByRole('option', { name: /Prime/ })).toHaveFocus();
  await userEvent.keyboard('{End}{Enter}');
  expect(onChange).toHaveBeenCalledWith('optional');
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
it('dismisses on Escape and outside clicks without changing selection', async () => {
  const onChange = vi.fn();
  render(<><PortalDropdown label="Portal category" value="prime" options={options} onChange={onChange} /><button>Outside</button></>);
  const trigger = screen.getByRole('button', { name: 'Portal category' });
  await userEvent.click(trigger);
  await userEvent.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(trigger);
  await userEvent.click(screen.getByText('Outside'));
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
