import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from './Home';

describe('Home Component', () => {
  test('renders the welcome heading', () => {
    render(<Home />);
    const headingElement = screen.getByRole('heading', { level: 1 });
    expect(headingElement).toBeInTheDocument();
    expect(headingElement).toHaveTextContent('Welcome to Ultimate Web Stack');
  });

  test('renders the page wrapper with correct test id', () => {
    render(<Home />);
    const pageWrapper = screen.getByTestId('home-page');
    expect(pageWrapper).toBeInTheDocument();
  });

  test('renders the intro paragraph text', () => {
    render(<Home />);
    const paragraphText = screen.getByText(/modern full-stack application/i);
    expect(paragraphText).toBeInTheDocument();
  });
  
  test('renders all feature cards', () => {
    render(<Home />);
    
    // Check all six feature card titles are present
    expect(screen.getByText('React Frontend')).toBeInTheDocument();
    expect(screen.getByText('FastAPI Backend')).toBeInTheDocument();
    expect(screen.getByText('Real-time Features')).toBeInTheDocument();
    expect(screen.getByText('Comprehensive Testing')).toBeInTheDocument();
    expect(screen.getByText('Azure Integration')).toBeInTheDocument();
    expect(screen.getByText('Developer Experience')).toBeInTheDocument();
  });
  
  test('renders responsive Bootstrap container', () => {
    render(<Home />);
    
    // Check for Bootstrap container elements
    const container = screen.getByTestId('home-page').querySelector('.container-fluid');
    expect(container).toBeInTheDocument();
    
    // Check for row elements
    const rows = screen.getByTestId('home-page').querySelectorAll('.row');
    expect(rows.length).toBeGreaterThan(0);
    
    // Check for column elements with responsive classes
    const columns = screen.getByTestId('home-page').querySelectorAll('[class*="col-"]');
    expect(columns.length).toBeGreaterThan(0);
  });
});