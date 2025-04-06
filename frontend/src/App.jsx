import { Routes, Route, Link } from "react-router-dom";
import { Navbar, Nav, Container, NavDropdown } from 'react-bootstrap';
import '@/App.css';
// get the components
import NotFound from '@/pages/404';
import EntraProfile from '@/components/EntraProfile';
import AccessDenied from '@/pages/AccessDenied';
import ProtectedRoute from "@/components/ProtectedRoute";
// get the pages
import Home from '@/pages/Home';
import Chat from '@/pages/Chat';
import Admin from '@/pages/Admin';
// Add new imports for Experiments and DMails
import Experiments from '@/pages/futureGadget/Experiments';
import DMails from '@/pages/futureGadget/DMails';

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
              <Nav.Link as={Link} to="/chat" data-testid="nav-chat">Chat</Nav.Link>
              
              {/* Replace Admin link with dropdown */}
              <NavDropdown title="Future Gadget Lab" id="future-gadget-dropdown" data-testid="nav-future-gadget">
                <NavDropdown.Item as={Link} to="/admin" data-testid="nav-admin">Admin Panel</NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/experiments" data-testid="nav-experiments">Experiments</NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/dmails" data-testid="nav-dmails">D-Mail System</NavDropdown.Item>
              </NavDropdown>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      
      <Container className="mt-4" data-testid="main-content">
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute requiredRoles={[]}>
                <Home />
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
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRoles={["Admin"]}>
                <Admin />
              </ProtectedRoute>
            }
          />
          {/* Add new routes for Experiments and DMails */}
          <Route
            path="/experiments"
            element={
              <ProtectedRoute requiredRoles={[]}>
                <Experiments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dmails"
            element={
              <ProtectedRoute requiredRoles={[]}>
                <DMails />
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
