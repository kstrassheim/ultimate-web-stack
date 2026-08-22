import {
  escapeCsvField,
  rowsToCsv,
  downloadCsv
} from './csvExport';

describe('escapeCsvField', () => {
  it('returns plain strings unchanged when no special chars are present', () => {
    expect(escapeCsvField('hello')).toBe('hello');
    expect(escapeCsvField('Okabe Rintaro')).toBe('Okabe Rintaro');
  });

  it('returns an empty string for null or undefined', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('coerces non-string scalars to their string form', () => {
    expect(escapeCsvField(42)).toBe('42');
    expect(escapeCsvField(0)).toBe('0');
    expect(escapeCsvField(false)).toBe('false');
    expect(escapeCsvField(true)).toBe('true');
  });

  it('renders Date values as ISO 8601 strings', () => {
    const iso = '2025-04-07T12:34:56.789Z';
    expect(escapeCsvField(new Date(iso))).toBe(iso);
  });

  it('wraps fields containing commas in double quotes', () => {
    expect(escapeCsvField('a, b')).toBe('"a, b"');
  });

  it('wraps fields containing double quotes and doubles them', () => {
    expect(escapeCsvField('she said "hi"')).toBe('"she said ""hi"""');
  });

  it('wraps fields containing CR or LF', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('handles each special character independently', () => {
    expect(escapeCsvField('comma,here')).toBe('"comma,here"');
    expect(escapeCsvField('quote"here')).toBe('"quote""here"');
    expect(escapeCsvField('cr\rhere')).toBe('"cr\rhere"');
    expect(escapeCsvField('lf\nhere')).toBe('"lf\nhere"');
  });

  it('handles empty strings without quoting', () => {
    expect(escapeCsvField('')).toBe('');
  });
});

describe('rowsToCsv', () => {
  it('emits a header row followed by one row per object', () => {
    const csv = rowsToCsv(
      ['name', 'value'],
      [
        { name: 'alpha', value: 1 },
        { name: 'beta', value: 2 }
      ]
    );
    expect(csv).toBe('name,value\r\nalpha,1\r\nbeta,2\r\n');
  });

  it('emits only the header line for an empty row list', () => {
    expect(rowsToCsv(['a', 'b'], [])).toBe('a,b\r\n');
  });

  it('renders missing fields as the empty string', () => {
    const csv = rowsToCsv(
      ['a', 'b', 'c'],
      [{ a: 1 }, { a: 2, b: 'x' }, { c: 'z' }]
    );
    expect(csv).toBe('a,b,c\r\n1,,\r\n2,x,\r\n,,z\r\n');
  });

  it('escapes commas, quotes, and newlines inside cell values', () => {
    const csv = rowsToCsv(
      ['note'],
      [
        { note: 'has, comma' },
        { note: 'has "quote"' },
        { note: 'has\nnewline' }
      ]
    );
    expect(csv).toBe(
      'note\r\n"has, comma"\r\n"has ""quote"""\r\n"has\nnewline"\r\n'
    );
  });

  it('preserves the header order in each row', () => {
    const csv = rowsToCsv(
      ['z', 'a', 'm'],
      [{ a: 1, z: 2, m: 3 }]
    );
    expect(csv).toBe('z,a,m\r\n2,1,3\r\n');
  });
});

describe('downloadCsv', () => {
  let originalCreateObjectURL;
  let originalRevokeObjectURL;
  let originalCreateElement;
  let originalAppendChild;
  let originalRemoveChild;

  beforeEach(() => {
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    originalCreateElement = document.createElement.bind(document);
    originalAppendChild = document.body.appendChild.bind(document.body);
    originalRemoveChild = document.body.removeChild.bind(document.body);
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    document.createElement = originalCreateElement;
    document.body.appendChild = originalAppendChild;
    document.body.removeChild = originalRemoveChild;
    jest.useRealTimers();
  });

  it('creates a Blob URL, clicks an anchor, and revokes the URL', () => {
    // Spy on the Blob constructor so we can assert on the exact
    // payload without depending on jsdom's Blob features (which
    // differ from real browsers — e.g. no .arrayBuffer() in this
    // version of jsdom).
    const OriginalBlob = global.Blob;
    const blobSpy = jest.fn(function (parts, options) {
      const instance = new OriginalBlob(parts, options);
      instance.__parts = parts;
      instance.__options = options;
      return instance;
    });
    global.Blob = blobSpy;

    try {
      jest.useFakeTimers();
      const createObjectURL = jest.fn(() => 'blob:fake-url');
      const revokeObjectURL = jest.fn();
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;

      const click = jest.fn();
      const anchor = { href: '', download: '', click };
      const createElement = jest.fn((tag) => {
        if (tag === 'a') return anchor;
        return originalCreateElement(tag);
      });
      const appendChild = jest.fn();
      const removeChild = jest.fn();
      document.createElement = createElement;
      document.body.appendChild = appendChild;
      document.body.removeChild = removeChild;

      downloadCsv('readings.csv', 'name,value\r\nalpha,1\r\n');

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0][0];
      expect(blob).toBeInstanceOf(OriginalBlob);
      // The Blob was constructed with the UTF-8 BOM prefix + the CSV
      // body, and the right MIME type — the latter is what determines
      // how the browser handles the download.
      expect(blobSpy).toHaveBeenCalledWith(
        ['\uFEFF', 'name,value\r\nalpha,1\r\n'],
        { type: 'text/csv;charset=utf-8;' }
      );

      expect(appendChild).toHaveBeenCalledWith(anchor);
      expect(anchor.href).toBe('blob:fake-url');
      expect(anchor.download).toBe('readings.csv');
      expect(click).toHaveBeenCalledTimes(1);
      expect(removeChild).toHaveBeenCalledWith(anchor);

      jest.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    } finally {
      global.Blob = OriginalBlob;
    }
  });

  it('is a no-op when document or URL are not defined', () => {
    const originalDocument = global.document;
    const originalURL = global.URL;
    delete global.document;
    delete global.URL;

    try {
      expect(() => downloadCsv('x.csv', 'a,b\r\n')).not.toThrow();
    } finally {
      global.document = originalDocument;
      global.URL = originalURL;
    }
  });
});
