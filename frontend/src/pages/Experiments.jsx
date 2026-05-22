import { useState, useEffect, useRef } from 'react';
import { Card, Button, Table, Modal, Form, Badge, Row, Col, Alert } from 'react-bootstrap';
import { useMsal } from '@azure/msal-react';
import { 
  getAllExperiments, 
  getExperimentById, 
  createExperiment, 
  updateExperiment, 
  deleteExperiment,
  experimentsSocket,
  formatExperimentTimestamp,
  formatWorldLineChange
} from '@/api/futureGadgetApi';
import appInsights from '@/log/appInsights';
import Loading from '@/components/Loading';
import notyfService from '@/log/notyfService';

const Experiments = () => {
  const { instance } = useMsal();
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [currentExperiment, setCurrentExperiment] = useState(null);
  const [formMode, setFormMode] = useState('create'); // 'create' or 'edit'
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [experimentToDelete, setExperimentToDelete] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const initFetchCompleted = useRef(false);
  const [initialised, setInitialised] = useState(false);

  // Load experiments data
  const fetchExperiments = async (showMessage = false) => {
  setLoading(true);
    setError(null);
    
    try {
      appInsights.trackEvent({ name: 'Experiments - Fetching all experiments' });
      const data = await getAllExperiments(instance);
      setExperiments(data);
      
      // Only show success message when explicitly requested (e.g., when Reload button is clicked)
      if (showMessage) {
        notyfService.success('Experiments loaded successfully');
      }
    } catch (err) {
      setError(`Failed to load experiments: ${err.message}`);
      notyfService.error(`Failed to load experiments: ${err.message}`);
      appInsights.trackException({ error: err, severityLevel: 'Error' });
    } finally {
      setLoading(false);
      setInitialised(true);
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
    setActionLoading(true);
    try {
      await createExperiment(instance, experimentData);
      notyfService.success('Experiment created successfully');
      setShowForm(false);
      await fetchExperiments(false); // Don't show "loaded" message after create
    } catch (err) {
      notyfService.error(`Failed to create experiment: ${err.message}`);
    } finally {
      setLoading(false);
      setActionLoading(false);
    }
  };

  // Update existing experiment
  const handleUpdateExperiment = async (id, experimentData) => {
    setLoading(true);
    setActionLoading(true);
    try {
      await updateExperiment(instance, id, experimentData);
      notyfService.success('Experiment updated successfully');
      setShowForm(false);
      await fetchExperiments(false); // Don't show "loaded" message after update
    } catch (err) {
      notyfService.error(`Failed to update experiment: ${err.message}`);
    } finally {
      setLoading(false);
      setActionLoading(false);
    }
  };

  // Delete experiment
  const handleDeleteExperiment = async () => {
    if (!experimentToDelete) return;
    setLoading(true);
    setActionLoading(true);
    try {
      await deleteExperiment(instance, experimentToDelete.id);
      notyfService.success('Experiment deleted successfully');
      setShowDeleteModal(false);
      setExperimentToDelete(null);
      await fetchExperiments(false); // Don't show "loaded" message after delete
    } catch (err) {
      notyfService.error(`Failed to delete experiment: ${err.message}`);
    } finally {
      setLoading(false);
      setActionLoading(false);
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

  // Update the openCreateForm function to not set a timestamp initially
  const openCreateForm = () => {
    setCurrentExperiment({
      name: '',
      description: '',
      status: 'planned',
      creator_id: instance.getActiveAccount()?.username || '',
      collaborators: [],
      results: '',
      world_line_change: 0.0, // Default value for new experiments
      timestamp: '' // Explicitly set to empty string
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
      console.log("WebSocket message received:", message);
      
      // First, determine the structure of the message and extract relevant parts
      let type, data;
      if (message.rawData) {
        // Original expected format with rawData wrapper
        type = message.rawData.type;
        data = message.rawData;
      } else if (message.type) {
        // Direct format from the server
        type = message.type;
        data = message; // The whole message is the data
      } else {
        // Unknown format
        console.error("Unknown WebSocket message format:", message);
        return;
      }
      
      if (!type || !data || !data.id) return;
      
      // Get current user's email, not just username
      const currentUserEmail = instance.getActiveAccount()?.username;
      
      // Check if the action was performed by the current user - compare emails
      const isOwnAction = data.actor === currentUserEmail;
      
      console.log("User comparison:", {
        currentUserEmail,
        actor: data.actor,
        isOwnAction
      });

      // Create new experiment
      if (type === 'create') {
        // Always update the data in the grid
        setExperiments(prev => {
          // Check if the experiment already exists to avoid duplicates
          if (prev.some(exp => exp.id === data.id)) {
            return prev;
          }
          return [...prev, data];
        });
        
        // Only show notification if it was another user's action
        if (!isOwnAction) {
          notyfService.info(`New experiment "${data.name}" created by ${formatUsername(data.actor)}`);
        }
      } 
      // Update existing experiment
      else if (type === 'update') {
        // Always update the grid data
        setExperiments(prev => 
          prev.map(exp => exp.id === data.id ? data : exp)
        );
        
        // Update the current experiment in the form if it's being edited
        if (showForm && currentExperiment && currentExperiment.id === data.id) {
          setCurrentExperiment(data);
          
          // Alert the user if they're currently editing this experiment
          if (!isOwnAction && formMode === 'edit') {
            notyfService.warning(`This experiment has been updated by ${formatUsername(data.actor)}. Your form has been refreshed with the latest data.`);
          }
        } 
        // Only show notification for other users' actions if not currently editing that item
        else if (!isOwnAction) {
          notyfService.info(`Experiment "${data.name}" updated by ${formatUsername(data.actor)}`);
        }
      } 
      // Delete experiment
      else if (type === 'delete') {
        // Always update the grid
        setExperiments(prev => 
          prev.filter(exp => exp.id !== data.id)
        );
        
        // Close the form if the experiment being edited was deleted
        if (showForm && currentExperiment && currentExperiment.id === data.id) {
          setShowForm(false);
          if (!isOwnAction) {
            notyfService.warning(`The experiment you were editing has been deleted by ${formatUsername(data.actor)}`);
          }
        } 
        // Only show notification for other users' actions
        else if (!isOwnAction) {
          notyfService.info(`Experiment "${data.name}" deleted by ${formatUsername(data.actor)}`);
        }
      }
    });
    
    // Rest of the code remains the same
    const unsubscribeStatus = experimentsSocket.subscribeToStatus((status) => {
      if (status) {
        setConnectionStatus(status);
      }
    });
    
    if (!initFetchCompleted.current) {
      fetchExperiments(false).finally(() => {
        initFetchCompleted.current = true;
      });
    }
    
    return () => {
      unsubscribe();
      unsubscribeStatus();
      experimentsSocket.disconnect();
    };
  }, [instance, showForm, currentExperiment, formMode]);

  return (
    <div data-testid="experiments-page">
      <Loading visible={loading} message="Processing experiment data..." />

      {initialised && (
        <>
          <h1 data-testid="experiments-heading">Future Gadget Lab Experiments</h1>
          
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
                  disabled={actionLoading}
                  data-testid="new-experiment-btn"
                >
                  New Experiment
                </Button>
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => fetchExperiments(true)} // Show message when explicitly reloading
                  disabled={loading || actionLoading}
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
                      <th className="d-none d-lg-table-cell">Creator</th>
                      <th className="d-none d-lg-table-cell">World Line Change</th>
                      <th className="d-none d-sm-table-cell">Timestamp</th>
                      <th className="d-none d-md-table-cell">Description</th>
                      <th style={{ width: '120px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {experiments.map(exp => (
                      <tr key={exp.id} data-testid={`experiment-row-${exp.id}`}>
                        <td className="text-break">{exp.name}</td>
                        
                        <td>
                          <Badge bg={getStatusBadgeColor(exp.status)} data-testid="experiment-status">
                            {exp.status}
                          </Badge>
                        </td>
                        
                        <td className="d-none d-lg-table-cell">{exp.creator_id}</td>
                        
                        <td className="d-none d-lg-table-cell" data-testid="experiment-worldline">
                          {formatWorldLineChange(exp.world_line_change)}
                        </td>
                        
                        <td className="d-none d-sm-table-cell" data-testid="experiment-timestamp">
                          {formatExperimentTimestamp(exp)}
                        </td>
                        
                        <td className="d-none d-md-table-cell text-break">{exp.description}</td>
                        
                        <td className="p-0" data-testid="experiment-actions">
                          <div className="d-flex flex-column h-100">
                            <Button
                              variant="outline-info"
                              size="sm"
                              className="flex-grow-1 m-1 d-flex align-items-center justify-content-center"
                              onClick={() => openEditForm(exp.id)}
                              data-testid={`edit-btn-${exp.id}`}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              className="flex-grow-1 m-1 d-flex align-items-center justify-content-center"
                              onClick={() => openDeleteModal(exp)}
                              data-testid={`delete-btn-${exp.id}`}
                            >
                              Delete
                            </Button>
                          </div>
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
        </>
      )}
      
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
  const [timestampError, setTimestampError] = useState('');
  
  useEffect(() => {
    if (experiment) {
      setFormData(experiment);
    }
  }, [experiment]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Special handling for timestamp to validate ISO format
    if (name === 'timestamp') {
      setTimestampError('');
      if (value && !isValidISODate(value)) {
        setTimestampError('Please enter a valid ISO date (e.g., YYYY-MM-DDTHH:MM:SS.sssZ)');
      }
    }
    
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // Validate if a string is a valid ISO date
  const isValidISODate = (dateString) => {
    if (!dateString) return true; // Empty is valid (will be auto-generated)
    
    // Basic ISO format regex: YYYY-MM-DDTHH:MM:SS.sssZ
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    
    if (!isoDatePattern.test(dateString)) {
      return false;
    }
    
    // Additional validation: Check if it's a valid date by trying to parse it
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  };
  
  const handleCollaboratorsChange = (e) => {
    const collaborators = e.target.value.split(',').map(item => item.trim()).filter(Boolean);
    setFormData(prev => ({ ...prev, collaborators }));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    
    // Custom validation for timestamp
    if (formData.timestamp && !isValidISODate(formData.timestamp)) {
      setTimestampError('Please enter a valid ISO date format');
      e.stopPropagation();
      return;
    }
    
    if (form.checkValidity() === false) {
      e.stopPropagation();
      setValidated(true);
      return;
    }
    
    onSubmit(formData);
  };
  
  // Helper function to get current time in ISO format
  const getCurrentISOTime = () => {
    return new Date().toISOString();
  };
  
  // Add a function to set current timestamp
  const setCurrentTimestamp = () => {
    setFormData(prev => ({ ...prev, timestamp: getCurrentISOTime() }));
    setTimestampError('');
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
      
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3" data-testid="field-experiment-world-line-change">
            <Form.Label htmlFor="experiment-world-line-change">World Line Change</Form.Label>
            <Form.Control
              id="experiment-world-line-change"
              type="number"
              step="0.000001"
              name="world_line_change"
              value={formData.world_line_change || 0}
              onChange={handleChange}
              placeholder="Enter world line change value (e.g., 0.337192)"
            />
            <Form.Text className="text-muted">
              Enter the divergence value caused by this experiment (e.g., 0.337192)
            </Form.Text>
          </Form.Group>
        </Col>
        
        <Col md={6}>
          <Form.Group className="mb-3" data-testid="field-experiment-timestamp">
            <Form.Label htmlFor="experiment-timestamp">Timestamp</Form.Label>
            <div className="input-group">
              <Form.Control
                id="experiment-timestamp"
                type="text"
                name="timestamp"
                value={formData.timestamp || ''}
                onChange={handleChange}
                disabled={mode === 'edit'} // Only allow setting timestamp on creation
                placeholder="Auto-generated on creation"
                isInvalid={!!timestampError}
                pattern="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?"
                title="ISO date format: YYYY-MM-DDTHH:MM:SS.sssZ"
              />
              {mode === 'create' && (
                <Button 
                  variant="outline-secondary" 
                  onClick={setCurrentTimestamp}
                  title="Set current time"
                >
                  Now
                </Button>
              )}
              <Form.Control.Feedback type="invalid">
                {timestampError}
              </Form.Control.Feedback>
            </div>
            <Form.Text className="text-muted">
              {mode === 'edit' 
                ? 'Timestamp cannot be modified after creation' 
                : 'Format: YYYY-MM-DDTHH:MM:SS.sssZ (will be auto-generated if left empty)'}
            </Form.Text>
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

// Helper function to format usernames for display
const formatUsername = (username) => {
  if (!username) return 'Unknown user';
  // Extract name from email if it's an email address
  const emailMatch = username.match(/^([^@]+)@/);
  if (emailMatch) {
    return emailMatch[1].replace('.', ' ');
  }
  return username;
};

export default Experiments;