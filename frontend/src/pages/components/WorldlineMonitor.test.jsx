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

// Improved mock for react-apexcharts to test annotations (horizontal lines)
jest.mock('react-apexcharts', () => {
  return function DummyChart({ options, series, height }) {
    // Extract annotations count for testing
    const annotationsCount = options?.annotations?.yaxis?.length || 0;
    
    return (
      <div data-testid="mock-apex-chart">
        <div>Chart height: {height}</div>
        <div>Series count: {series.length}</div>
        <div>Data points: {series[0]?.data?.length || 0}</div>
        <div data-testid="chart-annotations-count">Annotations: {annotationsCount}</div>
      </div>
    );
  };
});

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
      timestamp: '2025-04-07T12:00:00.000Z',
      added_experiment: null
    },
    {
      current_worldline: 1.337192,
      base_worldline: 1.0,
      total_divergence: 0.337192,
      experiment_count: 1,
      timestamp: '2025-04-07T12:30:00.000Z',
      added_experiment: {
        id: "EXP-001",
        name: "Phone Microwave",
        description: "A microwave that can send messages to the past",
        status: "completed",
        world_line_change: 0.337192,
        creator_id: "Rintaro Okabe"
      }
    },
    {
      current_worldline: 1.698596,
      base_worldline: 1.0, 
      total_divergence: 0.698596,
      experiment_count: 2,
      timestamp: '2025-04-07T12:34:56.789Z',
      added_experiment: {
        id: "EXP-002",
        name: "Time Leap Machine",
        description: "Device that can send memories to the past",
        status: "completed",
        world_line_change: 0.361404,
        creator_id: "Kurisu Makise"
      }
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
  test('renders all main sections including the chart', async () => {
    render(<WorldlineMonitor />);
    
    // Check main title
    expect(screen.getByText('Divergence Meter')).toBeInTheDocument();
    
    // Check for all main cards
    expect(screen.getByTestId('worldline-status-card')).toBeInTheDocument();
    expect(screen.getByTestId('worldline-history-card')).toBeInTheDocument();
    expect(screen.getByTestId('worldline-chart-card')).toBeInTheDocument(); // New chart card
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
    
    // Check for chart rendering
    await waitFor(() => {
      expect(screen.getByTestId('worldline-chart')).toBeInTheDocument();
      expect(screen.getByTestId('mock-apex-chart')).toBeInTheDocument();
    });
  });

  // Test chart rendering with horizontal lines (annotations)
  test('chart displays correct data points and divergence lines', async () => {
    render(<WorldlineMonitor />);
    
    // Wait for chart to render
    await waitFor(() => {
      expect(screen.getByTestId('worldline-chart')).toBeInTheDocument();
      expect(screen.getByTestId('mock-apex-chart')).toBeInTheDocument();
    });
    
    // Check if mocked chart received correct data points count
    expect(screen.getByText('Data points: 3')).toBeInTheDocument(); // 3 points from mockWorldlineHistory
    
    // Check if horizontal lines (annotations) are present for all readings
    expect(screen.getByTestId('chart-annotations-count')).toHaveTextContent(`Annotations: ${mockDivergenceReadings.length}`);
    
    // Check if chart legend shows divergence readings
    const chartContainer = screen.getByTestId('worldline-chart');
    const legendContainer = within(chartContainer).getByText('Known Divergence Lines:').parentElement;
    
    // Instead, check that each reading's status appears in the legend
    mockDivergenceReadings.forEach(reading => {
      // Check that status name is present with colon
      expect(within(legendContainer).getByText(`${reading.status}:`)).toBeInTheDocument();
      
      // Check that reading value is present
      const formattedValue = reading.reading.toFixed(6);
      expect(within(legendContainer).getByText(formattedValue)).toBeInTheDocument();
    });
    
    // Verify we have the right number of badges (using DOM API for counting)
    const badgeElements = legendContainer.querySelectorAll('.badge');
    expect(badgeElements.length).toBe(mockDivergenceReadings.length);
  });
  
  // Test chart refresh button now using Promise.all
  test('chart refresh button triggers data reload using Promise.all', async () => {
    // Mock Promise.all to track it being called
    const originalPromiseAll = Promise.all;
    global.Promise.all = jest.fn().mockImplementation(originalPromiseAll);
    
    render(<WorldlineMonitor />);
    
    // Wait for chart to render
    await waitFor(() => {
      expect(screen.getByTestId('worldline-chart')).toBeInTheDocument();
    });
    
    // Clear mock call counts
    getWorldlineHistory.mockClear();
    getDivergenceReadings.mockClear();
    
    // Click chart refresh button
    fireEvent.click(screen.getByTestId('refresh-chart-btn'));
    
    // Check if Promise.all was called
    expect(Promise.all).toHaveBeenCalled();
    
    // Check if API calls were made to refresh chart data
    await waitFor(() => {
      expect(getWorldlineHistory).toHaveBeenCalledTimes(1);
      expect(getDivergenceReadings).toHaveBeenCalledTimes(1);
    });
    
    // Restore Promise.all
    global.Promise.all = originalPromiseAll;
  });

  // Test WebSocket updates chart with new experiment data
  test('chart updates when WebSocket messages are received with experiment data', async () => {
    render(<WorldlineMonitor />);
    
    // Wait for initial chart to render
    await waitFor(() => {
      expect(screen.getByTestId('worldline-chart')).toBeInTheDocument();
    });
    
    // Get the subscribe callback
    const subscribeCallback = worldlineSocket.subscribe.mock.calls[0][0];
    
    // Create an updated worldline status with experiment preview
    const updatedStatus = {
      ...mockWorldlineStatus,
      current_worldline: 1.432891,
      total_divergence: 0.432891,
      includes_preview: true,
      preview_experiment: {
        name: "New Experiment",
        world_line_change: 0.095699
      }
    };
    
    // Mock fetch chain for WebSocket update
    getWorldlineHistory.mockClear();
    getDivergenceReadings.mockClear();
    
    getWorldlineHistory.mockResolvedValueOnce([
      ...mockWorldlineHistory,
      {
        current_worldline: 1.432891,
        base_worldline: 1.0,
        total_divergence: 0.432891,
        experiment_count: 3,
        timestamp: '2025-04-07T12:45:00.000Z',
        added_experiment: {
          id: "EXP-003",
          name: "New Experiment",
          world_line_change: 0.095699
        }
      }
    ]);
    
    // Simulate receiving WebSocket message
    act(() => {
      subscribeCallback(updatedStatus);
    });
    
    // Check if history was refreshed for chart update
    await waitFor(() => {
      expect(getWorldlineHistory).toHaveBeenCalledTimes(1);
      expect(notyfService.info).toHaveBeenCalledWith(
        expect.stringContaining("Previewing worldline change from: New Experiment")
      );
    });
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
  
  // Test that chart shows loading state when refreshing data
  test('chart displays properly when refreshing data', async () => {
    render(<WorldlineMonitor />);
    
    // Wait for chart to render initially
    await waitFor(() => {
      expect(screen.getByTestId('worldline-chart')).toBeInTheDocument();
    });
    
    // Simulate partial data load (only one API returns quickly)
    getWorldlineHistory.mockClear();
    getDivergenceReadings.mockClear();
    
    // Make one API call take longer
    getWorldlineHistory.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return mockWorldlineHistory;
    });
    
    getDivergenceReadings.mockResolvedValue(mockDivergenceReadings);
    
    // Click refresh button
    fireEvent.click(screen.getByTestId('refresh-chart-btn'));
    
    // Now the loading state should be visible - check with waitFor to allow React to update
    await waitFor(() => {
      expect(screen.queryByTestId('loading-chart')).toBeInTheDocument();
    }, { timeout: 100 });
    
    // Wait for data to fully load and chart to reappear
    await waitFor(() => {
      expect(screen.queryByTestId('worldline-chart')).toBeInTheDocument();
    }, { timeout: 500 });
    
    // Verify both API calls completed
    expect(getWorldlineHistory).toHaveBeenCalledTimes(1);
    expect(getDivergenceReadings).toHaveBeenCalledTimes(1);
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