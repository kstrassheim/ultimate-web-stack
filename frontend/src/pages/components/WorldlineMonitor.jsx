import React, { useState, useEffect, useRef } from 'react';
import { Card, Table, Badge, Row, Col, Form, InputGroup, Button, Alert } from 'react-bootstrap';
import { useMsal } from '@azure/msal-react';
import { 
  getWorldlineStatus, 
  getWorldlineHistory, 
  getDivergenceReadings,
  worldlineSocket,
  formatDivergenceReading,
  formatWorldLineChange
} from '@/api/futureGadgetApi';
import appInsights from '@/log/appInsights';
import Loading from '@/components/Loading';
import notyfService from '@/log/notyfService';

// Helper function to get status color
const getStatusColor = (status) => {
  const statusMap = {
    'alpha': 'danger',
    'beta': 'warning',
    'steins_gate': 'success',
    'delta': 'info',
    'gamma': 'primary',
    'omega': 'dark'
  };
  return statusMap[status] || 'secondary';
};

const WorldlineMonitor = () => {
  const { instance } = useMsal();
  const [worldlineStatus, setWorldlineStatus] = useState(null);
  const [worldlineHistory, setWorldlineHistory] = useState([]);
  const [readings, setReadings] = useState([]);
  const [filteredReadings, setFilteredReadings] = useState([]);
  const [filters, setFilters] = useState({
    status: '',
    recordedBy: '',
    minValue: '',
    maxValue: ''
  });
  const [loading, setLoading] = useState({
    status: false,
    history: false,
    readings: false
  });
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const historyChartRef = useRef(null);

  // Fetch current worldline status
  const fetchWorldlineStatus = async () => {
    setLoading(prev => ({ ...prev, status: true }));
    setError(null);
    
    try {
      appInsights.trackEvent({ name: 'Worldline - Fetching current status' });
      const data = await getWorldlineStatus(instance);
      setWorldlineStatus(data);
    } catch (err) {
      setError(`Failed to load worldline status: ${err.message}`);
      notyfService.error(`Failed to load worldline status: ${err.message}`);
      appInsights.trackException({ error: err });
    } finally {
      setLoading(prev => ({ ...prev, status: false }));
    }
  };

  // Fetch worldline history
  const fetchWorldlineHistory = async () => {
    setLoading(prev => ({ ...prev, history: true }));
    
    try {
      appInsights.trackEvent({ name: 'Worldline - Fetching history' });
      const data = await getWorldlineHistory(instance);
      setWorldlineHistory(data);
    } catch (err) {
      notyfService.error(`Failed to load worldline history: ${err.message}`);
      appInsights.trackException({ error: err });
    } finally {
      setLoading(prev => ({ ...prev, history: false }));
    }
  };

  // Fetch divergence readings
  const fetchDivergenceReadings = async () => {
    setLoading(prev => ({ ...prev, readings: true }));
    
    try {
      appInsights.trackEvent({ name: 'Worldline - Fetching divergence readings' });
      const data = await getDivergenceReadings(instance);
      setReadings(data);
      setFilteredReadings(data);
    } catch (err) {
      notyfService.error(`Failed to load divergence readings: ${err.message}`);
      appInsights.trackException({ error: err });
    } finally {
      setLoading(prev => ({ ...prev, readings: false }));
    }
  };

  // Apply filters to readings
  const applyFilters = () => {
    let filtered = [...readings];
    
    if (filters.status) {
      filtered = filtered.filter(r => r.status === filters.status);
    }
    
    if (filters.recordedBy) {
      filtered = filtered.filter(r => 
        r.recorded_by?.toLowerCase().includes(filters.recordedBy.toLowerCase())
      );
    }
    
    if (filters.minValue && !isNaN(parseFloat(filters.minValue))) {
      const min = parseFloat(filters.minValue);
      filtered = filtered.filter(r => {
        const value = parseFloat(r.reading || r.value || 0);
        return value >= min;
      });
    }
    
    if (filters.maxValue && !isNaN(parseFloat(filters.maxValue))) {
      const max = parseFloat(filters.maxValue);
      filtered = filtered.filter(r => {
        const value = parseFloat(r.reading || r.value || 0);
        return value <= max;
      });
    }
    
    setFilteredReadings(filtered);
  };

  // Handle filter changes
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Reset filters
  const resetFilters = () => {
    setFilters({
      status: '',
      recordedBy: '',
      minValue: '',
      maxValue: ''
    });
    setFilteredReadings(readings);
  };

  // Set up WebSocket for real-time updates
  useEffect(() => {
    // Initial data fetch
    fetchWorldlineStatus();
    fetchWorldlineHistory();
    fetchDivergenceReadings();
    
    // Set up WebSocket connection
    worldlineSocket.connect(instance);
    
    // Subscribe to worldline status updates
    const unsubscribe = worldlineSocket.subscribe((message) => {
      console.log("Worldline WebSocket message received:", message);
      
      // Determine the structure of the message
      let worldlineData;
      if (message.rawData) {
        worldlineData = message.rawData;
      } else {
        worldlineData = message;
      }
      
      // Update the worldline status
      if (worldlineData.current_worldline) {
        setWorldlineStatus(worldlineData);
        
        if (worldlineData.includes_preview) {
          notyfService.info(`Previewing worldline change from: ${worldlineData.preview_experiment?.name}`);
        } else {
          notyfService.info("Worldline status updated");
        }
      }
    });
    
    // Subscribe to connection status updates
    const unsubscribeStatus = worldlineSocket.subscribeToStatus((status) => {
      if (status) {
        setConnectionStatus(status);
      }
    });
    
    return () => {
      unsubscribe();
      unsubscribeStatus();
      worldlineSocket.disconnect();
    };
  }, [instance]);

  // Apply filters when filters change
  useEffect(() => {
    applyFilters();
  }, [filters, readings]);

  return (
    <div data-testid="worldline-monitor" className="worldline-monitor">
      <h1>
        Divergence Meter
        <div className="ms-3 d-inline-block">
          <Badge bg={connectionStatus === 'connected' ? 'success' : 'danger'} data-testid="ws-status-badge">
            {connectionStatus === 'connected' ? 'Live' : 'Offline'}
          </Badge>
        </div>
      </h1>
      
      <Loading visible={loading.status || loading.history || loading.readings} message="Processing worldline data..." />
      
      {error && (
        <Alert variant="danger" className="mb-3" data-testid="worldline-error">
          {error}
        </Alert>
      )}
      
      <Row className="mb-4">
        <Col lg={6}>
          {/* Current Worldline Status Card */}
          <Card className="mb-4 h-100" data-testid="worldline-status-card">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span>Current Worldline Status</span>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={fetchWorldlineStatus}
                disabled={loading.status}
                data-testid="refresh-status-btn"
              >
                Refresh
              </Button>
            </Card.Header>
            <Card.Body>
              {worldlineStatus ? (
                <div className="text-center">
                  <div className="divergence-meter mb-3">
                    <h2 data-testid="worldline-value" className="display-4">
                      {worldlineStatus.current_worldline.toFixed(6)}
                    </h2>
                    <div className="divergence-badge">
                      {worldlineStatus.closest_reading && (
                        <Badge 
                          bg={getStatusColor(worldlineStatus.closest_reading.status)} 
                          className="fs-5 px-3 py-2"
                          data-testid="worldline-badge"
                        >
                          {worldlineStatus.closest_reading.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="d-flex justify-content-around text-center my-4">
                    <div>
                      <div className="text-muted">Base</div>
                      <div className="fs-5">{worldlineStatus.base_worldline.toFixed(6)}</div>
                    </div>
                    <div>
                      <div className="text-muted">Divergence</div>
                      <div className="fs-5">{formatWorldLineChange(worldlineStatus.total_divergence)}</div>
                    </div>
                    <div>
                      <div className="text-muted">Experiments</div>
                      <div className="fs-5">{worldlineStatus.experiment_count}</div>
                    </div>
                  </div>
                  
                  {worldlineStatus.closest_reading && (
                    <div className="closest-reading mt-4 text-start">
                      <h5>Closest Known Reading:</h5>
                      <div className="px-3">
                        <div><strong>Value:</strong> {worldlineStatus.closest_reading.value.toFixed(6)}</div>
                        <div><strong>Recorded By:</strong> {worldlineStatus.closest_reading.recorded_by}</div>
                        <div><strong>Notes:</strong> {worldlineStatus.closest_reading.notes}</div>
                        <div><strong>Distance:</strong> {worldlineStatus.closest_reading.distance.toFixed(6)}</div>
                      </div>
                    </div>
                  )}
                  
                  <div className="timestamp text-muted mt-3">
                    Last updated: {new Date(worldlineStatus.timestamp).toLocaleString()}
                  </div>
                </div>
              ) : !loading.status && (
                <div className="text-center p-4" data-testid="no-worldline-status">
                  <p className="text-muted">No worldline status available.</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
        
        <Col lg={6}>
          {/* Worldline History Card */}
          <Card className="mb-4 h-100" data-testid="worldline-history-card">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span>Worldline History</span>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={fetchWorldlineHistory}
                disabled={loading.history}
                data-testid="refresh-history-btn"
              >
                Refresh
              </Button>
            </Card.Header>
            <Card.Body className="worldline-history">
              {worldlineHistory.length > 0 ? (
                <div>
                  <div className="worldline-progression mb-4">
                    {/* Simple visualization of worldline changes */}
                    <div className="progress-container">
                      {worldlineHistory.map((point, index) => (
                        <div key={index} className="history-point" style={{ opacity: index === 0 ? 0.6 : 1 }}>
                          <div className="history-worldline">
                            <Badge 
                              bg={index === 0 ? 'secondary' : 'primary'} 
                              className="px-2 py-1 mb-1"
                            >
                              {point.current_worldline.toFixed(6)}
                            </Badge>
                          </div>
                          <div className="history-info small text-truncate">
                            {index === 0 ? 'Base' : `Experiment ${index}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="history-table-container">
                    <Table striped bordered hover size="sm">
                      <thead>
                        <tr>
                          <th>Step</th>
                          <th>Worldline</th>
                          <th>Change</th>
                          <th>Total Divergence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {worldlineHistory.map((point, index) => (
                          <tr key={index}>
                            <td>{index === 0 ? 'Base' : `Exp ${index}`}</td>
                            <td>{point.current_worldline.toFixed(6)}</td>
                            <td>
                              {index === 0 ? 'N/A' : formatWorldLineChange(
                                point.current_worldline - worldlineHistory[index - 1].current_worldline
                              )}
                            </td>
                            <td>{formatWorldLineChange(point.total_divergence)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </div>
              ) : !loading.history && (
                <div className="text-center p-4" data-testid="no-worldline-history">
                  <p className="text-muted">No worldline history available.</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
      
      {/* Divergence Readings Card */}
      <Card className="mb-4" data-testid="divergence-readings-card">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <span>Divergence Meter Readings</span>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={fetchDivergenceReadings}
            disabled={loading.readings}
            data-testid="refresh-readings-btn"
          >
            Refresh
          </Button>
        </Card.Header>
        <Card.Body>
          {/* Filters */}
          <div className="filters mb-3">
            <Row>
              <Col md={3} className="mb-2">
                <Form.Group>
                  <Form.Label>Status</Form.Label>
                  <Form.Select
                    name="status"
                    value={filters.status}
                    onChange={handleFilterChange}
                    data-testid="status-filter"
                  >
                    <option value="">All</option>
                    <option value="alpha">Alpha</option>
                    <option value="beta">Beta</option>
                    <option value="steins_gate">Steins;Gate</option>
                    <option value="delta">Delta</option>
                    <option value="gamma">Gamma</option>
                    <option value="omega">Omega</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={3} className="mb-2">
                <Form.Group>
                  <Form.Label>Recorded By</Form.Label>
                  <Form.Control
                    type="text"
                    name="recordedBy"
                    value={filters.recordedBy}
                    onChange={handleFilterChange}
                    data-testid="recorded-by-filter"
                  />
                </Form.Group>
              </Col>
              <Col md={3} className="mb-2">
                <Form.Group>
                  <Form.Label>Min Value</Form.Label>
                  <Form.Control
                    type="number"
                    step="0.000001"
                    name="minValue"
                    value={filters.minValue}
                    onChange={handleFilterChange}
                    data-testid="min-value-filter"
                  />
                </Form.Group>
              </Col>
              <Col md={3} className="mb-2">
                <Form.Group>
                  <Form.Label>Max Value</Form.Label>
                  <Form.Control
                    type="number"
                    step="0.000001"
                    name="maxValue"
                    value={filters.maxValue}
                    onChange={handleFilterChange}
                    data-testid="max-value-filter"
                  />
                </Form.Group>
              </Col>
            </Row>
            <div className="text-end">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={resetFilters}
                data-testid="reset-filters-btn"
              >
                Reset Filters
              </Button>
            </div>
          </div>
          
          {/* Readings Table */}
          {filteredReadings.length > 0 ? (
            <Table striped bordered hover responsive data-testid="readings-table">
              <thead>
                <tr>
                  <th>Reading</th>
                  <th>Status</th>
                  <th>Recorded By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredReadings.map(reading => (
                  <tr key={reading.id} data-testid={`reading-row-${reading.id}`}>
                    <td>{formatDivergenceReading(reading)}</td>
                    <td>
                      <Badge bg={getStatusColor(reading.status)} data-testid="reading-status-badge">
                        {reading.status}
                      </Badge>
                    </td>
                    <td>{reading.recorded_by}</td>
                    <td className="text-truncate" style={{ maxWidth: '300px' }}>{reading.notes}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : !loading.readings && (
            <div className="text-center p-4" data-testid="no-readings">
              <p className="text-muted">No divergence readings found.</p>
            </div>
          )}
        </Card.Body>
      </Card>
      
      {/* Custom CSS for this component */}
      <style jsx>{`
        .divergence-meter {
          font-family: monospace;
          background-color: rgba(0, 0, 0, 0.05);
          border-radius: 8px;
          padding: 15px;
          position: relative;
        }
        
        .divergence-badge {
          margin-top: 10px;
        }
        
        .worldline-progression {
          overflow-x: auto;
          padding: 20px 0;
        }
        
        .progress-container {
          display: flex;
          align-items: center;
          min-width: 100%;
          position: relative;
          padding: 20px 0;
        }
        
        .progress-container::before {
          content: '';
          position: absolute;
          height: 2px;
          background-color: #dee2e6;
          top: 50%;
          left: 0;
          right: 0;
          z-index: 0;
        }
        
        .history-point {
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 1;
          background-color: white;
          margin-right: 20px;
        }
        
        .history-info {
          max-width: 100px;
          text-align: center;
        }
        
        .history-table-container {
          max-height: 300px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
};

export default WorldlineMonitor;