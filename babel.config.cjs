/**
 * Babel configuration for Jest ESM module transformation.
 *
 * This config is used by babel-jest to transform ESM-only packages
 * (like @toon-format/toon) into CommonJS for Jest compatibility.
 *
 * @see https://jestjs.io/docs/getting-started#using-babel
 */
module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current'
        }
      }
    ]
  ]
};
