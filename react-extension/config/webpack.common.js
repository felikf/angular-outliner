const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const rootDir = path.join(__dirname, '..');

module.exports = {
  entry: {
    content: path.join(rootDir, 'src/content.ts'),
    popup: path.join(rootDir, 'src/popup.ts')
  },
  output: {
    path: path.join(rootDir, 'dist/js'),
    filename: '[name].js'
  },
  optimization: {
    splitChunks: {
      name: 'vendor',
      chunks: 'initial'
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.join(rootDir, 'tsconfig.json')
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  plugins: [
    new CopyPlugin(
      [{ from: '.', to: '../' }],
      { context: path.join(rootDir, 'public') }
    )
  ]
};
