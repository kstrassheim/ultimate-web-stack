import React from 'react';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useMsal } from '@azure/msal-react';
import WorldlineMonitor from './WorldlineMonitor';
import { 
  getWorldlineStatus, 
  getWorldlineHistory, 
  getDivergenceReadings,
  worldlineSocket,
  formatDivergenceReading,
  formatWorldLineChange
} from '@/api/futureGadgetApi';
import appInsights from '@/log/appInsights';
import notyfService from '@/log/notyfService';

// Mock the dependencies
jest.mock('@azure/msal-react');
jest.mock('@/api/futureGadgetApi');
jest.mock('@/log/appInsights');
jest.mock('@/log/notyfService');

// Add this just before the 'describe' block to suppress console logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;

describe('WorldlineMonitor', () => {
  // Suppress console methods before all tests
  beforeAll(() => {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    console.info = jest.fn();
    console.debug = jest.fn();
  });

  // Restore console methods after all tests
  afterAll(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.info = originalConsoleInfo;
    console.debug = originalConsoleDebug;
  });

  // Setup mock data for tests
  const mockInstance = { name: 'mockInstance' };
  const mockWorldlineStatus = {
    current_worldline: 1.337192,
    base_worldline: 1.0,
    total_divergence: 0.337192,
    experiment_count: 5,
    timestamp: '2025-04-07T12:34:56.789Z',
    closest_reading: {
      value: 1.382733,
      status: 'beta',
      recorded_by: 'Suzuha Amane',
      notes: 'Beta worldline variant',
      distance: 0.045541
    }
  };
  
  const mockWorldlineHistory = [
    {
      current_worldline: 1.0,
      base_worldline: 1.0,
      total_divergence: 0.0,
      experiment_count: 0,
      timestamp: '2025-04-07T12:00:00.000Z'
    },
    {
      current_worldline: 1.337192,
      base_worldline: 1.0,
      total_divergence: 0.337192,
      experiment_count: 1,
      timestamp: '2025-04-07T12:30:00.000Z'
    },
    {
      current_worldline: 1.698596,
      base_worldline: 1.0, 
      total_divergence: 0.698596,
      experiment_count: 2,
      timestamp: '2025-04-07T12:34:56.789Z'
    }
  ];
  
  const mockDivergenceReadings = [
    {
      id: 'DR-001',
      reading: 1.048596,
      status: 'steins_gate',
      recorded_by: 'Rintaro Okabe',
      notes: 'Steins;Gate worldline'
    },
    {
      id: 'DR-002',
      reading: 0.571024,
      status: 'alpha',
      recorded_by: 'Rintaro Okabe',
      notes: 'Alpha worldline'
    },
    {
      id: 'DR-003',
      reading: 1.382733,
      status: 'beta',
      recorded_by: 'Suzuha Amane',
      notes: 'Beta worldline variant'
    }
  ];
  
  // Setup before each test
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup useMsal mock
    useMsal.mockReturnValue({ instance: mockInstance });
    
    // Setup API mocks
    getWorldlineStatus.mockResolvedValue(mockWorldlineStatus);
    getWorldlineHistory.mockResolvedValue(mockWorldlineHistory);
    getDivergenceReadings.mockResolvedValue(mockDivergenceReadings);
    
    // Setup WebSocket mocks
    worldlineSocket.connect = jest.fn();
    worldlineSocket.disconnect = jest.fn();
    worldlineSocket.subscribe = jest.fn().mockReturnValue(jest.fn());
    worldlineSocket.subscribeToStatus = jest.fn().mockImplementation(callback => {
      // Simulate connection status update
      callback('connected');
      return jest.fn();
    });
    
    // Mock format functions to return predictable values
    formatDivergenceReading.mockImplementation(reading => 
      reading.reading ? reading.reading.toFixed(6) : 'N/A'
    );
    formatWorldLineChange.mockImplementation(change => 
      change >= 0 ? `+${change.toFixed(6)}` : change.toFixed(6)
    );
  });
  
  // Test component initial rendering and data loading
  test('renders all main sections', async () => {
    render(<WorldlineMonitor />);
    
    // Check main title
    expect(screen.getByText('Divergence Meter')).toBeInTheDocument();
    
    // Check for the three main cards
    expect(screen.getByTestId('worldline-status-card')).toBeInTheDocument();
    expect(screen.getByTestId('worldline-history-card')).toBeInTheDocument();
    expect(screen.getByTestId('divergence-readings-card')).toBeInTheDocument();
    
    // Wait for API data to load
    await waitFor(() => {
      expect(getWorldlineStatus).toHaveBeenCalledWith(mockInstance);
      expect(getWorldlineHistory).toHaveBeenCalledWith(mockInstance);
      expect(getDivergenceReadings).toHaveBeenCalledWith(mockInstance);
    });
    
    // Wait for WebSocket connection
    expect(worldlineSocket.connect).toHaveBeenCalledWith(mockInstance);
    expect(worldlineSocket.subscribe).toHaveBeenCalled();
    expect(worldlineSocket.subscribeToStatus).toHaveBeenCalled();
    
    // Check for connection badge
    expect(screen.getByTestId('ws-status-badge')).toHaveTextContent('Live');
  });
  
  // Test worldline status card content
  test('displays worldline status correctly', async () => {
    render(<WorldlineMonitor />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByTestId('worldline-value')).toHaveTextContent('1.337192');
    });
    
    // Check for worldline badge
    expect(screen.getByTestId('worldline-badge')).toHaveTextContent('beta');
    
    // Check for closest reading information
    const closestReadingSection = screen.getByText('Closest Known Reading:').closest('.closest-reading');
    expect(closestReadingSection).toBeInTheDocument();
    
    // Use within to scope our queries to just the closest reading section
    const { getByText } = within(closestReadingSection);
    expect(getByText('Value:')).toBeInTheDocument();
    expect(getByText('Suzuha Amane')).toBeInTheDocument();
    expect(getByText('Beta worldline variant')).toBeInTheDocument();
  });
  
  // Test worldline history card content
  test('displays worldline history correctly', async () => {
    render(<WorldlineMonitor />);
    
    // Wait for history data to load
    await waitFor(() => {
      const historyTable = screen.getByTestId('worldline-history-card').querySelector('table');
      expect(historyTable).toBeInTheDocument();
      
      // Check for table headers
      expect(screen.getByText('Step')).toBeInTheDocument();
      expect(screen.getByText('Worldline')).toBeInTheDocument();
      expect(screen.getByText('Change')).toBeInTheDocument();
      expect(screen.getByText('Total Divergence')).toBeInTheDocument();
      
      // Check for table rows (3 rows: base + 2 experiments)
      const rows = historyTable.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
      
      // First row should be base
      expect(rows[0].querySelector('td:first-child')).toHaveTextContent('Base');
      
      // Other rows should be experiments
      expect(rows[1].querySelector('td:first-child')).toHaveTextContent('Exp 1');
      expect(rows[2].querySelector('td:first-child')).toHaveTextContent('Exp 2');
    });
  });
  
  // Test divergence readings card
  test('displays divergence readings correctly', async () => {
    render(<WorldlineMonitor />);
    
    // Wait for readings data to load
    await waitFor(() => {
      const readingsCard = screen.getByTestId('divergence-readings-card');
      const readingsTable = readingsCard.querySelector('table');
      expect(readingsTable).toBeInTheDocument();
      
      // Check for table headers within the table element
      const tableHeaders = readingsTable.querySelectorAll('th');
      expect(tableHeaders[0]).toHaveTextContent('Reading');
      expect(tableHeaders[1]).toHaveTextContent('Status');
      expect(tableHeaders[2]).toHaveTextContent('Recorded By');
      expect(tableHeaders[3]).toHaveTextContent('Notes');
      
      // Check for table rows (3 readings)
      const rows = readingsTable.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
      
      // Check specific reading values
      expect(screen.getByTestId('reading-row-DR-001')).toHaveTextContent('1.048596');
      expect(screen.getByTestId('reading-row-DR-002')).toHaveTextContent('0.571024');
      expect(screen.getByTestId('reading-row-DR-003')).toHaveTextContent('1.382733');
    });
  });
  
  // Test refresh buttons
  test('refresh buttons trigger API calls', async () => {
    render(<WorldlineMonitor />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(getWorldlineStatus).toHaveBeenCalledTimes(1);
      expect(getWorldlineHistory).toHaveBeenCalledTimes(1);
      expect(getDivergenceReadings).toHaveBeenCalledTimes(1);
    });
    
    // Clear mock call counts
    getWorldlineStatus.mockClear();
    getWorldlineHistory.mockClear();
    getDivergenceReadings.mockClear();
    
    // Click refresh buttons
    fireEvent.click(screen.getByTestId('refresh-status-btn'));
    fireEvent.click(screen.getByTestId('refresh-history-btn'));
    fireEvent.click(screen.getByTestId('refresh-readings-btn'));
    
    // Check if API calls were made
    await waitFor(() => {
      expect(getWorldlineStatus).toHaveBeenCalledTimes(1);
      expect(getWorldlineHistory).toHaveBeenCalledTimes(1);
      expect(getDivergenceReadings).toHaveBeenCalledTimes(1);
    });
  });
  
  // Test filter functionality
  test('filters divergence readings correctly', async () => {
    render(<WorldlineMonitor />);
    
    // Wait for readings to load
    await waitFor(() => {
      expect(screen.getByTestId('readings-table')).toBeInTheDocument();
      // Initially should show all 3 readings
      const rows = screen.getAllByTestId(/reading-row-DR-/);
      expect(rows.length).toBe(3);
    });
    
    // Apply status filter for "alpha"
    const statusFilter = screen.getByTestId('status-filter');
    fireEvent.change(statusFilter, { target: { value: 'alpha' } });
    
    // Should now only show the alpha reading
    await waitFor(() => {
      const rows = screen.getAllByTestId(/reading-row-DR-/);
      expect(rows.length).toBe(1);
      expect(rows[0]).toHaveTextContent('0.571024');
      expect(rows[0]).toHaveTextContent('alpha');
    });
    
    // Reset filters
    fireEvent.click(screen.getByTestId('reset-filters-btn'));
    
    // Should show all readings again
    await waitFor(() => {
      const rows = screen.getAllByTestId(/reading-row-DR-/);
      expect(rows.length).toBe(3);
    });
    
    // Apply recorded by filter
    const recordedByFilter = screen.getByTestId('recorded-by-filter');
    fireEvent.change(recordedByFilter, { target: { value: 'Suzuha' } });
    
    // Should show only Suzuha's reading
    await waitFor(() => {
      const rows = screen.getAllByTestId(/reading-row-DR-/);
      expect(rows.length).toBe(1);
      expect(rows[0]).toHaveTextContent('Suzuha Amane');
    });
  });
  
  // Test WebSocket message handling
  test('handles WebSocket messages correctly', async () => {
    render(<WorldlineMonitor />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(worldlineSocket.subscribe).toHaveBeenCalled();
    });
    
    // Get the subscribe callback
    const subscribeCallback = worldlineSocket.subscribe.mock.calls[0][0];
    
    // Create an updated worldline status
    const updatedStatus = {
      ...mockWorldlineStatus,
      current_worldline: 1.432891,
      total_divergence: 0.432891
    };
    
    // Simulate receiving WebSocket message
    act(() => {
      subscribeCallback(updatedStatus);
    });
    
    // Check if worldline value was updated
    await waitFor(() => {
      expect(screen.getByTestId('worldline-value')).toHaveTextContent('1.432891');
    });
    
    // Test preview message
    const previewStatus = {
      ...mockWorldlineStatus,
      current_worldline: 1.5,
      includes_preview: true,
      preview_experiment: {
        name: "Test Preview",
        world_line_change: 0.1
      }
    };
    
    // Simulate receiving preview message
    act(() => {
      subscribeCallback(previewStatus);
    });
    
    // Check if notification was shown
    expect(notyfService.info).toHaveBeenCalledWith(expect.stringContaining('Test Preview'));
  });
  
  // Test error handling
  test('handles API errors correctly', async () => {
    // Setup API to fail
    getWorldlineStatus.mockRejectedValue(new Error('API error'));
    
    render(<WorldlineMonitor />);
    
    // Should show error message
    await waitFor(() => {
      expect(screen.getByTestId('worldline-error')).toHaveTextContent('Failed to load worldline status: API error');
    });
    
    // Should log the error
    expect(appInsights.trackException).toHaveBeenCalled();
    expect(notyfService.error).toHaveBeenCalled();
  });
  
  // Test WebSocket connection status
  test('displays correct connection status', async () => {
    render(<WorldlineMonitor />);
    
    // Initially should be connected (from our mock)
    expect(screen.getByTestId('ws-status-badge')).toHaveTextContent('Live');
    
    // Get the status callback
    const statusCallback = worldlineSocket.subscribeToStatus.mock.calls[0][0];
    
    // Simulate disconnection
    act(() => {
      statusCallback('disconnected');
    });
    
    // Should show disconnected status
    await waitFor(() => {
      expect(screen.getByTestId('ws-status-badge')).toHaveTextContent('Offline');
    });
  });
  
  // Test cleanup on unmount
  test('cleans up subscriptions on unmount', async () => {
    const unsubscribeMock = jest.fn();
    const unsubscribeStatusMock = jest.fn();
    
    // Setup mocks to return cleanup functions
    worldlineSocket.subscribe.mockReturnValue(unsubscribeMock);
    worldlineSocket.subscribeToStatus.mockReturnValue(unsubscribeStatusMock);
    
    const { unmount } = render(<WorldlineMonitor />);
    
    // Wait for init
    await waitFor(() => {
      expect(worldlineSocket.subscribe).toHaveBeenCalled();
    });
    
    // Unmount component
    unmount();
    
    // Check if cleanup functions were called
    expect(unsubscribeMock).toHaveBeenCalled();
    expect(unsubscribeStatusMock).toHaveBeenCalled();
    expect(worldlineSocket.disconnect).toHaveBeenCalled();
  });
});