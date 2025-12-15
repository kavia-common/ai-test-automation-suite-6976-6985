import { render, screen } from '@testing-library/react';
import App from './App';

test('renders dashboard title in top bar', async () => {
  render(<App />);
  const title = await screen.findByText(/dashboard/i);
  expect(title).toBeInTheDocument();
});
