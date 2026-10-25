const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
module.exports = {
  entry: './src/module.ts',
  output: { path: path.resolve(__dirname, 'dist'), filename: 'module.js', chunkFilename: '[name].[contenthash].js', library: { type: 'amd' }, clean: true, publicPath: '' },
  externals: [/^@grafana\/(data|runtime|ui)$/, 'react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'rxjs'],
  resolve: { extensions: ['.ts', '.tsx', '.js'] },
  module: { rules: [{ test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ }, { test: /\.css$/, use: ['style-loader', 'css-loader'] }] },
  plugins: [new CopyPlugin({ patterns: [{ from: 'src/plugin.json', to: 'plugin.json' }, { from: 'src/img', to: 'img' }, { from: 'README.md', to: 'README.md' }] })],
  optimization: { splitChunks: false },
  devtool: 'source-map',
};
