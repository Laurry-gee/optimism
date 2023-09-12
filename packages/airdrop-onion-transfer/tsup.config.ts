import { defineConfig } from 'tsup'
import packageJson from './package.json'

// @see https://tsup.egoist.dev/
export default defineConfig({
  name: packageJson.name,
  entry: ['script/onion-cli.ts', 'out/TransferOnion.sol/TransferOnion.json'],
  outDir: 'dist',
  format: ['esm'],
  splitting: false,
  sourcemap: true,
  clean: false,
  dts: true,
})
