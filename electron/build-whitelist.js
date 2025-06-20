// Production dependencies that should be included in the build
const PRODUCTION_DEPS = [
  "@xterm/addon-fit",
  "@xterm/addon-search", 
  "@xterm/addon-web-links",
  "@xterm/xterm",
  "axios",
  "electron-store",
  "electron-updater",
  "node-pty",
  // Dependencies of the above
  "ajv",
  "ajv-formats",
  "atomically",
  "builder-util-runtime",
  "conf",
  "debounce-fn",
  "debug",
  "dot-prop",
  "env-paths",
  "follow-redirects",
  "form-data",
  "fs-extra",
  "graceful-fs",
  "json-schema-traverse",
  "jsonfile",
  "lazy-val",
  "lodash.isequal",
  "mimic-fn",
  "ms",
  "nan",
  "onetime",
  "p-debounce",
  "pkg-up",
  "proxy-from-env",
  "sax",
  "semver",
  "type-fest",
  "universalify",
  "asynckit",
  "combined-stream",
  "delayed-stream",
  "mime-db",
  "mime-types",
  "fast-deep-equal",
  "fast-uri",
  "require-from-string",
  "uri-js",
  "punycode",
  "json-buffer",
  "keyv",
  "lowercase-keys",
  "p-cancelable",
  "responselike",
  "get-stream",
  "defer-to-connect",
  "normalize-url",
  "quick-lru",
  "resolve-alpn",
  "http2-wrapper",
  "cacheable-request",
  "cacheable-lookup",
  "clone-response",
  "decompress-response",
  "mimic-response",
  "once",
  "wrappy",
  "end-of-stream",
  "pump",
  "duplexer3",
  "stream-shift",
  "through2",
  "readable-stream",
  "inherits",
  "safe-buffer",
  "string_decoder",
  "util-deprecate",
  "core-util-is",
  "isarray",
  "process-nextick-args"
];

// Create files array with whitelisted node_modules
const files = [
  "dist/**/*",
  "assets/**/*", 
  "package.json"
];

// Add each production dependency
PRODUCTION_DEPS.forEach(dep => {
  files.push(`node_modules/${dep}/**/*`);
});

// Add exclusions
files.push(
  "!**/*.map",
  "!**/*.ts",
  "!**/*.d.ts",
  "!**/test/**",
  "!**/tests/**",
  "!**/__tests__/**",
  "!**/docs/**",
  "!**/example/**",
  "!**/examples/**",
  "!**/*.md",
  "!**/LICENSE*",
  "!**/license*",
  "!**/.npmignore",
  "!**/.gitignore"
);

module.exports = { files };