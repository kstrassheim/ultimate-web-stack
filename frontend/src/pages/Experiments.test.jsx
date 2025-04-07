import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Experiments from './Experiments';
import { 
  getAllExperiments, 
  createExperiment, 
  updateExperiment, 
  deleteExperiment,
  experimentsSocket,
  formatExperimentTimestamp,
  formatWorldLineChange
} from '@/api/futureGadgetApi';
import { useMsal } from '@azure/msal-react';
import notyfService from '@/log/notyfService';

// Mock dependencies
jest.mock('@azure/msal-react', () => ({
  useMsal: jest.fn()
}));

jest.mock('@/api/futureGadgetApi', () => ({
  getAllExperiments: jest.fn(),
  getExperimentById: jest.fn(),
  createExperiment: jest.fn(),
  updateExperiment: jest.fn(),
  deleteExperiment: jest.fn(),
  formatExperimentTimestamp: jest.fn(),
  formatWorldLineChange: jest.fn(),
  experimentsSocket: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(() => jest.fn()), // Returns unsubscribe function
    subscribeToStatus: jest.fn(() => jest.fn())
  }
}));

jest.mock('@/log/notyfService', () => ({
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
}));

jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn()
}));

describe('Experiments Component', () => {
  // Setup mock data
  const mockExperiments = [
    {
      id: 'exp-1',
      name: 'Phone Microwave',
      description: 'Send messages to the past',
      status: 'completed',
      creator_id: 'okabe',
      world_line_change: 0.337192,
      timestamp: '2025-04-07T14:00:00Z'
    },
    {
      id: 'exp-2',
      name: 'Divergence Meter',
      description: 'Measures world line divergence',
      status: 'in_progress',
      creator_id: 'kurisu',
      world_line_change: 0.571024,
      timestamp: '2025-04-06T12:30:00Z'
    }
  ];

  // Common setup before each test
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock useMsal hook
    useMsal.mockImplementation(() => ({
      instance: {
        getActiveAccount: () => ({ username: 'okabe.rintaro@future-gadget-lab.org' }),
        setActiveAccount: jest.fn(),
      }
    }));
    
    // Mock API functions
    getAllExperiments.mockResolvedValue(mockExperiments);
    formatExperimentTimestamp.mockImplementation(exp => {
      if (exp.id === 'exp-1') return '7.4.2025, 14:00:00';
      if (exp.id === 'exp-2') return '6.4.2025, 12:30:00';
      return 'Unknown';
    });
    formatWorldLineChange.mockImplementation(change => {
      if (change === 0.337192) return '0.337192';
      if (change === 0.571024) return '0.571024';
      return '0.000000';
    });
    
    // Mock WebSocket
    experimentsSocket.subscribeToStatus.mockImplementation(callback => {
      // Immediately call with connected status
      callback('connected');
      return jest.fn(); // Return unsubscribe function
    });
  });

  it('shows a loading indicator initially then renders experiments with world line and timestamp columns', async () => {
    render(<Experiments />);
    
    // Check for loading indicator
    expect(screen.getByText('Processing experiment data...')).toBeInTheDocument();
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Future Gadget Lab Experiments')).toBeInTheDocument();
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
      expect(screen.getByText('Divergence Meter')).toBeInTheDocument();
    });
    
    // Check for timestamp and world line columns
    expect(screen.getByText('7.4.2025, 14:00:00')).toBeInTheDocument();
    expect(screen.getByText('0.337192')).toBeInTheDocument();
    expect(screen.getByText('0.571024')).toBeInTheDocument();
  });

  it('opens the create form with world line and timestamp fields', async () => {
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByText('Future Gadget Lab Experiments')).toBeInTheDocument();
    });
    
    // Click new experiment button
    fireEvent.click(screen.getByTestId('new-experiment-btn'));
    
    // Check form is shown with world line and timestamp fields
    expect(screen.getByTestId('experiment-form-title')).toHaveTextContent('Create New Experiment');
    expect(screen.getByLabelText(/world line change/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/timestamp/i)).toBeInTheDocument();
    
    // Verify the Now button is present for timestamp
    expect(screen.getByTitle('Set current time')).toBeInTheDocument();
  });

  it('creates an experiment with world line change value', async () => {
    createExperiment.mockResolvedValue({
      id: 'new-exp-1',
      name: 'Test Experiment',
      world_line_change: 0.123456
    });
    
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByText('Future Gadget Lab Experiments')).toBeInTheDocument();
    });
    
    // Click new experiment button
    fireEvent.click(screen.getByTestId('new-experiment-btn'));
    
    // Fill the form
    fireEvent.change(screen.getByLabelText(/experiment name/i), {
      target: { value: 'Test Experiment' }
    });
    
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Test description' }
    });
    
    fireEvent.change(screen.getByLabelText(/world line change/i), {
      target: { value: '0.123456' }
    });
    
    // Submit the form
    fireEvent.click(screen.getByTestId('experiment-form-submit'));
    
    // Wait for API call
    await waitFor(() => {
      expect(createExperiment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Test Experiment',
          description: 'Test description',
          world_line_change: '0.123456'
        })
      );
    });
    
    // Check success notification
    expect(notyfService.success).toHaveBeenCalledWith('Experiment created successfully');
  });

  it('edits an experiment with world line change but timestamp remains read-only', async () => {
    // Mock getExperimentById to return a specific experiment
    const mockExperiment = {
      id: 'exp-1',
      name: 'Phone Microwave',
      description: 'Send messages to the past',
      status: 'completed',
      creator_id: 'okabe',
      world_line_change: 0.337192,
      timestamp: '2025-04-07T14:00:00Z'
    };
    
    const updatedExperiment = {
      ...mockExperiment,
      name: 'Updated Phone Microwave',
      world_line_change: 0.409431
    };
    
    const { getExperimentById } = require('@/api/futureGadgetApi');
    getExperimentById.mockResolvedValue(mockExperiment);
    updateExperiment.mockResolvedValue(updatedExperiment);
    
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByText('Future Gadget Lab Experiments')).toBeInTheDocument();
    });
    
    // Click edit button for the first experiment
    fireEvent.click(screen.getByTestId('edit-btn-exp-1'));
    
    await waitFor(() => {
      expect(screen.getByTestId('experiment-form-title')).toHaveTextContent('Edit Experiment');
    });
    
    // Verify the timestamp field is disabled
    expect(screen.getByLabelText(/timestamp/i)).toBeDisabled();
    
    // Update world line change
    fireEvent.change(screen.getByLabelText(/world line change/i), {
      target: { value: '0.409431' }
    });
    
    // Update name
    fireEvent.change(screen.getByLabelText(/experiment name/i), {
      target: { value: 'Updated Phone Microwave' }
    });
    
    // Submit the form
    fireEvent.click(screen.getByTestId('experiment-form-submit'));
    
    // Wait for API call
    await waitFor(() => {
      expect(updateExperiment).toHaveBeenCalledWith(
        expect.anything(), // The MSAL instance
        'exp-1',
        expect.objectContaining({
          name: 'Updated Phone Microwave',
          world_line_change: '0.409431'
        })
      );
    });
  });

  it('displays formatted world line value in table', async () => {
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByText('Future Gadget Lab Experiments')).toBeInTheDocument();
    });
    
    // Verify the formatWorldLineChange was called with correct values
    expect(formatWorldLineChange).toHaveBeenCalledWith(0.337192);
    expect(formatWorldLineChange).toHaveBeenCalledWith(0.571024);
    
    // Check formatted values in the table
    const worldLineValues = screen.getAllByTestId('experiment-worldline');
    expect(worldLineValues[0]).toHaveTextContent('0.337192');
    expect(worldLineValues[1]).toHaveTextContent('0.571024');
  });

  it('displays formatted timestamp in table', async () => {
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByText('Future Gadget Lab Experiments')).toBeInTheDocument();
    });
    
    // Verify formatExperimentTimestamp was called with correct experiments
    expect(formatExperimentTimestamp).toHaveBeenCalledWith(expect.objectContaining({
      id: 'exp-1',
      timestamp: '2025-04-07T14:00:00Z'
    }));
    
    // Check formatted values in the table
    const timestampValues = screen.getAllByTestId('experiment-timestamp');
    expect(timestampValues[0]).toHaveTextContent('7.4.2025, 14:00:00');
    expect(timestampValues[1]).toHaveTextContent('6.4.2025, 12:30:00');
  });

  it('handles WebSocket update with world line change data', async () => {
    // Set up WebSocket message handler
    let messageHandler;
    experimentsSocket.subscribe.mockImplementation(handler => {
      messageHandler = handler;
      return jest.fn(); // Return unsubscribe function
    });
    
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });
    
    // Simulate WebSocket message with updated experiment
    act(() => {
      messageHandler({
        rawData: {
          type: 'update',
          data: {
            id: 'exp-1',
            name: 'Phone Microwave (Modified)',
            description: 'Send messages to the past - updated',
            status: 'completed',
            creator_id: 'okabe',
            world_line_change: 0.422761,
            timestamp: '2025-04-07T14:00:00Z'
          }
        }
      });
    });
    
    // Verify UI updates
    expect(screen.getByText('Phone Microwave (Modified)')).toBeInTheDocument();
    expect(notyfService.info).toHaveBeenCalledWith('An experiment was updated by another user');
  });

  it('displays error message when API fails', async () => {
    // Mock API to throw error
    getAllExperiments.mockRejectedValue(new Error('Network error'));
    
    render(<Experiments />);
    
    // Wait for error message
    await waitFor(() => {
      expect(screen.getByTestId('experiments-error')).toHaveTextContent('Failed to load experiments: Network error');
    });
    
    // Verify error notification
    expect(notyfService.error).toHaveBeenCalledWith('Failed to load experiments: Network error');
  });

  it('reacts to a WebSocket create message', async () => {
    // Set up WebSocket message handler
    let messageHandler;
    experimentsSocket.subscribe.mockImplementation(handler => {
      messageHandler = handler;
      return jest.fn(); // Return unsubscribe function
    });
    
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });
    
    // Simulate WebSocket message with new experiment
    act(() => {
      messageHandler({
        rawData: {
          type: 'create',
          data: {
            id: 'exp-3',
            name: 'Time Leap Machine',
            description: 'Send memories to the past',
            status: 'planned',
            creator_id: 'kurisu',
            world_line_change: 0.523299,
            timestamp: '2025-04-08T09:30:00Z'
          }
        }
      });
    });
    
    // Verify UI updates
    expect(screen.getByText('Time Leap Machine')).toBeInTheDocument();
    expect(notyfService.info).toHaveBeenCalledWith('New experiment created by another user');
  });

  it('opens delete confirmation and deletes an experiment', async () => {
    deleteExperiment.mockResolvedValue({ message: 'Successfully deleted' });
    
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });
    
    // Click delete button
    fireEvent.click(screen.getByTestId('delete-btn-exp-1'));
    
    // Verify delete confirmation is shown - use a regex to match partial text
    expect(screen.getByText(/Are you sure you want to delete the experiment/)).toBeInTheDocument();
    expect(screen.getByTestId('delete-experiment-name')).toHaveTextContent('Phone Microwave');
    
    // Confirm delete
    fireEvent.click(screen.getByTestId('confirm-delete-btn'));
    
    // Wait for API call
    await waitFor(() => {
      expect(deleteExperiment).toHaveBeenCalledWith(expect.anything(), 'exp-1');
    });
    
    // Verify success notification
    expect(notyfService.success).toHaveBeenCalledWith('Experiment deleted successfully');
  });

  it('handles WebSocket message edge cases with new fields', async () => {
    // Set up WebSocket message handler
    let messageHandler;
    experimentsSocket.subscribe.mockImplementation(handler => {
      messageHandler = handler;
      return jest.fn(); // Return unsubscribe function
    });
    
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });
    
    // Test missing type
    act(() => {
      messageHandler({
        rawData: {
          data: { id: 'test' }
        }
      });
    });
    
    // Test missing data
    act(() => {
      messageHandler({
        rawData: {
          type: 'update'
        }
      });
    });
    
    // Test missing ID in data for update
    act(() => {
      messageHandler({
        rawData: {
          type: 'update',
          data: { name: 'No ID' }
        }
      });
    });
    
    // These should not throw errors and should not affect the UI
    expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    expect(screen.queryByText('No ID')).not.toBeInTheDocument();
  });

  it('validates ISO date format for timestamps', async () => {
    createExperiment.mockResolvedValue({ id: 'test-123', name: 'Date Validation Test' });
    
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByText('Future Gadget Lab Experiments')).toBeInTheDocument();
    });
    
    // Open the create form
    fireEvent.click(screen.getByTestId('new-experiment-btn'));
    
    // Fill required fields
    fireEvent.change(screen.getByLabelText(/experiment name/i), {
      target: { value: 'Date Validation Test' }
    });
    
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Testing timestamp validation' }
    });
    
    // Try an invalid date format
    fireEvent.change(screen.getByLabelText(/timestamp/i), {
      target: { value: '2025-04-07 12:34:56' } // Space instead of T
    });
    
    // Submit the form - should show validation error
    fireEvent.click(screen.getByTestId('experiment-form-submit'));
    
    // Check for validation error
    expect(screen.getByText('Please enter a valid ISO date format')).toBeInTheDocument();
    
    // Now try with valid format
    fireEvent.change(screen.getByLabelText(/timestamp/i), {
      target: { value: '2025-04-07T12:34:56.789Z' }
    });
    
    // Submit the form again
    fireEvent.click(screen.getByTestId('experiment-form-submit'));
    
    // Should call API with valid data
    await waitFor(() => {
      expect(createExperiment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Date Validation Test',
          timestamp: '2025-04-07T12:34:56.789Z'
        })
      );
    });
  });

  it('allows setting the current timestamp with Now button', async () => {
    // Mock Date.now() and toISOString()
    const originalDate = global.Date;
    const mockDate = new Date('2025-04-07T09:30:00.000Z');
    global.Date = jest.fn(() => mockDate);
    global.Date.prototype = originalDate.prototype;
    
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByText('Future Gadget Lab Experiments')).toBeInTheDocument();
    });
    
    // Open create form
    fireEvent.click(screen.getByTestId('new-experiment-btn'));
    
    // Click the Now button
    fireEvent.click(screen.getByTitle('Set current time'));
    
    // Check that timestamp field has current date in ISO format
    expect(screen.getByLabelText(/timestamp/i)).toHaveValue('2025-04-07T09:30:00.000Z');
    
    // Restore original Date
    global.Date = originalDate;
  });

  it('disables timestamp field in edit mode', async () => {
    // Mock getExperimentById
    const mockExperiment = {
      id: 'exp-1',
      name: 'Phone Microwave',
      timestamp: '2025-04-07T14:00:00Z'
    };
    
    const { getExperimentById } = require('@/api/futureGadgetApi');
    getExperimentById.mockResolvedValue(mockExperiment);
    
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByText('Future Gadget Lab Experiments')).toBeInTheDocument();
    });
    
    // Click edit button
    fireEvent.click(screen.getByTestId('edit-btn-exp-1'));
    
    await waitFor(() => {
      expect(screen.getByTestId('experiment-form-title')).toHaveTextContent('Edit Experiment');
    });
    
    // Verify timestamp field is disabled
    const timestampField = screen.getByLabelText(/timestamp/i);
    expect(timestampField).toBeDisabled();
    
    // Verify Now button is not shown in edit mode
    expect(screen.queryByTitle('Set current time')).not.toBeInTheDocument();
  });
});