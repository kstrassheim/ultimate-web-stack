import { Link } from "react-router-dom";
import appInsights from './components/appInsights';
export default function NotFound() {
    appInsights.trackEvent({ name: '404 - NotFound page' });
    return (
      <>
        <h1>404</h1>
        <Link to='/'>Goto Home</Link>
      </>
    );
  }
  