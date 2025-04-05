import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import GroupsList from './GroupsList';

describe('GroupsList Component', () => {
  // Mock data
  const mockGroups = [
    { 
      id: '1', 
      displayName: 'Developers', 
      description: 'Development team', 
      mail: 'dev@example.com' 
    },
    { 
      id: '2', 
      displayName: 'Marketing', 
      description: 'Marketing team', 
      mail: 'marketing@example.com' 
    },
    { 
      id: '3', 
      displayName: 'HR', 
      description: null, 
      mail: null 
    }
  ];

  test('renders loading state', () => {
    render(<GroupsList loading={true} groups={[]} />);
    expect(screen.getByTestId('groups-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading groups...')).toBeInTheDocument();
  });

  test('renders empty state when groups array is empty', () => {
    render(<GroupsList loading={false} groups={[]} />);
    expect(screen.getByTestId('groups-empty')).toBeInTheDocument();
    expect(screen.getByText('No groups available')).toBeInTheDocument();
  });

  test('renders empty state when groups is null', () => {
    render(<GroupsList loading={false} groups={null} />);
    expect(screen.getByTestId('groups-empty')).toBeInTheDocument();
    expect(screen.getByText('No groups available')).toBeInTheDocument();
  });

  test('renders groups list when groups are provided', () => {
    render(<GroupsList loading={false} groups={mockGroups} />);
    
    // Check container elements
    expect(screen.getByTestId('groups-list-container')).toBeInTheDocument();
    expect(screen.getByTestId('groups-table')).toBeInTheDocument();
    
    // Check table headers
    expect(screen.getByText('Display Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    
    // Check summary
    expect(screen.getByTestId('groups-summary')).toBeInTheDocument();
    expect(screen.getByText('Total groups: 3')).toBeInTheDocument();
  });

  test('renders correct group details', () => {
    render(<GroupsList loading={false} groups={mockGroups} />);
    
    // Check first group details
    expect(screen.getByTestId('group-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('group-name-1')).toHaveTextContent('Developers');
    expect(screen.getByText('Development team')).toBeInTheDocument();
    expect(screen.getByText('dev@example.com')).toBeInTheDocument();
    
    // Check fallback text for missing data in third group
    expect(screen.getByTestId('group-row-3')).toBeInTheDocument();
    expect(screen.getByTestId('group-name-3')).toHaveTextContent('HR');
    expect(screen.getAllByText('No description')[0]).toBeInTheDocument();
    expect(screen.getAllByText('No email')[0]).toBeInTheDocument();
  });
});