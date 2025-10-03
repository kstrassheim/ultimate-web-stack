import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Customers from './Customers';
import { 
  getAllCustomers, 
  createCustomer, 
  updateCustomer, 
  deleteCustomer
} from '@/api/customerApi';
import { useMsal } from '@azure/msal-react';
import notyfService from '@/log/notyfService';

// Mock dependencies
jest.mock('@azure/msal-react', () => ({
  useMsal: jest.fn()
}));

jest.mock('@/api/customerApi', () => ({
  getAllCustomers: jest.fn(),
  getCustomerById: jest.fn(),
  createCustomer: jest.fn(),
  updateCustomer: jest.fn(),
  deleteCustomer: jest.fn()
}));

jest.mock('@/log/notyfService', () => ({
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warning: jest.fn()
}));

jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn()
}));

// Global mock data
const mockCustomers = [
  {
    id: 'CUST-1',
    name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890',
    address: '123 Main St'
  },
  {
    id: 'CUST-2',
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    phone: '+9876543210',
    address: '456 Oak Ave'
  }
];

describe('Customers Component', () => {
  let originalConsoleLog;
  
  // Save original console.log and mock it before each test
  beforeEach(() => {
    // Store original console method before mocking
    originalConsoleLog = console.log;
    console.log = jest.fn();
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock useMsal hook
    useMsal.mockImplementation(() => ({
      instance: {
        getActiveAccount: () => ({ username: 'admin@example.com' }),
        setActiveAccount: jest.fn(),
      }
    }));
    
    // Mock API functions
    getAllCustomers.mockResolvedValue(mockCustomers);
  });
  
  // Restore console.log after each test
  afterEach(() => {
    console.log = originalConsoleLog;
  });
  
  describe('Component Rendering', () => {
    it('should render the Customers page with table', async () => {
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
      });
      
      expect(screen.getByTestId('customers-table')).toBeInTheDocument();
    });
    
    it('should display customers in the table', async () => {
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });
    });
    
    it('should show "New Customer" button', async () => {
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('new-customer-btn')).toBeInTheDocument();
      });
    });
  });
  
  describe('Create Customer', () => {
    it('should open create form when "New Customer" button is clicked', async () => {
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('new-customer-btn')).toBeInTheDocument();
      });
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('new-customer-btn'));
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('customer-form-modal')).toBeInTheDocument();
        expect(screen.getByTestId('customer-form-title')).toHaveTextContent('New Customer');
      });
    });
    
    it('should create a new customer when form is submitted', async () => {
      const newCustomer = {
        name: 'New Customer',
        email: 'new@example.com',
        phone: '+1111111111',
        address: '789 Test St'
      };
      
      createCustomer.mockResolvedValue({ id: 'CUST-3', ...newCustomer });
      getAllCustomers.mockResolvedValueOnce(mockCustomers).mockResolvedValueOnce([...mockCustomers, { id: 'CUST-3', ...newCustomer }]);
      
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('new-customer-btn')).toBeInTheDocument();
      });
      
      // Open create form
      await act(async () => {
        fireEvent.click(screen.getByTestId('new-customer-btn'));
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('customer-form-modal')).toBeInTheDocument();
      });
      
      // Fill form
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: newCustomer.name } });
        fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: newCustomer.email } });
        fireEvent.change(screen.getByLabelText(/Phone/i), { target: { value: newCustomer.phone } });
        fireEvent.change(screen.getByLabelText(/Address/i), { target: { value: newCustomer.address } });
      });
      
      // Submit form
      await act(async () => {
        fireEvent.click(screen.getByTestId('customer-form-submit'));
      });
      
      await waitFor(() => {
        expect(createCustomer).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            name: newCustomer.name,
            email: newCustomer.email,
            phone: newCustomer.phone,
            address: newCustomer.address
          })
        );
        expect(notyfService.success).toHaveBeenCalledWith('Customer created successfully');
      });
    });
  });
  
  describe('Update Customer', () => {
    it('should open edit form when "Edit" button is clicked', async () => {
      const { getCustomerById } = require('@/api/customerApi');
      getCustomerById.mockResolvedValue(mockCustomers[0]);
      
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      
      // Click edit button
      const editButtons = screen.getAllByText('Edit');
      await act(async () => {
        fireEvent.click(editButtons[0]);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('customer-form-modal')).toBeInTheDocument();
        expect(screen.getByTestId('customer-form-title')).toHaveTextContent('Edit Customer');
      });
    });
    
    it('should update customer when edit form is submitted', async () => {
      const { getCustomerById } = require('@/api/customerApi');
      getCustomerById.mockResolvedValue(mockCustomers[0]);
      updateCustomer.mockResolvedValue({ ...mockCustomers[0], name: 'Updated Name' });
      
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      
      // Click edit button
      const editButtons = screen.getAllByText('Edit');
      await act(async () => {
        fireEvent.click(editButtons[0]);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('customer-form-modal')).toBeInTheDocument();
      });
      
      // Update name
      await act(async () => {
        const nameInput = screen.getByLabelText(/Name/i);
        fireEvent.change(nameInput, { target: { value: 'Updated Name' } });
      });
      
      // Submit form
      await act(async () => {
        fireEvent.click(screen.getByTestId('customer-form-submit'));
      });
      
      await waitFor(() => {
        expect(updateCustomer).toHaveBeenCalled();
        expect(notyfService.success).toHaveBeenCalledWith('Customer updated successfully');
      });
    });
  });
  
  describe('Delete Customer', () => {
    it('should open delete confirmation modal when "Delete" button is clicked', async () => {
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      
      // Click delete button
      const deleteButtons = screen.getAllByText('Delete');
      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
        expect(screen.getByTestId('delete-customer-name')).toHaveTextContent('John Doe');
      });
    });
    
    it('should delete customer when confirmed', async () => {
      deleteCustomer.mockResolvedValue(null);
      getAllCustomers.mockResolvedValueOnce(mockCustomers).mockResolvedValueOnce([mockCustomers[1]]);
      
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      
      // Click delete button
      const deleteButtons = screen.getAllByText('Delete');
      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('confirm-delete-btn')).toBeInTheDocument();
      });
      
      // Confirm delete
      await act(async () => {
        fireEvent.click(screen.getByTestId('confirm-delete-btn'));
      });
      
      await waitFor(() => {
        expect(deleteCustomer).toHaveBeenCalledWith(expect.anything(), 'CUST-1');
        expect(notyfService.success).toHaveBeenCalledWith('Customer deleted successfully');
      });
    });
    
    it('should cancel delete when "Cancel" button is clicked', async () => {
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      
      // Click delete button
      const deleteButtons = screen.getAllByText('Delete');
      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('cancel-delete-btn')).toBeInTheDocument();
      });
      
      // Cancel delete
      await act(async () => {
        fireEvent.click(screen.getByTestId('cancel-delete-btn'));
      });
      
      await waitFor(() => {
        expect(deleteCustomer).not.toHaveBeenCalled();
      });
    });
  });
  
  describe('Error Handling', () => {
    it('should display error message when loading customers fails', async () => {
      getAllCustomers.mockRejectedValue(new Error('Network error'));
      
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(notyfService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to load customers'));
      });
    });
    
    it('should display error message when creating customer fails', async () => {
      createCustomer.mockRejectedValue(new Error('Creation failed'));
      
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('new-customer-btn')).toBeInTheDocument();
      });
      
      // Open create form
      await act(async () => {
        fireEvent.click(screen.getByTestId('new-customer-btn'));
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('customer-form-modal')).toBeInTheDocument();
      });
      
      // Fill and submit form
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Test' } });
        fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
      });
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('customer-form-submit'));
      });
      
      await waitFor(() => {
        expect(notyfService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to create customer'));
      });
    });
  });
  
  describe('Form Validation', () => {
    it('should require name and email fields', async () => {
      await act(async () => {
        render(<Customers />);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('new-customer-btn')).toBeInTheDocument();
      });
      
      // Open create form
      await act(async () => {
        fireEvent.click(screen.getByTestId('new-customer-btn'));
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('customer-form-modal')).toBeInTheDocument();
      });
      
      // Submit without filling
      await act(async () => {
        fireEvent.click(screen.getByTestId('customer-form-submit'));
      });
      
      // Form should show validation errors
      await waitFor(() => {
        expect(createCustomer).not.toHaveBeenCalled();
      });
    });
  });
});
