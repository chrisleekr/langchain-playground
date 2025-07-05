const { BannerPlugin, SwcJsMinimizerRspackPlugin } = require('@rspack/core');
const path = require('path');

/** @type {import('@rspack/cli').Configuration} */
module.exports = {
  entry: './src/index.ts',
  target: 'node',
  mode: process.env.NODE_ENV === 'prod' ? 'production' : 'development',

  plugins: [],

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    clean: true,
    libraryTarget: 'commonjs2'
  },

  resolve: {
    extensions: ['.ts', '.js', '.json'],
    alias: {
      '@/src': path.resolve(__dirname, 'src'),
      '@/api': path.resolve(__dirname, 'src/api'),
      '@/libraries': path.resolve(__dirname, 'src/libraries'),
      '@/middlewares': path.resolve(__dirname, 'src/middlewares'),
      '@/models': path.resolve(__dirname, 'src/models'),
      '@/slack': path.resolve(__dirname, 'src/slack'),
      '@/test': path.resolve(__dirname, 'test')
    }
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'typescript',
                  decorators: true
                },
                target: 'es2022',
                loose: false,
                externalHelpers: false
              },
              module: {
                type: 'commonjs'
              },
              sourceMaps: true
            }
          }
        ],
        exclude: /node_modules/
      },
      // Add rule to handle .node files
      {
        test: /\.node$/,
        use: 'ignore-loader'
      }
    ]
  },

  // Reference: https://rspack.rs/config/optimization
  optimization: {
    minimize: process.env.NODE_ENV === 'prod',
    moduleIds: 'deterministic',
    chunkIds: 'deterministic',
    usedExports: true,
    providedExports: true,
    sideEffects: true,
    innerGraph: true,
    concatenateModules: true,
    minimizer: [
      // Reference: https://rspack.rs/plugins/rspack/swc-js-minimizer-rspack-plugin
      new SwcJsMinimizerRspackPlugin({
        extractComments: /@preserve|@lic|@cc_on|^\**!/,
        minimizerOptions: {
          format: {
            comments: false
          },
          compress: {
            passes: 4
          }
        }
      })
    ]
  },

  externals: {
    // Reference: https://github.com/node-config/node-config/wiki/Webpack-Usage
    config: 'config',
    // Workaround: ERROR in ./node_modules/onnxruntime-node/bin/napi-v3/win32/x64/onnxruntime_binding.node
    'onnxruntime-node': 'commonjs onnxruntime-node'
  },

  devtool: process.env.NODE_ENV === 'prod' ? 'source-map' : 'eval-source-map',

  devServer: {
    // Not used for Node.js apps, but keeping for consistency
    port: 3000,
    hot: false
  },

  experiments: {
    outputModule: false
  },

  stats: {
    preset: 'normal',
    colors: true
  },
  ignoreWarnings: [
    // Ignore `./node_modules/express/lib/view.js Critical dependency: the request of a dependency is an expression`
    /critical dependency: the request of a dependency is an expression/,
    warning => true
  ]
};
