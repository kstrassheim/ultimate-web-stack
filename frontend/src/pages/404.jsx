import { Link } from "react-router-dom";
import appInsights from '@/log/appInsights';

export default function NotFound() {
    appInsights.trackEvent({ name: '404 - NotFound page' });
    return (
      <div data-testid="not-found-page">
        <h1 data-testid="not-found-heading">404</h1>
        <Link to='/' data-testid="not-found-home-link">Goto Home</Link>
      </div>
    );
}
