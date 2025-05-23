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
        "^.+\\.[jt]sx?$": ["@swc/jest"]
    },
    transformIgnorePatterns: [
      "/node_modules/(?!module-to-transform)/"
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