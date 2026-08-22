// jest.config.cjs
module.exports ={
    testEnvironment: "jsdom",
    moduleNameMapper: {
      "^@/../terraform.config.json$": "<rootDir>/mock/terraform.mock.config.json", // Add this line
      "^@/.*\\.css$": '<rootDir>/mock/styleMock.js',  // Handle @/App.css specifically
      "\\.(css|less|sass|scss)$": '<rootDir>/mock/styleMock.js',
      "\\.(jpg|jpeg|png|gif|svg)$": "<rootDir>/mock/fileMock.js",
      "^@/(.*)$": "<rootDir>/src/$1"
    },
    transform: {
        // React Router 8 ships ESM-only and references `import.meta.hot`
        // in `lib/dom/ssr/routeModules.js`; @swc/jest alone does not
        // strip `import.meta` (it has no built-in CJS lowering for it),
        // so we wrap it with a tiny post-processor that only touches
        // that one file. The pattern also covers `.mjs` so RR's ESM-
        // only transitive deps (`cookie-es/dist/index.mjs`) get
        // transpiled too. See jest/transform-import-meta.cjs for the
        // full rationale.
        "^.+\\.[jt]sx?$|^.+\\.mjs$": ["<rootDir>/jest/transform-import-meta.cjs"]
    },
    // React Router 8 is published as ESM-only, so swc must transpile it
    // (specifically the `react-router/dom` and `react-router` entry
    // trees). Without this unignore, Jest loads the raw ESM and dies
    // on the first `import.meta` it finds. See
    // https://reactrouter.com/upgrading/v7#react-router-dom (the ESM-
    // only switch is part of v8).
    transformIgnorePatterns: [
      // React Router 8 (ESM-only, uses `import.meta.hot` in
      // `lib/dom/ssr/routeModules.js`; the wrapper above strips it)
      // and its ESM-only transitive dep `cookie-es` (used by RR for
      // cookie parsing) must both be transpiled to CJS, otherwise
      // the Jest runtime hits `SyntaxError: Unexpected token 'export'`
      // the first time a test touches the router.
      "/node_modules/(?!(react-router|cookie-es|module-to-transform)/)"
    ],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    moduleDirectories: ['node_modules', 'src'],
    // Tell Jest to mock these files
    modulePathIgnorePatterns: ['<rootDir>/node_modules/'],
    moduleFileExtensions: ['js', 'jsx', 'json'],
    // Mock all files with __mocks__ folder
    automock: false,
    resetMocks: false,

    reporters: [
        "default",
        "<rootDir>/jest-preview-reporter.js"
      ],
    // ... existing config
    coveragePathIgnorePatterns: [
        "/node_modules/",
        "/mock/",         // Excludes all mock folders
        "\\\\mock\\\\"    // Windows path format (with escaped backslashes)
    ],
    collectCoverageFrom: [
        "src/**/*.{js,jsx}",  // Include all JS/JSX files in src
        "!src/**/*.test.{js,jsx}", // Exclude test files
        "!src/index.{js,jsx}", // Optionally exclude entry points
        "!**/node_modules/**",
        "!**/mock/**"  // Exclude mock files
      ],
      
      // Optional: Set coverage thresholds to make tests fail if coverage is too low
      coverageThreshold: {
        global: {
          statements: 80,
          branches: 70,
          functions: 80,
          lines: 80
        },
      }
  };