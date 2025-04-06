import { useState, useEffect, useRef } from 'react';
import { Card, Button, Table, Modal, Form, Badge, Row, Col, Alert } from 'react-bootstrap';
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
import Loading from '@/components/Loading';
import notyfService from '@/log/notyfService';

const DMails = () => {
  const { instance } = useMsal();
  const [mails, setMails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [currentMail, setCurrentMail] = useState(null);
  const [formMode, setFormMode] = useState('create'); // 'create' or 'edit'
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [mailToDelete, setMailToDelete] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const initFetchCompleted = useRef(false);

  // Load mails data
  const fetchMails = async () => {
    setLoading(true);
    setError(null);
    
    try {
      appInsights.trackEvent({ name: 'DMails - Fetching all D-mails' });
      const data = await getAllDMails(instance);
      setMails(data);
      notyfService.success('D-Mails loaded successfully');
    } catch (err) {
      setError(`Failed to load D-Mails: ${err.message}`);
      notyfService.error(`Failed to load D-Mails: ${err.message}`);
      appInsights.trackException({ error: err, severityLevel: 'Error' });
    } finally {
      setLoading(false);
    }
  };

  // Get single mail by ID
  const fetchMailById = async (id) => {
    try {
      const data = await getDMailById(instance, id);
      return data;
    } catch (err) {
      notyfService.error(`Failed to load D-Mail details: ${err.message}`);
      return null;
    }
  };

  // Create new mail
  const handleCreateMail = async (mailData) => {
    setLoading(true);
    try {
      await createDMail(instance, mailData);
      notyfService.success('D-Mail sent successfully');
      setShowForm(false);
      await fetchMails();
    } catch (err) {
      notyfService.error(`Failed to send D-Mail: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Update existing mail
  const handleUpdateMail = async (id, mailData) => {
    setLoading(true);
    try {
      await updateDMail(instance, id, mailData);
      notyfService.success('D-Mail updated successfully');
      setShowForm(false);
      await fetchMails();
    } catch (err) {
      notyfService.error(`Failed to update D-Mail: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete mail
  const handleDeleteMail = async () => {
    if (!mailToDelete) return;
    setLoading(true);
    try {
      await deleteDMail(instance, mailToDelete.id);
      notyfService.success('D-Mail deleted successfully');
      setShowDeleteModal(false);
      setMailToDelete(null);
      await fetchMails();
    } catch (err) {
      notyfService.error(`Failed to delete D-Mail: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle form submission
  const handleSubmit = (mailData) => {
    if (formMode === 'create') {
      handleCreateMail(mailData);
    } else {
      handleUpdateMail(currentMail.id, mailData);
    }
  };

  // Open create form
  const openCreateForm = () => {
    setCurrentMail({
      subject: '',
      content: '',
      sender: instance.getActiveAccount()?.username || '',
      recipient: '',
      worldLineOrigin: '1.048596', // Default Steins;Gate worldline
      worldLineDestination: '',
      divergence: 0,
      status: 'draft'
    });
    setFormMode('create');
    setShowForm(true);
  };

  // Open edit form
  const openEditForm = async (id) => {
    const mail = await fetchMailById(id);
    if (mail) {
      setCurrentMail(mail);
      setFormMode('edit');
      setShowForm(true);
    }
  };

  // Open delete confirmation modal
  const openDeleteModal = (mail) => {
    setMailToDelete(mail);
    setShowDeleteModal(true);
  };

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    dMailsSocket.connect(instance);
    
    const unsubscribe = dMailsSocket.subscribe((message) => {
      if (!message?.rawData?.type || !message?.rawData?.data) return;
      
      if (message.rawData.type === 'create' && message.rawData.data) {
        // Make sure the data has an id before adding
        if (message.rawData.data.id) {
          setMails(prev => [...prev, message.rawData.data]);
          notyfService.info('New D-Mail received');
        }
      } else if (message.rawData.type === 'update' && message.rawData.data) {
        // Make sure the data has an id before updating
        if (message.rawData.data.id) {
          setMails(prev => 
            prev.map(mail => mail.id === message.rawData.data.id ? message.rawData.data : mail)
          );
          notyfService.info('A D-Mail was updated');
        }
      } else if (message.rawData.type === 'delete' && message.rawData.data) {
        // Make sure the data has an id before deleting
        if (message.rawData.data.id) {
          setMails(prev => 
            prev.filter(mail => mail.id !== message.rawData.data.id)
          );
          notyfService.info('A D-Mail was deleted');
        }
      }
    });
    
    const unsubscribeStatus = dMailsSocket.subscribeToStatus((status) => {
      if (status) {
        setConnectionStatus(status);
      }
    });
    
    if (!initFetchCompleted.current) {
      fetchMails();
      initFetchCompleted.current = true;
    }
    
    return () => {
      unsubscribe();
      unsubscribeStatus();
      dMailsSocket.disconnect();
    };
  }, [instance]);

  return (
    <div data-testid="dmails-page">
      <h1 data-testid="dmails-heading">D-Mail System</h1>
      
      <Loading visible={loading} message="Processing D-Mails..." />
      
      <div className="mb-3" data-testid="connection-status">
        <span className="me-2">WebSocket Status:</span>
        <Badge bg={connectionStatus === 'connected' ? 'success' : 'danger'} data-testid="status-badge">
          {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
        </Badge>
      </div>
      
      {error && (
        <Alert variant="danger" className="mb-3" data-testid="dmails-error">
          {error}
        </Alert>
      )}
      
      <Card className="mb-4" data-testid="dmails-card">
        <Card.Header
          className="d-flex justify-content-between align-items-center"
          data-testid="dmails-card-header"
        >
          <span>All D-Mails</span>
          <div>
            <Button
              variant="primary"
              size="sm"
              className="me-2"
              onClick={openCreateForm}
              disabled={loading}
              data-testid="new-dmail-btn"
            >
              Send New D-Mail
            </Button>
            <Button
              variant="outline-primary"
              size="sm"
              onClick={fetchMails}
              disabled={loading}
              data-testid="reload-dmails-btn"
            >
              Reload
            </Button>
          </div>
        </Card.Header>
        <Card.Body>
          {mails.length > 0 ? (
            <Table striped bordered hover responsive data-testid="dmails-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Sender</th>
                  <th>Recipient</th>
                  <th>WorldLine</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mails.map(mail => (
                  <tr key={mail.id} data-testid={`dmail-row-${mail.id}`}>
                    <td>{mail.subject}</td>
                    <td>{mail.sender}</td>
                    <td>{mail.recipient}</td>
                    <td>
                      <span data-testid="worldline-value">
                        {mail.worldLineDestination || mail.worldLineOrigin}
                      </span>
                    </td>
                    <td>
                      <Badge bg={getStatusBadgeColor(mail.status)} data-testid="dmail-status">
                        {mail.status}
                      </Badge>
                    </td>
                    <td className="d-flex justify-content-around" data-testid="dmail-actions">
                      <Button
                        variant="outline-info"
                        size="sm"
                        onClick={() => openEditForm(mail.id)}
                        data-testid={`edit-btn-${mail.id}`}
                      >
                        View/Edit
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => openDeleteModal(mail)}
                        data-testid={`delete-btn-${mail.id}`}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : !loading && (
            <div className="text-center p-4" data-testid="no-dmails">
              <p className="text-muted">No D-Mails found.</p>
              <Button variant="primary" onClick={openCreateForm} data-testid="send-first-dmail-btn">
                Send your first D-Mail
              </Button>
            </div>
          )}
        </Card.Body>
      </Card>
      
      {/* D-Mail Form Modal */}
      <Modal show={showForm} onHide={() => setShowForm(false)} size="lg" data-testid="dmail-form-modal">
        <Modal.Header closeButton>
          <h4 className="modal-title" data-testid="dmail-form-title">
            {formMode === 'create' ? 'Send New D-Mail' : 'View/Edit D-Mail'}
          </h4>
        </Modal.Header>
        <Modal.Body>
          <DMailForm 
            mail={currentMail} 
            onSubmit={handleSubmit} 
            mode={formMode}
            loading={loading}
          />
        </Modal.Body>
      </Modal>
      
      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} data-testid="delete-confirmation-modal">
        <Modal.Header closeButton>
          <Modal.Title>Confirm Deletion</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Are you sure you want to delete the D-Mail with subject 
            <strong data-testid="delete-dmail-subject"> {mailToDelete?.subject}</strong>?
          </p>
          <p className="text-danger">This could create a temporal paradox. Proceed with caution.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)} data-testid="cancel-delete-btn">
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteMail} disabled={loading} data-testid="confirm-delete-btn">
            {loading ? 'Deleting...' : 'Delete D-Mail'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

// Helper component for D-Mail form
const DMailForm = ({ mail, onSubmit, mode, loading }) => {
  const [formData, setFormData] = useState(mail || {});
  const [validated, setValidated] = useState(false);
  
  useEffect(() => {
    if (mail) {
      setFormData(mail);
    }
  }, [mail]);
  
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
    <Form noValidate validated={validated} onSubmit={handleSubmit} data-testid="dmail-form-element">
      <Form.Group className="mb-3" data-testid="field-dmail-subject">
        <Form.Label htmlFor="dmail-subject">Subject</Form.Label>
        <Form.Control
          id="dmail-subject"
          type="text"
          name="subject"
          value={formData.subject || ''}
          onChange={handleChange}
          required
          placeholder="Enter message subject"
        />
        <Form.Control.Feedback type="invalid">
          Please provide a subject.
        </Form.Control.Feedback>
      </Form.Group>
      
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3" data-testid="field-dmail-sender">
            <Form.Label htmlFor="dmail-sender">Sender</Form.Label>
            <Form.Control
              id="dmail-sender"
              type="text"
              name="sender"
              value={formData.sender || ''}
              onChange={handleChange}
              required
              placeholder="Enter sender"
            />
            <Form.Control.Feedback type="invalid">
              Please provide a sender.
            </Form.Control.Feedback>
          </Form.Group>
        </Col>
        
        <Col md={6}>
          <Form.Group className="mb-3" data-testid="field-dmail-recipient">
            <Form.Label htmlFor="dmail-recipient">Recipient</Form.Label>
            <Form.Control
              id="dmail-recipient"
              type="text"
              name="recipient"
              value={formData.recipient || ''}
              onChange={handleChange}
              required
              placeholder="Enter recipient"
            />
            <Form.Control.Feedback type="invalid">
              Please provide a recipient.
            </Form.Control.Feedback>
          </Form.Group>
        </Col>
      </Row>
      
      <Form.Group className="mb-3" data-testid="field-dmail-content">
        <Form.Label htmlFor="dmail-content">Message Content</Form.Label>
        <Form.Control
          id="dmail-content"
          as="textarea"
          rows={4}
          name="content"
          value={formData.content || ''}
          onChange={handleChange}
          required
          placeholder="Enter your message"
        />
        <Form.Control.Feedback type="invalid">
          Please provide message content.
        </Form.Control.Feedback>
      </Form.Group>
      
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3" data-testid="field-dmail-origin">
            <Form.Label htmlFor="dmail-origin">WorldLine Origin</Form.Label>
            <Form.Control
              id="dmail-origin"
              type="text"
              name="worldLineOrigin"
              value={formData.worldLineOrigin || ''}
              onChange={handleChange}
              required
              placeholder="Current worldline (e.g., 1.048596)"
            />
            <Form.Control.Feedback type="invalid">
              Please provide a worldline origin.
            </Form.Control.Feedback>
          </Form.Group>
        </Col>
        
        <Col md={6}>
          <Form.Group className="mb-3" data-testid="field-dmail-destination">
            <Form.Label htmlFor="dmail-destination">WorldLine Destination</Form.Label>
            <Form.Control
              id="dmail-destination"
              type="text"
              name="worldLineDestination"
              value={formData.worldLineDestination || ''}
              onChange={handleChange}
              placeholder="Target worldline (leave blank for current)"
            />
          </Form.Group>
        </Col>
      </Row>
      
      <Form.Group className="mb-3" data-testid="field-dmail-divergence">
        <Form.Label htmlFor="dmail-divergence">Divergence</Form.Label>
        <Form.Control
          id="dmail-divergence"
          type="number"
          step="0.000001"
          name="divergence"
          value={formData.divergence || 0}
          onChange={handleChange}
          placeholder="Divergence value"
        />
        <Form.Text className="text-muted">
          Estimated worldline divergence this D-Mail may cause
        </Form.Text>
      </Form.Group>
      
      <Form.Group className="mb-3" data-testid="field-dmail-status">
        <Form.Label htmlFor="dmail-status">Status</Form.Label>
        <Form.Select
          id="dmail-status"
          name="status"
          value={formData.status || 'draft'}
          onChange={handleChange}
          required
        >
          <option value="draft">Draft</option>
          <option value="sending">Sending</option>
          <option value="sent">Sent</option>
          <option value="received">Received</option>
          <option value="failed">Failed</option>
        </Form.Select>
      </Form.Group>
      
      <div className="d-flex justify-content-end">
        <Button variant="primary" type="submit" disabled={loading} data-testid="dmail-form-submit">
          {loading ? 'Processing...' : (mode === 'create' ? 'Send D-Mail' : 'Update D-Mail')}
        </Button>
      </div>
    </Form>
  );
};

const getStatusBadgeColor = (status) => {
  switch (status) {
    case 'draft':
      return 'secondary';
    case 'sending':
      return 'info';
    case 'sent':
      return 'primary';
    case 'received':
      return 'success';
    case 'failed':
      return 'danger';
    default:
      return 'light';
  }
};

export default DMails;