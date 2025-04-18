import { Routes, Route, Link } from "react-router-dom";
import { Navbar, Nav, Container, NavDropdown } from 'react-bootstrap';
import '@/App.css';
// get the components
import NotFound from '@/pages/404';
import EntraProfile from '@/components/EntraProfile';
import AccessDenied from '@/pages/AccessDenied';
import ProtectedRoute from "@/components/ProtectedRoute";
import ProtectedLink from "@/components/ProtectedLink";
// get the pages
import Home from '@/pages/Home';
import Dashboard from '@/pages/Dashboard';
import Chat from '@/pages/Chat';
// Add new imports for Experiments and DMails
import Experiments from '@/pages/Experiments';

function App() {
  return (
    <>
      <Navbar bg="dark" variant="dark" data-bs-theme="dark"  expand="lg" data-testid="main-navigation">
        <Container className="position-relative">
          {/* Logo and brand */}
          <Navbar.Brand as="div" className="d-flex align-items-center">
            <a href="https://github.com/kstrassheim/ultimate-web-stack" target="_blank" data-testid="logo-link" className="me-2">
              <img src='logo.png' height="30" className="d-inline-block align-top" alt="logo" data-testid="logo-image" />
            </a>
            {document.title}
          </Navbar.Brand>
          {/* Place profile outside collapse, but still in the right position */}
          <div className="d-flex ms-auto me-1 order-lg-last" data-testid="auth-navigation">
            <EntraProfile data-testid="entra-profile" />
          </div>
                    
          {/* Hamburger toggle button */}
          <Navbar.Toggle 
            aria-controls="basic-navbar-nav"
            className="border border-secondary navbar-dark"
            variant="dark"
            style={{ 
              boxShadow: 'none', 
              backgroundColor: 'transparent',
              borderColor: 'rgba(255, 255, 255, 0.2) !important' 
            }}
          />
          {/* Collapsible navigation content */}
          <Navbar.Collapse id="basic-navbar-nav" className="order-lg-2">
            {/* Main navigation links */}
            <Nav className="me-auto" data-testid="page-navigation">
              <Nav.Link as={Link} to="/" data-testid="nav-home">Home</Nav.Link>
              <Nav.Link as={Link} to="/dashboard" data-testid="nav-dashboard">Dashboard</Nav.Link>
              <Nav.Link as={Link} to="/chat" data-testid="nav-chat">Chat</Nav.Link>
              <ProtectedLink requiredRoles={["Admin"]}>
                <Nav.Link as={Link} to="/experiments" data-testid="nav-experiments">Experiments</Nav.Link>
              </ProtectedLink>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      
      <Container className="mt-4" data-testid="main-content">
        <Routes>
          <Route
            path="/"
            element={
                <Home />
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requiredRoles={[]}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute requiredRoles={[]}>
                <Chat />
              </ProtectedRoute>
            }
          />
          {/* Add new routes for Experiments and DMails */}
          <Route
            path="/experiments"
            element={
              <ProtectedRoute requiredRoles={["Admin"]}>
                <Experiments />
              </ProtectedRoute>
            }
          />
          <Route path="/access-denied" element={<AccessDenied />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Container>
    </>
  );
}

export default App;
