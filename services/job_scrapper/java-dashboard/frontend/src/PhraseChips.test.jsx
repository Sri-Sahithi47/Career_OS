import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import PhraseChips from './PhraseChips';

function Field() {
  const [value, setValue] = useState('java developer');
  return <PhraseChips label="Keywords" value={value} onChange={setValue} onDraft={() => {}} />;
}
it('pastes multiple phrases without duplicates and removes individual phrases', async () => {
  const user = userEvent.setup();
  render(<Field />);
  await user.click(screen.getByLabelText('Keywords'));
  await user.paste('java developer\n spring boot \n\nqa engineer');
  expect(screen.getAllByRole('button', { name: 'Remove java developer from Keywords' })).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Remove spring boot from Keywords' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Remove spring boot from Keywords' }));
  expect(screen.queryByRole('button', { name: 'Remove spring boot from Keywords' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove qa engineer from Keywords' })).toBeInTheDocument();
});
it('keeps long phrase lists compact with an accessible expansion control', async () => {
  const user = userEvent.setup();
  render(<PhraseChips label="Keywords" value={'one\ntwo\nthree\nfour\nfive\nsix'} onChange={() => {}} onDraft={() => {}} />);
  expect(screen.queryByRole('button', { name: 'Remove six from Keywords' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Expand Keywords' }));
  expect(screen.getByRole('button', { name: 'Remove six from Keywords' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Collapse Keywords' }));
  expect(screen.queryByRole('button', { name: 'Remove six from Keywords' })).not.toBeInTheDocument();
});
