import { useState, useEffect, useRef } from 'react';
import { Card, Button, Table, Modal, Form, Badge, Row, Col, Alert } from 'react-bootstrap';
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
import Loading from '@/components/Loading';
import notyfService from '@/log/notyfService';

const Experiments = () => {
  const { instance } = useMsal();
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [currentExperiment, setCurrentExperiment] = useState(null);
  const [formMode, setFormMode] = useState('create'); // 'create' or 'edit'
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [experimentToDelete, setExperimentToDelete] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const initFetchCompleted = useRef(false);

  // Load experiments data
  const fetchExperiments = async () => {
    setLoading(true);
    setError(null);
    
    try {
      appInsights.trackEvent({ name: 'Experiments - Fetching all experiments' });
      const data = await getAllExperiments(instance);
      setExperiments(data);
      notyfService.success('Experiments loaded successfully');
    } catch (err) {
      setError(`Failed to load experiments: ${err.message}`);
      notyfService.error(`Failed to load experiments: ${err.message}`);
      // Add this line to track the exception in Application Insights
      appInsights.trackException({ error: err, severityLevel: 'Error' });
    } finally {
      setLoading(false);
    }
  };

  // Get single experiment by ID
  const fetchExperimentById = async (id) => {
    try {
      const data = await getExperimentById(instance, id);
      return data;
    } catch (err) {
      notyfService.error(`Failed to load experiment details: ${err.message}`);
      return null;
    }
  };

  // Create new experiment
  const handleCreateExperiment = async (experimentData) => {
    setLoading(true);
    try {
      await createExperiment(instance, experimentData);
      notyfService.success('Experiment created successfully');
      setShowForm(false);
      await fetchExperiments();
    } catch (err) {
      notyfService.error(`Failed to create experiment: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Update existing experiment
  const handleUpdateExperiment = async (id, experimentData) => {
    setLoading(true);
    try {
      await updateExperiment(instance, id, experimentData);
      notyfService.success('Experiment updated successfully');
      setShowForm(false);
      await fetchExperiments();
    } catch (err) {
      notyfService.error(`Failed to update experiment: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete experiment
  const handleDeleteExperiment = async () => {
    if (!experimentToDelete) return;
    setLoading(true);
    try {
      await deleteExperiment(instance, experimentToDelete.id);
      notyfService.success('Experiment deleted successfully');
      setShowDeleteModal(false);
      setExperimentToDelete(null);
      await fetchExperiments();
    } catch (err) {
      notyfService.error(`Failed to delete experiment: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle form submission
  const handleSubmit = (experimentData) => {
    if (formMode === 'create') {
      handleCreateExperiment(experimentData);
    } else {
      handleUpdateExperiment(currentExperiment.id, experimentData);
    }
  };

  // Open create form
  const openCreateForm = () => {
    setCurrentExperiment({
      name: '',
      description: '',
      status: 'planned',
      creator_id: instance.getActiveAccount()?.username || '',
      collaborators: [],
      results: ''
    });
    setFormMode('create');
    setShowForm(true);
  };

  // Open edit form
  const openEditForm = async (id) => {
    const experiment = await fetchExperimentById(id);
    if (experiment) {
      setCurrentExperiment(experiment);
      setFormMode('edit');
      setShowForm(true);
    }
  };

  // Open delete confirmation modal
  const openDeleteModal = (experiment) => {
    setExperimentToDelete(experiment);
    setShowDeleteModal(true);
  };

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    experimentsSocket.connect(instance);
    const unsubscribe = experimentsSocket.subscribe((message) => {
      if (!message?.rawData?.type || !message?.rawData?.data) return;
      
      if (message.rawData.type === 'create' && message.rawData.data) {
        // Make sure the data has an id before adding
        if (message.rawData.data.id) {
          setExperiments(prev => [...prev, message.rawData.data]);
          notyfService.info('New experiment created by another user');
        }
      } else if (message.rawData.type === 'update' && message.rawData.data) {
        // Make sure the data has an id before updating
        if (message.rawData.data.id) {
          setExperiments(prev => 
            prev.map(exp => exp.id === message.rawData.data.id ? message.rawData.data : exp)
          );
          notyfService.info('An experiment was updated by another user');
        }
      } else if (message.rawData.type === 'delete' && message.rawData.data) {
        // Make sure the data has an id before deleting
        if (message.rawData.data.id) {
          setExperiments(prev => 
            prev.filter(exp => exp.id !== message.rawData.data.id)
          );
          notyfService.info('An experiment was deleted by another user');
        }
      }
    });
    const unsubscribeStatus = experimentsSocket.subscribeToStatus((status) => {
      if (status) {
        setConnectionStatus(status);
      }
    });
    if (!initFetchCompleted.current) {
      fetchExperiments();
      initFetchCompleted.current = true;
    }
    return () => {
      unsubscribe();
      unsubscribeStatus();
      experimentsSocket.disconnect();
    };
  }, [instance]);

  return (
    <div data-testid="experiments-page">
      <h1 data-testid="experiments-heading">Future Gadget Lab Experiments</h1>
      
      {/* Loading overlay already provides data-testid="loading-overlay" */}
      <Loading visible={loading} message="Processing experiment data..." />
      
      <div className="mb-3" data-testid="connection-status">
        <span className="me-2">WebSocket Status:</span>
        <Badge bg={connectionStatus === 'connected' ? 'success' : 'danger'} data-testid="status-badge">
          {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
        </Badge>
      </div>
      
      {error && (
        <Alert variant="danger" className="mb-3" data-testid="experiments-error">
          {error}
        </Alert>
      )}
      
      <Card className="mb-4" data-testid="experiments-card">
        <Card.Header
          className="d-flex justify-content-between align-items-center"
          data-testid="experiments-card-header"
        >
          <span>All Experiments</span>
          <div>
            <Button
              variant="primary"
              size="sm"
              className="me-2"
              onClick={openCreateForm}
              disabled={loading}
              data-testid="new-experiment-btn"
            >
              New Experiment
            </Button>
            <Button
              variant="outline-primary"
              size="sm"
              onClick={fetchExperiments}
              disabled={loading}
              data-testid="reload-experiments-btn"
            >
              Reload
            </Button>
          </div>
        </Card.Header>
        <Card.Body>
          {experiments.length > 0 ? (
            <Table striped bordered hover responsive data-testid="experiments-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Creator</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map(exp => (
                  <tr key={exp.id} data-testid={`experiment-row-${exp.id}`}>
                    <td>{exp.name}</td>
                    <td>
                      <Badge bg={getStatusBadgeColor(exp.status)} data-testid="experiment-status">
                        {exp.status}
                      </Badge>
                    </td>
                    <td>{exp.creator_id}</td>
                    <td>{exp.description}</td>
                    <td className="d-flex justify-content-around" data-testid="experiment-actions">
                      <Button
                        variant="outline-info"
                        size="sm"
                        onClick={() => openEditForm(exp.id)}
                        data-testid={`edit-btn-${exp.id}`}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => openDeleteModal(exp)}
                        data-testid={`delete-btn-${exp.id}`}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : !loading && (
            <div className="text-center p-4" data-testid="no-experiments">
              <p className="text-muted">No experiments found.</p>
              <Button variant="primary" onClick={openCreateForm} data-testid="create-first-experiment-btn">
                Create your first experiment
              </Button>
            </div>
          )}
        </Card.Body>
      </Card>
      
      {/* Experiment Form Modal */}
      <Modal show={showForm} onHide={() => setShowForm(false)} size="lg" data-testid="experiment-form-modal">
        <Modal.Header closeButton>
          <h4 className="modal-title" data-testid="experiment-form-title">
            {formMode === 'create' ? 'Create New Experiment' : 'Edit Experiment'}
          </h4>
        </Modal.Header>
        <Modal.Body>
          <ExperimentForm 
            experiment={currentExperiment} 
            onSubmit={handleSubmit} 
            mode={formMode}
            loading={loading}
            data-testid="experiment-form"
          />
        </Modal.Body>
      </Modal>
      
      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} data-testid="delete-confirmation-modal">
        <Modal.Header closeButton>
          <Modal.Title>Confirm Deletion</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Are you sure you want to delete the experiment <strong data-testid="delete-experiment-name">{experimentToDelete?.name}</strong>?</p>
          <p className="text-danger">This action cannot be undone.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)} data-testid="cancel-delete-btn">
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteExperiment} disabled={loading} data-testid="confirm-delete-btn">
            {loading ? 'Deleting...' : 'Delete Experiment'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

// Helper component for experiment form
const ExperimentForm = ({ experiment, onSubmit, mode, loading }) => {
  const [formData, setFormData] = useState(experiment || {});
  const [validated, setValidated] = useState(false);
  
  useEffect(() => {
    if (experiment) {
      setFormData(experiment);
    }
  }, [experiment]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleCollaboratorsChange = (e) => {
    const collaborators = e.target.value.split(',').map(item => item.trim()).filter(Boolean);
    setFormData(prev => ({ ...prev, collaborators }));
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
    <Form noValidate validated={validated} onSubmit={handleSubmit} data-testid="experiment-form-element">
      <Form.Group className="mb-3" data-testid="field-experiment-name">
        <Form.Label htmlFor="experiment-name">Experiment Name</Form.Label>
        <Form.Control
          id="experiment-name"
          type="text"
          name="name"
          value={formData.name || ''}
          onChange={handleChange}
          required
          placeholder="Enter experiment name"
        />
        <Form.Control.Feedback type="invalid">
          Please provide an experiment name.
        </Form.Control.Feedback>
      </Form.Group>
      
      <Form.Group className="mb-3" data-testid="field-experiment-description">
        <Form.Label htmlFor="experiment-description">Description</Form.Label>
        <Form.Control
          id="experiment-description"
          as="textarea"
          rows={3}
          name="description"
          value={formData.description || ''}
          onChange={handleChange}
          required
          placeholder="Describe the experiment"
        />
        <Form.Control.Feedback type="invalid">
          Please provide a description.
        </Form.Control.Feedback>
      </Form.Group>
      
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3" data-testid="field-experiment-status">
            <Form.Label htmlFor="experiment-status">Status</Form.Label>
            <Form.Select
              id="experiment-status"
              name="status"
              value={formData.status || 'planned'}
              onChange={handleChange}
              required
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="abandoned">Abandoned</option>
            </Form.Select>
          </Form.Group>
        </Col>
        
        <Col md={6}>
          <Form.Group className="mb-3" data-testid="field-experiment-creator">
            <Form.Label htmlFor="experiment-creator">Creator ID</Form.Label>
            <Form.Control
              id="experiment-creator"
              type="text"
              name="creator_id"
              value={formData.creator_id || ''}
              onChange={handleChange}
              required
              placeholder="Enter creator ID"
            />
          </Form.Group>
        </Col>
      </Row>
      
      <Form.Group className="mb-3" data-testid="field-experiment-collaborators">
        <Form.Label htmlFor="experiment-collaborators">Collaborators (comma-separated)</Form.Label>
        <Form.Control
          id="experiment-collaborators"
          type="text"
          name="collaborators"
          value={formData.collaborators ? formData.collaborators.join(', ') : ''}
          onChange={handleCollaboratorsChange}
          placeholder="Enter collaborator IDs separated by commas"
        />
      </Form.Group>
      
      <Form.Group className="mb-3" data-testid="field-experiment-results">
        <Form.Label htmlFor="experiment-results">Results</Form.Label>
        <Form.Control
          id="experiment-results"
          as="textarea"
          rows={3}
          name="results"
          value={formData.results || ''}
          onChange={handleChange}
          placeholder="Enter experiment results if available"
        />
      </Form.Group>
      
      <div className="d-flex justify-content-end">
        <Button variant="primary" type="submit" disabled={loading} data-testid="experiment-form-submit">
          {loading ? 'Saving...' : (mode === 'create' ? 'Create Experiment' : 'Update Experiment')}
        </Button>
      </div>
    </Form>
  );
};

const getStatusBadgeColor = (status) => {
  switch (status) {
    case 'planned':
      return 'info';
    case 'in_progress':
      return 'primary';
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'abandoned':
      return 'secondary';
    default:
      return 'light';
  }
};

export default Experiments;