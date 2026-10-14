const base = require('../tailwind.config.ts').default;
module.exports = { ...base, content: ['./src/**/*.{ts,tsx}', './preview/**/*.{ts,tsx}'] };
