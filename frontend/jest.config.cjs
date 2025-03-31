// jest.config.cjs
module.exports = {
    testEnvironment: "jest-environment-jsdom",
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1", // This maps @/ to the src directory
        "\\.(css|less|sass|scss)$": "identity-obj-proxy",
        '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/mock/fileMock.js',
    },
    transform: {
        "^.+\\.[jt]sx?$": ["@swc/jest"]
    },
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    moduleDirectories: ['node_modules', 'src'],
    // Tell Jest to mock these files
    modulePathIgnorePatterns: ['<rootDir>/node_modules/'],
    moduleFileExtensions: ['js', 'jsx', 'json'],
    // Mock all files with __mocks__ folder
    automock: false,
    resetMocks: false
  };