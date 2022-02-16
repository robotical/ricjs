module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  "rules": {
    "no-loss-of-precision": "off",
    "@typescript-eslint/no-loss-of-precision": ["off"]
  },
};
