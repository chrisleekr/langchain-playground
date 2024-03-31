module.exports = {
  printWidth: 150,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'none',
  bracketSpacing: true,
  bracketSameLine: true,
  arrowParens: 'avoid',
  proseWrap: 'always',
  htmlWhitespaceSensitivity: 'strict',
  endOfLine: 'lf',
  jsxSingleQuote: true,
  overrides: [
    {
      files: ['tsconfig.json', 'tsconfig.build.json'],
      options: {
        parser: 'json'
      }
    }
  ]
};
