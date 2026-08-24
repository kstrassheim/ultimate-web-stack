import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotFound from './404';

describe('404 Page', () => {
  it('renders the 404 message', () => {
    render(<NotFound />);
    // The page is a "404 Not Found" panel with text. Use a substring
    // match to avoid coupling to exact wording.
    expect(screen.getByText(/404/i)).toBeInTheDocument();
  });

  it('renders a back-to-home link', () => {
    render(<NotFound />);
    const link = screen.getByRole('link', { name: /home|back/i });
    expect(link).toBeInTheDocument();
  });
});