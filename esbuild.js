const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  // vscode is provided by the host; pdfkit stays in node_modules so its
  // runtime font data files resolve normally (vsce packages prod deps).
  external: ['vscode', 'pdfkit'],
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('watching...');
  } else {
    await esbuild.build(options);
    console.log('built dist/extension.js');
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
