import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';

export default {
	input: 'src/index.ts',
	external: ['react', 'react-dom'],
	output: [
		{
			file: 'dist/index.esm.js',
			format: 'esm',
			sourcemap: true
		},
		{
			file: 'dist/index.js',
			format: 'cjs',
			sourcemap: true
		},
		{
			file: 'dist/index.umd.js',
			format: 'umd',
			name: 'CarbonCompanionWidgets',
			sourcemap: true,
			globals: {
				'react': 'React',
				'react-dom': 'ReactDOM'
			}
		}
	],
	plugins: [
		resolve(),
		commonjs(),
		typescript({ 
			tsconfig: './tsconfig.json',
			declaration: true,
			declarationDir: './dist'
		})
	]
};
