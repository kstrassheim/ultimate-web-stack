import React from 'react';
import './GroupsList.css'; // We'll create this next

const GroupsList = ({ groups, loading }) => {
  if (loading) {
    return <div className="groups-loading" data-testid="groups-loading">Loading groups...</div>;
  }

  if (!groups || groups.length === 0) {
    return <div className="groups-empty" data-testid="groups-empty">No groups available</div>;
  }

  return (
    <div className="groups-list-container" data-testid="groups-list-container">
      <table className="groups-table" data-testid="groups-table">
        <thead>
          <tr>
            <th>Display Name</th>
            <th>Description</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => (
            <tr key={group.id} data-testid={`group-row-${group.id}`}>
              <td data-testid={`group-name-${group.id}`}>{group.displayName}</td>
              <td>{group.description || 'No description'}</td>
              <td>{group.mail || 'No email'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="groups-summary" data-testid="groups-summary">
        Total groups: {groups.length}
      </div>
    </div>
  );
};

export default GroupsList;