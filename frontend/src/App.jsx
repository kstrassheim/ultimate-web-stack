import { Routes, Route, Link } from "react-router-dom";
import { Navbar, Nav, Container } from 'react-bootstrap';
import '@/App.css';
// get the components
import NotFound from '@/pages/404';
import EntraLogon from '@/components/EntraLogon';
import EntraProfile from '@/components/EntraProfile';
import AccessDenied from '@/pages/AccessDenied';
import ProtectedRoute from "@/components/ProtectedRoute";
// get the pages
import Home from '@/pages/Home';
import Chat from '@/pages/Chat';
import Admin from '@/pages/Admin';

function App() {
  return (
    <>
      <Navbar bg="dark" variant="dark" expand="lg" data-testid="main-navigation">
        <Container>
          <Navbar.Brand href="#" className="d-flex align-items-center">
            <a href="https://github.com/kstrassheim/ultimate-web-stack" target="_blank" data-testid="logo-link" className="me-2">
              <img src='logo.png' height="30" className="d-inline-block align-top" alt="logo" data-testid="logo-image" />
            </a>
            Ultimate Web Stack
          </Navbar.Brand>
          
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          
          <Navbar.Collapse id="basic-navbar-nav">
            {/* Main navigation links */}
            <Nav className="me-auto" data-testid="page-navigation">
              <Nav.Link as={Link} to="/" data-testid="nav-home">Home</Nav.Link>
              <Nav.Link as={Link} to="/chat" data-testid="nav-chat">Chat</Nav.Link>
              <Nav.Link as={Link} to="/admin" data-testid="nav-admin">Admin</Nav.Link>
            </Nav>
            
            {/* Authentication components */}
            <Nav className="ms-auto d-flex align-items-center" data-testid="auth-navigation">
              <Nav.Item className="me-2">
                <EntraLogon data-testid="entra-logon" />
              </Nav.Item>
              <Nav.Item>
                <EntraProfile data-testid="entra-profile" />
              </Nav.Item>
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
          <Route path="/access-denied" element={<AccessDenied />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Container>
    </>
  );
}

export default App;
