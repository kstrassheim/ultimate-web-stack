import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act
} from '@testing-library/react';
import '@testing-library/jest-dom';
import Experiments from './Experiments';
import { useMsal } from '@azure/msal-react';
import {
  getAllExperiments,
  getExperimentById,
  createExperiment,
  updateExperiment,
  deleteExperiment,
  experimentsSocket
} from '@/api/futureGadgetApi';
import appInsights from '@/log/appInsights';
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
  experimentsSocket: {
    connect: jest.fn(),
    subscribe: jest.fn(),
    subscribeToStatus: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn()
  }
}));

// jest.mock('@/log/appInsights', () => ({
//   trackEvent: jest.fn(),
//   trackException: jest.fn()
// }));

jest.mock('@/log/notyfService', () => ({
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warning: jest.fn()
}));

describe('Experiments Component', () => {
  const mockExperiments = [
    {
      id: 'exp-1',
      name: 'Phone Microwave',
      description: 'Send messages to the past',
      status: 'completed',
      creator_id: 'okabe'
    },
    {
      id: 'exp-2',
      name: 'Divergence Meter',
      description: 'Measures world line divergence',
      status: 'in_progress',
      creator_id: 'kurisu'
    }
  ];

  const mockInstance = {
    getActiveAccount: jest.fn().mockReturnValue({
      username: 'okabe.rintaro@future-gadget-lab.org'
    })
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useMsal.mockReturnValue({ instance: mockInstance });
    getAllExperiments.mockResolvedValue(mockExperiments);
    // WebSocket handling
    experimentsSocket.subscribe.mockImplementation(callback => {
      experimentsSocket.messageHandler = callback;
      return jest.fn();
    });
    experimentsSocket.subscribeToStatus.mockImplementation(callback => {
      callback('connected');
      experimentsSocket.statusHandler = callback;
      return jest.fn();
    });
  });

  test('shows a loading indicator initially then renders experiments', async () => {
    // Delay the API call
    getAllExperiments.mockImplementation(
      () =>
        new Promise(resolve => setTimeout(() => resolve(mockExperiments), 100))
    );

    render(<Experiments />);

    // Check for some text inside a region with a landmark (e.g. table)
    expect(screen.getByRole('status')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    // Verify experiment names appear
    expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    expect(screen.getByText('Divergence Meter')).toBeInTheDocument();
  });

  test('displays error message when API fails', async () => {
    const errorMessage = 'Failed to load experiments';
    getAllExperiments.mockRejectedValue(new Error(errorMessage));
    
    // Make sure we have a proper mock for trackException
    jest.spyOn(appInsights, 'trackException').mockImplementation(() => {});
    
    render(<Experiments />);

    await waitFor(() => {
      expect(
        screen.getByText(new RegExp(`Failed to load experiments: ${errorMessage}`, 'i'))
      ).toBeInTheDocument();
    });
    expect(notyfService.error).toHaveBeenCalled();
    expect(appInsights.trackException).toHaveBeenCalled();
  });

  test('reacts to a WebSocket create message', async () => {
    render(<Experiments />);
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });

    expect(experimentsSocket.connect).toHaveBeenCalledWith(mockInstance);

    const newExperiment = {
      id: 'exp-3',
      name: 'Time Leap Machine',
      status: 'planned'
    };

    act(() => {
      experimentsSocket.messageHandler({
        rawData: {
          type: 'create',
          data: newExperiment
        }
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Time Leap Machine')).toBeInTheDocument();
    });
    expect(notyfService.info).toHaveBeenCalledWith(
      'New experiment created by another user'
    );
  });

  test('opens the create form and submits a new experiment', async () => {
    render(<Experiments />);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /new experiment/i })).toHaveLength(1);
    });

    // Click the "New Experiment" button using role/button name
    fireEvent.click(screen.getByRole('button', { name: /new experiment/i }));

    // Modal should appear with a heading "Create New Experiment"
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /create new experiment/i })).toBeInTheDocument();
    });

    // Fill in the form using label queries
    fireEvent.change(screen.getByLabelText(/experiment name/i), {
      target: { value: 'Upa Transmitter' }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Transforms regular Upas into Metal Upas' }
    });

    // Mock success for API create call
    createExperiment.mockResolvedValue({ id: 'exp-4', name: 'Upa Transmitter' });

    // Submit the form by clicking the submit button (assuming it has accessible text)
    fireEvent.click(screen.getByRole('button', {
      name: /create experiment/i
    }));

    await waitFor(() => {
      expect(createExperiment).toHaveBeenCalled();
      const callArgs = createExperiment.mock.calls[0][1];
      expect(callArgs).toMatchObject({
        name: 'Upa Transmitter',
        description: 'Transforms regular Upas into Metal Upas'
      });
    });
    expect(notyfService.success).toHaveBeenCalledWith('Experiment created successfully');
    // Ensure getAllExperiments is re-called to refresh the list
    expect(getAllExperiments).toHaveBeenCalledTimes(2);
  });

  test('opens delete confirmation and deletes an experiment', async () => {
    render(<Experiments />);
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });

    deleteExperiment.mockResolvedValue({ success: true });

    // Assume there are two Delete buttons; select by role and accessible name
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
    });

    // Confirm deletion by clicking the button maybe labeled "Delete Experiment"
    fireEvent.click(screen.getByRole('button', { name: /delete experiment/i }));

    await waitFor(() => {
      expect(deleteExperiment).toHaveBeenCalledWith(mockInstance, 'exp-1');
    });
    expect(notyfService.success).toHaveBeenCalledWith('Experiment deleted successfully');
    expect(getAllExperiments).toHaveBeenCalledTimes(2);
  });

  test('updates and displays WebSocket connection status', async () => {
    render(<Experiments />);
    expect(screen.getByText(/connected/i)).toBeInTheDocument();

    act(() => {
      experimentsSocket.statusHandler('disconnected');
    });
    await waitFor(() => {
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    });
  });

  test('disconnects from WebSocket when unmounting', async () => {
    const { unmount } = render(<Experiments />);
    await waitFor(() => {
      expect(experimentsSocket.connect).toHaveBeenCalled();
    });
    unmount();
    expect(experimentsSocket.disconnect).toHaveBeenCalled();
  });

  test('handles error when creating a new experiment', async () => {
    render(<Experiments />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new experiment/i })).toBeInTheDocument();
    });

    // Click the "New Experiment" button
    fireEvent.click(screen.getByRole('button', { name: /new experiment/i }));

    // Fill the form
    fireEvent.change(screen.getByLabelText(/experiment name/i), {
      target: { value: 'Failed Test Experiment' }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'This experiment will fail' }
    });

    // Mock an API error
    const errorMessage = 'API Error: Failed to create';
    createExperiment.mockRejectedValue(new Error(errorMessage));

    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /create experiment/i }));

    await waitFor(() => {
      expect(notyfService.error).toHaveBeenCalledWith(`Failed to create experiment: ${errorMessage}`);
    });
  });

  test('opens edit form and updates an experiment', async () => {
    // Mock the fetch by ID API call
    const experimentDetail = { 
      ...mockExperiments[0],
      collaborators: ['daru', 'mayuri']
    };
    getExperimentById.mockResolvedValue(experimentDetail);
    updateExperiment.mockResolvedValue({ success: true });

    render(<Experiments />);
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });

    // Click the edit button for the first experiment
    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    fireEvent.click(editButtons[0]);

    // Wait for the edit modal
    await waitFor(() => {
      expect(screen.getByText(/edit experiment/i)).toBeInTheDocument();
    });

    // Check that form is pre-filled
    expect(screen.getByLabelText(/experiment name/i).value).toBe('Phone Microwave');
    expect(screen.getByLabelText(/description/i).value).toBe('Send messages to the past');
    expect(screen.getByLabelText(/collaborators/i).value).toBe('daru, mayuri');

    // Update the experiment
    fireEvent.change(screen.getByLabelText(/experiment name/i), {
      target: { value: 'Phone Microwave (Temporary Name)' }
    });
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /update experiment/i }));

    // Verify the update was called
    await waitFor(() => {
      expect(updateExperiment).toHaveBeenCalledWith(
        mockInstance, 
        'exp-1', 
        expect.objectContaining({
          name: 'Phone Microwave (Temporary Name)',
          description: 'Send messages to the past'
        })
      );
    });

    expect(notyfService.success).toHaveBeenCalledWith('Experiment updated successfully');
    expect(getAllExperiments).toHaveBeenCalledTimes(2);
  });

  test('handles error when updating an experiment', async () => {
    // Mock the fetch by ID API call
    getExperimentById.mockResolvedValue(mockExperiments[0]);
    const errorMessage = 'API Error: Failed to update';
    updateExperiment.mockRejectedValue(new Error(errorMessage));

    render(<Experiments />);
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });

    // Click the edit button
    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    fireEvent.click(editButtons[0]);

    // Wait for the edit modal
    await waitFor(() => {
      expect(screen.getByLabelText(/experiment name/i)).toBeInTheDocument();
    });

    // Submit the form without changes
    fireEvent.click(screen.getByRole('button', { name: /update experiment/i }));

    // Verify error handling
    await waitFor(() => {
      expect(notyfService.error).toHaveBeenCalledWith(`Failed to update experiment: ${errorMessage}`);
    });
  });

  test('handles error when fetching experiment details', async () => {
    // Mock error response for getExperimentById
    const errorMessage = 'Failed to fetch experiment';
    getExperimentById.mockRejectedValue(new Error(errorMessage));

    render(<Experiments />);
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });

    // Click edit button
    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    fireEvent.click(editButtons[0]);

    // Verify error notification appeared
    await waitFor(() => {
      expect(notyfService.error).toHaveBeenCalledWith(
        expect.stringContaining(errorMessage)
      );
    });
    
    // Modal should not appear
    expect(screen.queryByText(/edit experiment/i)).not.toBeInTheDocument();
  });

  test('handles error when deleting an experiment', async () => {
    const errorMessage = 'API Error: Failed to delete';
    deleteExperiment.mockRejectedValue(new Error(errorMessage));

    render(<Experiments />);
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });

    // Click the delete button
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]);

    // Confirm deletion
    await waitFor(() => {
      expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /delete experiment/i }));

    // Verify error handling
    await waitFor(() => {
      expect(notyfService.error).toHaveBeenCalledWith(`Failed to delete experiment: ${errorMessage}`);
    });
  });

  test('form validation prevents submission of invalid data', async () => {
    // Make sure the initial fetch completes successfully
    getAllExperiments.mockResolvedValue(mockExperiments);
    
    render(<Experiments />);
    
    // First wait for the initial loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
    });
    
    // Click the "New Experiment" button 
    fireEvent.click(screen.getByRole('button', { name: /new experiment/i }));
    
    // Wait for the modal to appear
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /create new experiment/i })).toBeInTheDocument();
    });
    
    // Wait for the form to be visible and accessible
    const form = await screen.findByTestId('experiment-form-element');
    expect(form).toBeInTheDocument();
    
    // Submit without filling required fields
    const submitButton = screen.getByRole('button', { name: /create experiment/i });
    fireEvent.click(submitButton);
    
    // Should not call the API
    expect(createExperiment).not.toHaveBeenCalled();
    
    // Should display validation feedback
    expect(screen.getByText('Please provide an experiment name.')).toBeInTheDocument();
    expect(screen.getByText('Please provide a description.')).toBeInTheDocument();
  });

  test('handles collaborative form updates correctly', async () => {
    // Mock successful response first so loading completes
    createExperiment.mockResolvedValue({ id: 'collab-1' });
    
    render(<Experiments />);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
    });
    
    // Open create form
    fireEvent.click(screen.getByRole('button', { name: /new experiment/i }));
    
    // Wait for the modal to be visible
    await waitFor(() => {
      expect(screen.getByTestId('experiment-form-element')).toBeInTheDocument();
    });
    
    // Now fill the form when it's accessible
    fireEvent.change(screen.getByLabelText(/experiment name/i), { 
      target: { value: 'Collaborative Experiment' } 
    });
    
    fireEvent.change(screen.getByLabelText(/description/i), { 
      target: { value: 'Testing collaborators' } 
    });
    
    // Add collaborators
    fireEvent.change(screen.getByLabelText(/collaborators/i), { 
      target: { value: 'daru, mayuri, suzuha' } 
    });
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /create experiment/i }));
    
    // Verify collaborators were processed correctly
    await waitFor(() => {
      expect(createExperiment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          collaborators: ['daru', 'mayuri', 'suzuha']
        })
      );
    });
  });

  test('displays empty state when no experiments exist', async () => {
    // Override the mock to return empty array
    getAllExperiments.mockResolvedValue([]);
    
    render(<Experiments />);
    
    await waitFor(() => {
      expect(screen.getByTestId('no-experiments')).toBeInTheDocument();
      expect(screen.getByText('No experiments found.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create your first experiment/i })).toBeInTheDocument();
    });
    
    // Click the create button in empty state
    fireEvent.click(screen.getByRole('button', { name: /create your first experiment/i }));
    
    // Modal should appear
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /create new experiment/i })).toBeInTheDocument();
    });
  });

  test('reacts to WebSocket update message', async () => {
    render(<Experiments />);
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });

    // Simulate an update message from WebSocket
    const updatedExperiment = {
      ...mockExperiments[0],
      name: 'Updated Phone Microwave',
      status: 'failed'
    };

    act(() => {
      experimentsSocket.messageHandler({
        rawData: {
          type: 'update',
          data: updatedExperiment
        }
      });
    });
    
    // Check that UI was updated
    await waitFor(() => {
      expect(screen.getByText('Updated Phone Microwave')).toBeInTheDocument();
    });
    expect(notyfService.info).toHaveBeenCalledWith(
      'An experiment was updated by another user'
    );
  });

  test('reacts to WebSocket delete message', async () => {
    render(<Experiments />);
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });

    // Simulate a delete message from WebSocket
    act(() => {
      experimentsSocket.messageHandler({
        rawData: {
          type: 'delete',
          data: { id: 'exp-1' }
        }
      });
    });
    
    // Check that item was removed
    await waitFor(() => {
      expect(screen.queryByText('Phone Microwave')).not.toBeInTheDocument();
    });
    expect(notyfService.info).toHaveBeenCalledWith(
      'An experiment was deleted by another user'
    );
  });

  test('shows reload button functionality', async () => {
    render(<Experiments />);
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });
    
    // Clear previous calls
    getAllExperiments.mockClear();
    
    // Update the mock to return different data on reload
    const updatedExperiments = [
      ...mockExperiments,
      {
        id: 'exp-3',
        name: 'Reloaded Experiment',
        description: 'This appeared after reload',
        status: 'planned',
        creator_id: 'okabe'
      }
    ];
    getAllExperiments.mockResolvedValue(updatedExperiments);
    
    // Click reload button
    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    
    // Check that API was called again
    expect(getAllExperiments).toHaveBeenCalled();
    
    // Check that new data appears
    await waitFor(() => {
      expect(screen.getByText('Reloaded Experiment')).toBeInTheDocument();
    });
  });

  test('handles invalid WebSocket message gracefully', async () => {
    // Capture the subscribe callback for manual testing
    let messageCallback;
    let statusCallback;
    
    experimentsSocket.subscribe.mockImplementation(callback => {
      messageCallback = callback;
      return jest.fn();
    });
    
    experimentsSocket.subscribeToStatus.mockImplementation(callback => {
      statusCallback = callback;
      return jest.fn();
    });
    
    const { unmount } = render(<Experiments />);
    await waitFor(() => {
      expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    });

    // Test edge case: undefined message
    act(() => {
      messageCallback(undefined);
    });
    
    // Test edge case: message with no rawData
    act(() => {
      messageCallback({
        someOtherProperty: 'value'
      });
    });
    
    // Test edge case: message with rawData but missing type
    act(() => {
      messageCallback({
        rawData: {
          data: { id: 'exp-999' }
        }
      });
    });
    
    // Test edge case: message with unknown type
    act(() => {
      messageCallback({
        rawData: {
          type: 'unknown_type',
          data: { id: 'exp-999' }
        }
      });
    });
    
    // Test edge case: null data
    act(() => {
      messageCallback({
        rawData: {
          type: 'create',
          data: null
        }
      });
    });
    
    // Test edge case: undefined data
    act(() => {
      messageCallback({
        rawData: {
          type: 'update',
          data: undefined
        }
      });
    });
    
    // Test edge case: data missing ID
    act(() => {
      messageCallback({
        rawData: {
          type: 'delete',
          data: { name: 'Missing ID Experiment' }
        }
      });
    });
    
    // Send null for status
    act(() => {
      statusCallback(null);
    });
    
    // Send undefined for status
    act(() => {
      statusCallback(undefined);
    });
    
    // The component should not crash, and the UI should remain intact
    expect(screen.getByText('Phone Microwave')).toBeInTheDocument();
    expect(screen.getByText('Divergence Meter')).toBeInTheDocument();
    
    // Unmount to exercise cleanup
    unmount();
  });

  test('renders all possible status badge colors', async () => {
    // Override mock to include experiments with different statuses
    const allStatusExperiments = [
      { id: 'exp-planned', name: 'Planned Experiment', status: 'planned', creator_id: 'okabe' },
      { id: 'exp-progress', name: 'In Progress Experiment', status: 'in_progress', creator_id: 'okabe' },
      { id: 'exp-completed', name: 'Completed Experiment', status: 'completed', creator_id: 'okabe' },
      { id: 'exp-failed', name: 'Failed Experiment', status: 'failed', creator_id: 'okabe' },
      { id: 'exp-abandoned', name: 'Abandoned Experiment', status: 'abandoned', creator_id: 'okabe' },
      { id: 'exp-unknown', name: 'Unknown Status Experiment', status: 'some_unknown_status', creator_id: 'okabe' }
    ];
    
    getAllExperiments.mockResolvedValue(allStatusExperiments);
    
    render(<Experiments />);
    
    // Wait for all experiments to render
    await waitFor(() => {
      expect(screen.getByText('Unknown Status Experiment')).toBeInTheDocument();
    });
    
    // Verify each status has appropriate badge
    const badges = screen.getAllByTestId('experiment-status');
    
    // Check badge colors by examining their classes
    const badgeClasses = badges.map(badge => {
      return Array.from(badge.classList)
        .find(cls => cls.startsWith('bg-'))
        ?.replace('bg-', '');
    });
    
    // Verify all status colors are rendered
    expect(badgeClasses).toContain('info');       // planned
    expect(badgeClasses).toContain('primary');    // in_progress  
    expect(badgeClasses).toContain('success');    // completed
    expect(badgeClasses).toContain('danger');     // failed
    expect(badgeClasses).toContain('secondary');  // abandoned
    expect(badgeClasses).toContain('light');      // unknown status
  });
});