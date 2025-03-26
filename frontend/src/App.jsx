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
      <nav className="navbar">
        <div className="navbar-logo">
          <a href="https://github.com/kstrassheim/entraid-web-auth-reference" target="_blank">
            <img src='logo.png' className="logo" alt="logo" />
          </a>
          Entra Auth
        </div>
        
        {/* Separate navigation for pages */}
        <ul className="navbar-pages">
          <li><Link to="/" className="nav-link">Home</Link></li>
          <li><Link to="/admin" className="nav-link">Admin</Link></li>
        </ul>

        {/* Existing navbar links for auth components */}
        <ul className="navbar-links">
          <li>
            <EntraLogon />
          </li>
          <li>
            <EntraProfile />
          </li>
        </ul>
      </nav>
      
      <div className="main-content">
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
              <ProtectedRoute requiredRoles={['Admin']}>
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
