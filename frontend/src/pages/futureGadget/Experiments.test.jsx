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
});