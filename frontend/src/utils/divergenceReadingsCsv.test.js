import {
  DIVERGENCE_READINGS_CSV_COLUMNS,
  divergenceReadingsToCsv,
  divergenceReadingsCsvFilename
} from './divergenceReadingsCsv';

describe('divergenceReadingsToCsv', () => {
  it('emits the header row in on-screen column order', () => {
    const csv = divergenceReadingsToCsv([]);
    expect(csv).toBe(
      DIVERGENCE_READINGS_CSV_COLUMNS.join(',') + '\r\n'
    );
    expect(DIVERGENCE_READINGS_CSV_COLUMNS).toEqual([
      'Reading',
      'Status',
      'Recorded By',
      'Notes'
    ]);
  });

  it('maps each reading to a CSV row in the same order as the table', () => {
    const readings = [
      {
        id: 'DR-001',
        reading: 1.048596,
        status: 'steins_gate',
        recorded_by: 'Rintaro Okabe',
        notes: 'Steins;Gate worldline'
      },
      {
        id: 'DR-002',
        reading: 0.571024,
        status: 'alpha',
        recorded_by: 'Rintaro Okabe',
        notes: 'Alpha worldline'
      }
    ];

    const csv = divergenceReadingsToCsv(readings);
    expect(csv).toBe(
      'Reading,Status,Recorded By,Notes\r\n' +
      '1.048596,steins_gate,Rintaro Okabe,Steins;Gate worldline\r\n' +
      '0.571024,alpha,Rintaro Okabe,Alpha worldline\r\n'
    );
  });

  it('preserves the caller-supplied order (filter / sort state)', () => {
    const rows = [
      { id: 'a', reading: 3, status: 'alpha', recorded_by: 'X', notes: 'A' },
      { id: 'b', reading: 1, status: 'beta', recorded_by: 'Y', notes: 'B' },
      { id: 'c', reading: 2, status: 'gamma', recorded_by: 'Z', notes: 'C' }
    ];
    const csv = divergenceReadingsToCsv(rows);
    // Reading column in the export matches the input order
    // 3, 1, 2 — no hidden resort happens in here.
    expect(csv).toBe(
      'Reading,Status,Recorded By,Notes\r\n' +
      '3,alpha,X,A\r\n' +
      '1,beta,Y,B\r\n' +
      '2,gamma,Z,C\r\n'
    );
  });

  it('accepts readings that use "value" instead of "reading"', () => {
    const csv = divergenceReadingsToCsv([
      { value: 0.571024, status: 'alpha', recorded_by: 'Rintaro Okabe', notes: 'Alpha' }
    ]);
    expect(csv).toBe(
      'Reading,Status,Recorded By,Notes\r\n' +
      '0.571024,alpha,Rintaro Okabe,Alpha\r\n'
    );
  });

  it('renders missing fields as the empty string', () => {
    const csv = divergenceReadingsToCsv([
      { id: 'r1', reading: 1.0 }
    ]);
    expect(csv).toBe(
      'Reading,Status,Recorded By,Notes\r\n1,,,\r\n'
    );
  });

  it('handles a non-array input as an empty export', () => {
    expect(divergenceReadingsToCsv(undefined)).toBe(
      'Reading,Status,Recorded By,Notes\r\n'
    );
    expect(divergenceReadingsToCsv(null)).toBe(
      'Reading,Status,Recorded By,Notes\r\n'
    );
  });

  it('escapes commas, double quotes, and newlines in any column', () => {
    const csv = divergenceReadingsToCsv([
      {
        reading: 1.0,
        status: 'alpha',
        recorded_by: 'Doe, John',
        notes: 'Said "hello"\nthen left'
      }
    ]);
    expect(csv).toBe(
      'Reading,Status,Recorded By,Notes\r\n' +
      '1,alpha,"Doe, John","Said ""hello""\nthen left"\r\n'
    );
  });
});

describe('divergenceReadingsCsvFilename', () => {
  it('builds an ISO-dated filename from a Date', () => {
    expect(divergenceReadingsCsvFilename(new Date(2025, 3, 7))).toBe(
      'divergence-readings-2025-04-07.csv'
    );
  });

  it('zero-pads single-digit months and days', () => {
    expect(divergenceReadingsCsvFilename(new Date(2025, 0, 1))).toBe(
      'divergence-readings-2025-01-01.csv'
    );
    expect(divergenceReadingsCsvFilename(new Date(2025, 8, 9))).toBe(
      'divergence-readings-2025-09-09.csv'
    );
  });

  it('defaults to the current date when no argument is given', () => {
    const name = divergenceReadingsCsvFilename();
    expect(name).toMatch(/^divergence-readings-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
