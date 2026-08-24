import { Link } from 'react-router';
import { Container } from 'react-bootstrap';

/**
 * 403 page rendered when ProtectedRoute bounces a user without the
 * required role. Stays deliberately minimal so it works without any
 * data dependency.
 */
const AccessDenied = () => {
  return (
    <Container className="text-center mt-5" data-testid="access-denied-page">
      <h1>Access Denied</h1>
      <p className="lead">
        You don&apos;t have permission to view this page.
      </p>
      <p>
        <Link to="/" className="btn btn-primary" data-testid="access-denied-home">
          Return to Home
        </Link>
      </p>
    </Container>
  );
};

export default AccessDenied;