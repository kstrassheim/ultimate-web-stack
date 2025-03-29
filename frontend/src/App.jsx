import { Routes, Route, Link } from "react-router-dom";
import './App.css';
// get the components
import NotFound from './404';
import EntraLogon from './components/EntraLogon';
import EntraProfile from './components/EntraProfile';
import AccessDenied from './components/AccessDenied';
import ProtectedRoute from "./components/ProtectedRoute";
// get the pages
import Home from './pages/Home';
import Admin from './pages/Admin';
//import appInsights from './components/appInsights';

function App() {
  return (
    <>
      <nav className="navbar" data-testid="main-navigation">
        <div className="navbar-logo">
          <a href="https://github.com/kstrassheim/ultimate-web-stack" target="_blank" data-testid="logo-link">
            <img src='logo.png' className="logo" alt="logo" data-testid="logo-image" />
          </a>
          Ultimate Web Stack
        </div>
        
        {/* Separate navigation for pages */}
        <ul className="navbar-pages" data-testid="page-navigation">
          <li><Link to="/" className="nav-link" data-testid="nav-home">Home</Link></li>
          <li><Link to="/admin" className="nav-link" data-testid="nav-admin">Admin</Link></li>
        </ul>

        {/* Existing navbar links for auth components */}
        <ul className="navbar-links" data-testid="auth-navigation">
          <li>
            <EntraLogon data-testid="entra-logon" />
          </li>
          <li>
            <EntraProfile data-testid="entra-profile" />
          </li>
        </ul>
      </nav>
      
      <div className="main-content" data-testid="main-content">
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
            path="/admin"
            element={
              <ProtectedRoute requiredRoles={[]}>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route path="/access-denied" element={<AccessDenied />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
