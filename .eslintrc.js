module.exports = {
  parser: "@typescript-eslint/parser", // Specifies the ESLint parser
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended", // Uses the recommended rules from the @typescript-eslint/eslint-plugin
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:prettier/recommended" // Enables eslint-plugin-prettier and eslint-config-prettier. This will display prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
  ],
  parserOptions: {
    ecmaVersion: 6, // Allows for the parsing of modern ECMAScript features
    sourceType: "module", // Allows for the use of imports
    ecmaFeatures: {
      tsx: true // Allows for the parsing of TSX
    }
  },
  rules: {
    // Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
    // e.g. "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/brace-style": "error",
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "**/*.test.js", "**/*.test.jsx"],
      plugins: ["jest"], // Enables extra rules for Jest, including fixes for some other rules that don't play well with common Jest patterns.
      rules: {
        // you should turn the original rule off *only* for test files
        "@typescript-eslint/unbound-method": "off",
        "jest/unbound-method": "error",
      },
    },
  ],
  parserOptions: {
    project: ["tsconfig.test.json"],
  }
};