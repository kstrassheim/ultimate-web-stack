import React from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import './Home.css';

/**
 * Home component - Responsive homepage with feature cards
 */
const Home = () => {
  return (
    <div data-testid="home-page">
      <Container fluid>
        <Row className="mb-4 justify-content-center">
          <Col lg={8} md={10} xs={12} className="text-center">
            <h1 className="display-4 mb-3">Welcome to Ultimate Web Stack</h1>
            <p className="lead">A modern full-stack application built with React, FastAPI, and Azure integration.</p>
          </Col>
        </Row>
        
        <Row className="mb-5 g-4">
          {/* Original 6 features */}
          <Col lg={4} md={6} sm={12}>
            <Card className="h-100 shadow-sm feature-card">
              <Card.Body>
                <Card.Title>React Frontend</Card.Title>
                <Card.Text>
                  Modern UI built with React 18, React Router, Bootstrap, and Microsoft Authentication Library.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          
          <Col lg={4} md={6} sm={12}>
            <Card className="h-100 shadow-sm feature-card">
              <Card.Body>
                <Card.Title>FastAPI Backend</Card.Title>
                <Card.Text>
                  High-performance Python API with async support, automatic documentation, and role-based security.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          
          <Col lg={4} md={6} sm={12}>
            <Card className="h-100 shadow-sm feature-card">
              <Card.Body>
                <Card.Title>Real-time Features</Card.Title>
                <Card.Text>
                  Secure WebSocket connections with token authentication and role-based access control for real-time updates, notifications, and data streaming between clients.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          
          <Col lg={4} md={6} sm={12}>
            <Card className="h-100 shadow-sm feature-card">
              <Card.Body>
                <Card.Title>Comprehensive Testing</Card.Title>
                <Card.Text>
                  Jest for unit tests, React Testing Library for component tests, and Cypress for end-to-end testing.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          
          <Col lg={4} md={6} sm={12}>
            <Card className="h-100 shadow-sm feature-card">
              <Card.Body>
                <Card.Title>Azure Integration</Card.Title>
                <Card.Text>
                  Microsoft Entra ID (formerly Azure AD) authentication, Application Insights telemetry.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          
          <Col lg={4} md={6} sm={12}>
            <Card className="h-100 shadow-sm feature-card">
              <Card.Body>
                <Card.Title>Developer Experience</Card.Title>
                <Card.Text>
                  Hot module replacement, code splitting, and optimized build process.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          
          {/* New feature cards */}
          <Col lg={4} md={6} sm={12}>
            <Card className="h-100 shadow-sm feature-card">
              <Card.Body>
                <Card.Title>Role-Based Access Control</Card.Title>
                <Card.Text>
                  Secure components and API endpoints with fine-grained role-based permissions system.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          
          <Col lg={4} md={6} sm={12}>
            <Card className="h-100 shadow-sm feature-card">
              <Card.Body>
                <Card.Title>Advanced Visualizations</Card.Title>
                <Card.Text>
                  Interactive charts and data visualizations using ApexCharts with real-time updates.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          
          <Col lg={4} md={6} sm={12}>
            <Card className="h-100 shadow-sm feature-card">
              <Card.Body>
                <Card.Title>Responsive Design</Card.Title>
                <Card.Text>
                  Mobile-first layout with Bootstrap 5 ensuring optimal display across all device sizes.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          
          <Col lg={4} md={6} sm={12}>
            <Card className="h-100 shadow-sm feature-card">
              <Card.Body>
                <Card.Title>PWA Support</Card.Title>
                <Card.Text>
                  Progressive Web App capabilities with web manifest, enabling installation on supported devices.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          
          <Col lg={4} md={6} sm={12}>
            <Card className="h-100 shadow-sm feature-card">
              <Card.Body>
                <Card.Title>Centralized Error Handling</Card.Title>
                <Card.Text>
                  Comprehensive error tracking and notifications with Application Insights integration.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          
          <Col lg={4} md={6} sm={12}>
            <Card className="h-100 shadow-sm feature-card">
              <Card.Body>
                <Card.Title>Mock Data Infrastructure</Card.Title>
                <Card.Text>
                  Testing environment with mock authentication and API responses for development and testing.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Home;