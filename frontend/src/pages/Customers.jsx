import { useState, useEffect } from 'react';
import { Card, Button, Table, Modal, Form, Row, Col } from 'react-bootstrap';
import { useMsal } from '@azure/msal-react';
import { 
  getAllCustomers, 
  getCustomerById, 
  createCustomer, 
  updateCustomer, 
  deleteCustomer
} from '@/api/customerApi';
import appInsights from '@/log/appInsights';
import Loading from '@/components/Loading';
import notyfService from '@/log/notyfService';

const Customers = () => {
  const { instance } = useMsal();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState(null);
  const [formMode, setFormMode] = useState('create'); // 'create' or 'edit'
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);

  // Load customers data
  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      appInsights.trackEvent({ name: 'Customers - Fetching all customers' });
      const data = await getAllCustomers(instance);
      setCustomers(data);
    } catch (err) {
      setError(`Failed to load customers: ${err.message}`);
      notyfService.error(`Failed to load customers: ${err.message}`);
      appInsights.trackException({ error: err, severityLevel: 'Error' });
    } finally {
      setLoading(false);
    }
  };

  // Load customers on mount
  useEffect(() => {
    fetchCustomers();
  }, []);

  // Create new customer
  const handleCreateCustomer = async (customerData) => {
    setLoading(true);
    try {
      await createCustomer(instance, customerData);
      notyfService.success('Customer created successfully');
      setShowForm(false);
      await fetchCustomers();
    } catch (err) {
      notyfService.error(`Failed to create customer: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Update existing customer
  const handleUpdateCustomer = async (id, customerData) => {
    setLoading(true);
    try {
      await updateCustomer(instance, id, customerData);
      notyfService.success('Customer updated successfully');
      setShowForm(false);
      await fetchCustomers();
    } catch (err) {
      notyfService.error(`Failed to update customer: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete customer
  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    
    setLoading(true);
    try {
      await deleteCustomer(instance, customerToDelete.id);
      notyfService.success('Customer deleted successfully');
      setShowDeleteModal(false);
      setCustomerToDelete(null);
      await fetchCustomers();
    } catch (err) {
      notyfService.error(`Failed to delete customer: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle form submission
  const handleSubmit = (customerData) => {
    if (formMode === 'create') {
      handleCreateCustomer(customerData);
    } else {
      handleUpdateCustomer(currentCustomer.id, customerData);
    }
  };

  // Open create form
  const openCreateForm = () => {
    setCurrentCustomer({
      name: '',
      email: '',
      phone: '',
      address: ''
    });
    setFormMode('create');
    setShowForm(true);
  };

  // Open edit form
  const openEditForm = async (id) => {
    try {
      const customer = await getCustomerById(instance, id);
      setCurrentCustomer(customer);
      setFormMode('edit');
      setShowForm(true);
    } catch (err) {
      notyfService.error(`Failed to load customer details: ${err.message}`);
    }
  };

  // Open delete confirmation
  const openDeleteModal = (customer) => {
    setCustomerToDelete(customer);
    setShowDeleteModal(true);
  };

  if (loading && customers.length === 0) {
    return <Loading />;
  }

  return (
    <div className="container mt-4">
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h2>Customers</h2>
          <div>
            <Button 
              variant="primary" 
              onClick={openCreateForm}
              data-testid="new-customer-btn"
            >
              New Customer
            </Button>
            <Button 
              variant="secondary" 
              onClick={fetchCustomers} 
              className="ms-2"
              disabled={loading}
            >
              Reload
            </Button>
          </div>
        </Card.Header>
        <Card.Body>
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          
          {customers.length === 0 ? (
            <p className="text-center text-muted">No customers found. Create your first customer!</p>
          ) : (
            <Table striped bordered hover responsive data-testid="customers-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{customer.email}</td>
                    <td>{customer.phone || '-'}</td>
                    <td>{customer.address || '-'}</td>
                    <td>
                      <Button 
                        variant="info" 
                        size="sm" 
                        onClick={() => openEditForm(customer.id)}
                        className="me-2"
                      >
                        Edit
                      </Button>
                      <Button 
                        variant="danger" 
                        size="sm" 
                        onClick={() => openDeleteModal(customer)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Customer Form Modal */}
      <Modal show={showForm} onHide={() => setShowForm(false)} size="lg" data-testid="customer-form-modal">
        <Modal.Header closeButton>
          <Modal.Title data-testid="customer-form-title">
            {formMode === 'create' ? 'New Customer' : 'Edit Customer'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <CustomerForm 
            customer={currentCustomer} 
            onSubmit={handleSubmit}
            mode={formMode}
            loading={loading}
          />
        </Modal.Body>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Are you sure you want to delete the customer <strong data-testid="delete-customer-name">{customerToDelete?.name}</strong>?</p>
          <p className="text-danger">This action cannot be undone.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)} data-testid="cancel-delete-btn">
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteCustomer} disabled={loading} data-testid="confirm-delete-btn">
            {loading ? 'Deleting...' : 'Delete Customer'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

// Helper component for customer form
const CustomerForm = ({ customer, onSubmit, mode, loading }) => {
  const [formData, setFormData] = useState(customer || {});
  const [validated, setValidated] = useState(false);
  
  useEffect(() => {
    if (customer) {
      setFormData(customer);
    }
  }, [customer]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    
    if (form.checkValidity() === false) {
      e.stopPropagation();
      setValidated(true);
      return;
    }
    
    onSubmit(formData);
  };
  
  return (
    <Form noValidate validated={validated} onSubmit={handleSubmit} data-testid="customer-form-element">
      <Form.Group className="mb-3" data-testid="field-customer-name">
        <Form.Label htmlFor="customer-name">Name</Form.Label>
        <Form.Control
          id="customer-name"
          type="text"
          name="name"
          value={formData.name || ''}
          onChange={handleChange}
          required
          placeholder="Enter customer name"
        />
        <Form.Control.Feedback type="invalid">
          Please provide a customer name.
        </Form.Control.Feedback>
      </Form.Group>
      
      <Form.Group className="mb-3" data-testid="field-customer-email">
        <Form.Label htmlFor="customer-email">Email</Form.Label>
        <Form.Control
          id="customer-email"
          type="email"
          name="email"
          value={formData.email || ''}
          onChange={handleChange}
          required
          placeholder="Enter email address"
        />
        <Form.Control.Feedback type="invalid">
          Please provide a valid email address.
        </Form.Control.Feedback>
      </Form.Group>
      
      <Form.Group className="mb-3" data-testid="field-customer-phone">
        <Form.Label htmlFor="customer-phone">Phone</Form.Label>
        <Form.Control
          id="customer-phone"
          type="tel"
          name="phone"
          value={formData.phone || ''}
          onChange={handleChange}
          placeholder="Enter phone number (optional)"
        />
      </Form.Group>
      
      <Form.Group className="mb-3" data-testid="field-customer-address">
        <Form.Label htmlFor="customer-address">Address</Form.Label>
        <Form.Control
          id="customer-address"
          as="textarea"
          rows={3}
          name="address"
          value={formData.address || ''}
          onChange={handleChange}
          placeholder="Enter address (optional)"
        />
      </Form.Group>
      
      <div className="d-flex justify-content-end">
        <Button variant="primary" type="submit" disabled={loading} data-testid="customer-form-submit">
          {loading ? 'Saving...' : (mode === 'create' ? 'Create Customer' : 'Update Customer')}
        </Button>
      </div>
    </Form>
  );
};

export default Customers;
