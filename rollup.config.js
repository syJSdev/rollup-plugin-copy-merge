import path from 'path';

import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve as resolve } from '@rollup/plugin-node-resolve';
import filesize from 'rollup-plugin-filesize';

import pkg from './package.json';

export default {
  input: 'src/index.js',
  external: [...Object.keys(pkg.dependencies), 'path'],
  output: [
    {
      file: pkg.main,
      format: 'commonjs',
      exports: 'auto'
    },
    {
      file: pkg.module,
      format: 'module',
      exports: 'auto'
    }
  ],
  plugins: [
    resolve(),
    commonjs(),
    babel({ babelHelpers: 'bundled', configFile: path.resolve(__dirname, 'babel.config.js') }),
    filesize()
  ]
};
