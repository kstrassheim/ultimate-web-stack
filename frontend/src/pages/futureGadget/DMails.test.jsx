import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act
} from '@testing-library/react';
import '@testing-library/jest-dom';
import DMails from './DMails';
import { useMsal } from '@azure/msal-react';
import {
  getAllDMails,
  getDMailById,
  createDMail,
  updateDMail,
  deleteDMail,
  dMailsSocket
} from '@/api/futureGadgetApi';
import appInsights from '@/log/appInsights';
import notyfService from '@/log/notyfService';

// Mock dependencies
jest.mock('@azure/msal-react', () => ({
  useMsal: jest.fn()
}));

jest.mock('@/api/futureGadgetApi', () => ({
  getAllDMails: jest.fn(),
  getDMailById: jest.fn(),
  createDMail: jest.fn(),
  updateDMail: jest.fn(),
  deleteDMail: jest.fn(),
  dMailsSocket: {
    connect: jest.fn(),
    subscribe: jest.fn(),
    subscribeToStatus: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn()
  }
}));

// Fix the notyfService mock - this is the important change
jest.mock('@/log/notyfService', () => ({
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warning: jest.fn()
}));

describe('DMails Component', () => {
  const mockMails = [
    {
      id: 'dmail-1',
      subject: 'Lottery Numbers',
      content: 'Buy ticket with numbers 03, 07, 10, 26, 41, 42',
      sender: 'okabe.rintaro@future-gadget-lab.org',
      recipient: 'past-self@future-gadget-lab.org',
      worldLineOrigin: '1.130426',
      worldLineDestination: '1.048596',
      divergence: 0.081830,
      status: 'sent'
    },
    {
      id: 'dmail-2',
      subject: 'IBN 5100 Location',
      content: 'Check Yanabayashi Shrine for the IBN 5100',
      sender: 'suzuha.amane@future-gadget-lab.org',
      recipient: 'okabe.rintaro@future-gadget-lab.org',
      worldLineOrigin: '1.130205',
      worldLineDestination: '1.130426',
      divergence: 0.000221,
      status: 'received'
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
    getAllDMails.mockResolvedValue(mockMails);
    
    // WebSocket handling
    dMailsSocket.subscribe.mockImplementation(callback => {
      dMailsSocket.messageHandler = callback;
      return jest.fn();
    });
    
    dMailsSocket.subscribeToStatus.mockImplementation(callback => {
      callback('connected');
      dMailsSocket.statusHandler = callback;
      return jest.fn();
    });
  });

  test('shows a loading indicator initially then renders mails', async () => {
    // Delay the API call
    getAllDMails.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockMails), 100))
    );

    render(<DMails />);

    // Check for loading indicator
    expect(screen.getByRole('status')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    
    // Verify mail subjects appear
    expect(screen.getByText('Lottery Numbers')).toBeInTheDocument();
    expect(screen.getByText('IBN 5100 Location')).toBeInTheDocument();
  });

  test('displays error message when API fails', async () => {
    const errorMessage = 'Failed to load D-Mails';
    getAllDMails.mockRejectedValue(new Error(errorMessage));
    
    // Make sure we have a proper mock for trackException
    jest.spyOn(appInsights, 'trackException').mockImplementation(() => {});
    
    render(<DMails />);

    await waitFor(() => {
      expect(
        screen.getByText(new RegExp(`Failed to load D-Mails: ${errorMessage}`, 'i'))
      ).toBeInTheDocument();
    });
    
    expect(notyfService.error).toHaveBeenCalled();
    expect(appInsights.trackException).toHaveBeenCalled();
  });

  test('reacts to a WebSocket create message', async () => {
    render(<DMails />);
    
    await waitFor(() => {
      expect(screen.getByText('Lottery Numbers')).toBeInTheDocument();
    });

    expect(dMailsSocket.connect).toHaveBeenCalledWith(mockInstance);

    const newMail = {
      id: 'dmail-3',
      subject: 'Warning about SERN',
      sender: 'faris@future-gadget-lab.org',
      recipient: 'okabe.rintaro@future-gadget-lab.org',
      status: 'sending'
    };

    act(() => {
      dMailsSocket.messageHandler({
        rawData: {
          type: 'create',
          data: newMail
        }
      });
    });
    
    await waitFor(() => {
      expect(screen.getByText('Warning about SERN')).toBeInTheDocument();
    });
    
    expect(notyfService.info).toHaveBeenCalledWith('New D-Mail received');
  });

  test('opens the send form and submits a new mail', async () => {
    render(<DMails />);
    
    await waitFor(() => {
      expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
    });

    // Click the "Send New D-Mail" button
    fireEvent.click(screen.getByTestId('new-dmail-btn'));

    // Modal should appear with a heading "Send New D-Mail"
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /send new d-mail/i })).toBeInTheDocument();
    });

    // Wait for the form to be visible
    await waitFor(() => {
      expect(screen.getByTestId('dmail-form-element')).toBeInTheDocument();
    });

    // Fill in the form
    fireEvent.change(screen.getByLabelText(/subject/i), {
      target: { value: 'Test D-Mail' }
    });
    
    fireEvent.change(screen.getByLabelText(/content/i), {
      target: { value: 'This is a test message' }
    });
    
    fireEvent.change(screen.getByLabelText(/recipient/i), {
      target: { value: 'test@example.com' }
    });
    
    fireEvent.change(screen.getByLabelText(/worldline origin/i), {
      target: { value: '1.048596' }
    });

    // Mock success for API create call
    createDMail.mockResolvedValue({ id: 'dmail-4', subject: 'Test D-Mail' });

    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /send d-mail/i }));

    await waitFor(() => {
      expect(createDMail).toHaveBeenCalled();
      const callArgs = createDMail.mock.calls[0][1];
      expect(callArgs).toMatchObject({
        subject: 'Test D-Mail',
        content: 'This is a test message',
        recipient: 'test@example.com'
      });
    });
    
    expect(notyfService.success).toHaveBeenCalledWith('D-Mail sent successfully');
    expect(getAllDMails).toHaveBeenCalledTimes(2);
  });

  test('opens delete confirmation and deletes a mail', async () => {
    render(<DMails />);
    
    await waitFor(() => {
      expect(screen.getByText('Lottery Numbers')).toBeInTheDocument();
    });

    deleteDMail.mockResolvedValue({ success: true });

    // Find delete button for the first mail and click it
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]);

    // Confirm deletion modal should appear
    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete the D-Mail/i)).toBeInTheDocument();
    });

    // Confirm deletion
    fireEvent.click(screen.getByRole('button', { name: /delete d-mail/i }));

    await waitFor(() => {
      expect(deleteDMail).toHaveBeenCalledWith(mockInstance, 'dmail-1');
    });
    
    expect(notyfService.success).toHaveBeenCalledWith('D-Mail deleted successfully');
    expect(getAllDMails).toHaveBeenCalledTimes(2);
  });

  test('opens edit form and updates a mail', async () => {
    // Mock the fetch by ID API call
    getDMailById.mockResolvedValue(mockMails[0]);
    updateDMail.mockResolvedValue({ success: true });

    render(<DMails />);
    
    await waitFor(() => {
      expect(screen.getByText('Lottery Numbers')).toBeInTheDocument();
    });

    // Click the edit button for the first mail
    const editButtons = screen.getAllByRole('button', { name: /view\/edit/i });
    fireEvent.click(editButtons[0]);

    // Wait for the edit modal
    await waitFor(() => {
      expect(screen.getByText(/view\/edit d-mail/i)).toBeInTheDocument();
    });

    // Check that form is pre-filled
    expect(screen.getByLabelText(/subject/i).value).toBe('Lottery Numbers');
    expect(screen.getByLabelText(/content/i).value).toBe('Buy ticket with numbers 03, 07, 10, 26, 41, 42');

    // Update the mail
    fireEvent.change(screen.getByLabelText(/subject/i), {
      target: { value: 'Updated Lottery Numbers' }
    });
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /update d-mail/i }));

    // Verify the update was called
    await waitFor(() => {
      expect(updateDMail).toHaveBeenCalledWith(
        mockInstance, 
        'dmail-1', 
        expect.objectContaining({
          subject: 'Updated Lottery Numbers'
        })
      );
    });

    expect(notyfService.success).toHaveBeenCalledWith('D-Mail updated successfully');
    expect(getAllDMails).toHaveBeenCalledTimes(2);
  });

  test('handles error when creating a new mail', async () => {
    render(<DMails />);
    
    await waitFor(() => {
      expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
    });

    // Click the "Send New D-Mail" button
    fireEvent.click(screen.getByTestId('new-dmail-btn'));

    // Fill the form minimally
    await waitFor(() => {
      expect(screen.getByTestId('dmail-form-element')).toBeInTheDocument();
    });
    
    fireEvent.change(screen.getByLabelText(/subject/i), {
      target: { value: 'Failed Test Mail' }
    });
    
    fireEvent.change(screen.getByLabelText(/content/i), {
      target: { value: 'This mail will fail to send' }
    });
    
    fireEvent.change(screen.getByLabelText(/recipient/i), {
      target: { value: 'test@example.com' }
    });

    // Mock an API error
    const errorMessage = 'API Error: Failed to create';
    createDMail.mockRejectedValue(new Error(errorMessage));

    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /send d-mail/i }));

    await waitFor(() => {
      expect(notyfService.error).toHaveBeenCalledWith(`Failed to send D-Mail: ${errorMessage}`);
    });
  });

  test('handles error when updating a mail', async () => {
    // Mock the fetch by ID API call
    getDMailById.mockResolvedValue(mockMails[0]);
    const errorMessage = 'API Error: Failed to update';
    updateDMail.mockRejectedValue(new Error(errorMessage));

    render(<DMails />);
    
    await waitFor(() => {
      expect(screen.getByText('Lottery Numbers')).toBeInTheDocument();
    });

    // Click the edit button
    const editButtons = screen.getAllByRole('button', { name: /view\/edit/i });
    fireEvent.click(editButtons[0]);

    // Wait for the edit modal
    await waitFor(() => {
      expect(screen.getByLabelText(/subject/i)).toBeInTheDocument();
    });

    // Submit the form without changes
    fireEvent.click(screen.getByRole('button', { name: /update d-mail/i }));

    // Verify error handling
    await waitFor(() => {
      expect(notyfService.error).toHaveBeenCalledWith(`Failed to update D-Mail: ${errorMessage}`);
    });
  });

  test('updates and displays WebSocket connection status', async () => {
    render(<DMails />);
    expect(screen.getByText(/connected/i)).toBeInTheDocument();

    act(() => {
      dMailsSocket.statusHandler('disconnected');
    });
    
    await waitFor(() => {
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    });
  });

  test('disconnects from WebSocket when unmounting', async () => {
    const { unmount } = render(<DMails />);
    
    await waitFor(() => {
      expect(dMailsSocket.connect).toHaveBeenCalled();
    });
    
    unmount();
    expect(dMailsSocket.disconnect).toHaveBeenCalled();
  });

  test('displays empty state when no mails exist', async () => {
    // Override the mock to return empty array
    getAllDMails.mockResolvedValue([]);
    
    render(<DMails />);
    
    await waitFor(() => {
      expect(screen.getByTestId('no-dmails')).toBeInTheDocument();
      expect(screen.getByText('No D-Mails found.')).toBeInTheDocument();
      expect(screen.getByTestId('send-first-dmail-btn')).toBeInTheDocument();
    });
    
    // Click the create button in empty state
    fireEvent.click(screen.getByRole('button', { name: /send your first d-mail/i }));
    
    // Modal should appear
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /send new d-mail/i })).toBeInTheDocument();
    });
  });

  test('reacts to WebSocket update message', async () => {
    render(<DMails />);
    
    await waitFor(() => {
      expect(screen.getByText('Lottery Numbers')).toBeInTheDocument();
    });

    // Simulate an update message from WebSocket
    const updatedMail = {
      ...mockMails[0],
      subject: 'Updated Lottery Info',
      status: 'received'
    };

    act(() => {
      dMailsSocket.messageHandler({
        rawData: {
          type: 'update',
          data: updatedMail
        }
      });
    });
    
    // Check that UI was updated
    await waitFor(() => {
      expect(screen.getByText('Updated Lottery Info')).toBeInTheDocument();
    });
    
    expect(notyfService.info).toHaveBeenCalledWith('A D-Mail was updated');
  });

  test('reacts to WebSocket delete message', async () => {
    render(<DMails />);
    
    await waitFor(() => {
      expect(screen.getByText('Lottery Numbers')).toBeInTheDocument();
    });

    // Simulate a delete message from WebSocket
    act(() => {
      dMailsSocket.messageHandler({
        rawData: {
          type: 'delete',
          data: { id: 'dmail-1' }
        }
      });
    });
    
    // Check that item was removed
    await waitFor(() => {
      expect(screen.queryByText('Lottery Numbers')).not.toBeInTheDocument();
    });
    
    expect(notyfService.info).toHaveBeenCalledWith('A D-Mail was deleted');
  });

  test('handles invalid WebSocket messages gracefully', async () => {
    // Capture the subscribe callback for manual testing
    let messageCallback;
    let statusCallback;
    
    dMailsSocket.subscribe.mockImplementation(callback => {
      messageCallback = callback;
      return jest.fn();
    });
    
    dMailsSocket.subscribeToStatus.mockImplementation(callback => {
      statusCallback = callback;
      return jest.fn();
    });
    
    const { unmount } = render(<DMails />);
    
    await waitFor(() => {
      expect(screen.getByText('Lottery Numbers')).toBeInTheDocument();
    });

    // Test various invalid message formats
    act(() => {
      // Undefined message
      messageCallback(undefined);
      
      // Message with no rawData
      messageCallback({ someProperty: 'value' });
      
      // Message with rawData but missing type
      messageCallback({ rawData: { data: { id: 'dmail-999' } } });
      
      // Unknown message type
      messageCallback({ rawData: { type: 'unknown', data: { id: 'dmail-999' } } });
      
      // Missing data
      messageCallback({ rawData: { type: 'update' } });
      
      // Null data
      messageCallback({ rawData: { type: 'create', data: null } });
      
      // Data missing ID
      messageCallback({ rawData: { type: 'delete', data: { subject: 'No ID' } } });
    });
    
    // Component should not crash and UI should remain intact
    expect(screen.getByText('Lottery Numbers')).toBeInTheDocument();
    expect(screen.getByText('IBN 5100 Location')).toBeInTheDocument();
    
    unmount();
  });

  test('renders all possible status badge colors', async () => {
    // Override mock to include mails with different statuses
    const allStatusMails = [
      { id: 'dmail-draft', subject: 'Draft Mail', status: 'draft', sender: 'test@example.com', recipient: 'test@example.com' },
      { id: 'dmail-sending', subject: 'Sending Mail', status: 'sending', sender: 'test@example.com', recipient: 'test@example.com' },
      { id: 'dmail-sent', subject: 'Sent Mail', status: 'sent', sender: 'test@example.com', recipient: 'test@example.com' },
      { id: 'dmail-received', subject: 'Received Mail', status: 'received', sender: 'test@example.com', recipient: 'test@example.com' },
      { id: 'dmail-failed', subject: 'Failed Mail', status: 'failed', sender: 'test@example.com', recipient: 'test@example.com' },
      { id: 'dmail-unknown', subject: 'Unknown Status Mail', status: 'unknown', sender: 'test@example.com', recipient: 'test@example.com' }
    ];
    
    getAllDMails.mockResolvedValue(allStatusMails);
    
    render(<DMails />);
    
    // Wait for all mails to render
    await waitFor(() => {
      expect(screen.getByText('Unknown Status Mail')).toBeInTheDocument();
    });
    
    // Verify each status has appropriate badge
    const badges = screen.getAllByTestId('dmail-status');
    
    // Check badge colors by examining their classes
    const badgeClasses = badges.map(badge => {
      return Array.from(badge.classList)
        .find(cls => cls.startsWith('bg-'))
        ?.replace('bg-', '');
    });
    
    // Verify all status colors are rendered
    expect(badgeClasses).toContain('secondary'); // draft
    expect(badgeClasses).toContain('info');      // sending
    expect(badgeClasses).toContain('primary');   // sent
    expect(badgeClasses).toContain('success');   // received
    expect(badgeClasses).toContain('danger');    // failed
    expect(badgeClasses).toContain('light');     // unknown status
  });

  test('shows reload button functionality', async () => {
    render(<DMails />);
    
    await waitFor(() => {
      expect(screen.getByText('Lottery Numbers')).toBeInTheDocument();
    });
    
    // Clear previous calls
    getAllDMails.mockClear();
    
    // Update the mock to return different data on reload
    const updatedMails = [
      ...mockMails,
      {
        id: 'dmail-3',
        subject: 'New Mail After Reload',
        content: 'This appeared after reload',
        sender: 'test@example.com',
        recipient: 'okabe.rintaro@future-gadget-lab.org',
        status: 'received'
      }
    ];
    getAllDMails.mockResolvedValue(updatedMails);
    
    // Click reload button
    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    
    // Check that API was called again
    expect(getAllDMails).toHaveBeenCalled();
    
    // Check that new data appears
    await waitFor(() => {
      expect(screen.getByText('New Mail After Reload')).toBeInTheDocument();
    });
  });
});