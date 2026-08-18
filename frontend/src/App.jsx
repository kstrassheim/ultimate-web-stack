import { Routes, Route, Link } from "react-router";
import { Navbar, Nav, Container, NavDropdown } from 'react-bootstrap';
import '@/App.css';
// get the components
import NotFound from '@/pages/404';
import EntraProfile from '@/components/EntraProfile';
import AccessDenied from '@/pages/AccessDenied';
import ProtectedRoute from "@/components/ProtectedRoute";
import ProtectedLink from "@/components/ProtectedLink";
import SessionRecoveryGuard from "@/components/SessionRecoveryGuard";
// get the pages
import Home from '@/pages/Home';
import Dashboard from '@/pages/Dashboard';
import Chat from '@/pages/Chat';
// Add new imports for Experiments and DMails
import Experiments from '@/pages/Experiments';
// Theme + settings (issue #85 — dark-mode toggle)
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import Settings from '@/pages/Settings';

/**
 * The navbar reads the effective theme from the ThemeProvider so its
 * palette (bg + variant) and dropdown chrome follow the user's choice
 * without any per-component prop-drilling. The Settings nav link is
 * public so anyone can change theme; the actual auth-protected pages
 * still gate on ProtectedRoute.
 */
function ThemedNavbar() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <Navbar
      bg={isDark ? 'dark' : 'light'}
      variant={isDark ? 'dark' : 'light'}
      data-bs-theme={theme}
      expand="lg"
      data-testid="main-navigation"
    >
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
          className={`border border-secondary ${isDark ? 'navbar-dark' : 'navbar-light'} navbar-hamburger`}
          variant={isDark ? 'dark' : 'light'}
          data-testid="navbar-toggle"
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
            <Nav.Link as={Link} to="/settings" data-testid="nav-settings">Settings</Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

function App() {
  return (
    <ThemeProvider>
      {/* Session-expiry recovery (issue #86): subscribes to the API layer's
          "session expired" event bus and triggers a re-login popup with
          route-restore. Mounted once near the top of the tree. */}
      <SessionRecoveryGuard />
      <ThemedNavbar />
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
          {/* Settings is public — anyone can change theme preference. */}
          <Route path="/settings" element={<Settings />} />
          <Route path="/access-denied" element={<AccessDenied />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Container>
    </ThemeProvider>
  );
}

export default App;