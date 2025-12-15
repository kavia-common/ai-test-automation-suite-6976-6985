import { render, screen } from '@testing-library/react';
import App from './App';

test('renders dashboard title in top bar', () => {
  render(<App />);
  const title = screen.getByText(/dashboard/i);
  expect(title).toBeInTheDocument();
});
