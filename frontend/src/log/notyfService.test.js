// Move the jest.mock call to the top and define mocks inside it
jest.mock('notyf', () => {
  // Define the mock functions inside the factory
  const mockFunctions = {
    success: jest.fn(),
    error: jest.fn(), 
    open: jest.fn(),
    dismiss: jest.fn(),
    dismissAll: jest.fn()
  };
  
  // Return both the mocked class and the functions for testing
  return {
    Notyf: jest.fn(() => mockFunctions),
    __mocks: mockFunctions
  };
});

// Access the exported mock functions
const { __mocks: mockFns } = require('notyf');

// Import after mocking
import notyfService from './notyfService';

describe('notyfService', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should call success method correctly', () => {
    const message = 'Success message';
    notyfService.success(message);
    expect(mockFns.success).toHaveBeenCalledWith(message);
  });

  it('should call error method correctly', () => {
    const message = 'Error message';
    notyfService.error(message);
    expect(mockFns.error).toHaveBeenCalledWith(message);
  });

  it('should call warning method correctly', () => {
    const message = 'Warning message';
    notyfService.warning(message);
    expect(mockFns.open).toHaveBeenCalledWith({
      type: 'warning',
      message
    });
  });

  it('should call info method correctly', () => {
    const message = 'Info message';
    notyfService.info(message);
    expect(mockFns.open).toHaveBeenCalledWith({
      type: 'info',
      message
    });
  });

  it('should call dismiss method correctly', () => {
    const notification = { id: 'test-notification' };
    notyfService.dismiss(notification);
    expect(mockFns.dismiss).toHaveBeenCalledWith(notification);
  });

  it('should call dismissAll method correctly', () => {
    notyfService.dismissAll();
    expect(mockFns.dismissAll).toHaveBeenCalled();
  });
});