import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.js',
      format: 'esm',
      sourcemap: true
    },
    {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'CarbonCompanion',
      sourcemap: true,
      globals: {
        'lit': 'Lit',
        'lit/decorators.js': 'LitDecorators'
      }
    }
  ],
  plugins: [
    resolve(),
    typescript({ 
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: './dist'
    })
  ]
};
