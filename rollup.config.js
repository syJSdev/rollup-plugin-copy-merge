import babel from 'rollup-plugin-babel'
import autoExternal from 'rollup-plugin-auto-external'
import includePaths from 'rollup-plugin-includepaths'

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/index.commonjs.js',
      format: 'commonjs'
    },
    {
      file: 'dist/index.module.js',
      format: 'module'
    }
  ],
  plugins: [
    includePaths({
      include: {},
      paths: ['src'],
      external: [],
      extensions: ['.js']
  }),
    babel({
      presets: [['@babel/preset-env', { targets: { node: '8.3' } }]],
      comments: false
    }),
    autoExternal()
  ]
}
