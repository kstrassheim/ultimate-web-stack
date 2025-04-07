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
                  WebSocket connections for live updates and notifications between clients.
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
        </Row>
      </Container>
    </div>
  );
};

export default Home;