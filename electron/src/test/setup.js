"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Test setup file
const vitest_1 = require("vitest");
// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    log: vitest_1.vi.fn(),
    error: vitest_1.vi.fn(),
    warn: vitest_1.vi.fn(),
    info: vitest_1.vi.fn(),
    debug: vitest_1.vi.fn()
};
// Mock window.alert
global.alert = vitest_1.vi.fn();
// Add any other global mocks or setup here
//# sourceMappingURL=setup.js.map