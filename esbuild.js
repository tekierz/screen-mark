const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  metafile: true,
  external: ['vscode'],
  plugins: [{
    name: 'runtime-assets-and-notices',
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length) return;
        // PDFKit resolves the standard font metrics beside the bundle at runtime.
        fs.cpSync('node_modules/pdfkit/js/data', 'dist/data', { recursive: true });
        const packages = new Set();
        for (const input of Object.keys(result.metafile.inputs)) {
          const match = input.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\//);
          if (match) packages.add(match[1]);
        }
        const supplements = JSON.parse(fs.readFileSync('scripts/licenses/manifest.json', 'utf8'));
        const notices = ['# Bundled third-party notices\n'];
        const readNotice = (file) => {
          const text = fs.readFileSync(file, 'utf8');
          if (!text.trim()) throw new Error(`Empty bundled license: ${file}`);
          return text;
        };
        for (const name of [...packages].sort()) {
          const dir = path.join('node_modules', name);
          const packageBytes = fs.readFileSync(path.join(dir, 'package.json'));
          const pkg = JSON.parse(packageBytes);
          const supplement = supplements[name];
          const licenses = fs.readdirSync(dir).filter((file) => /^(licen[sc]e|copying|notice)([.-]|$)/i.test(file) && fs.statSync(path.join(dir, file)).isFile());
          if (!licenses.length && !supplement) throw new Error(`Missing bundled license for ${name}@${pkg.version}`);
          notices.push(`## ${name} ${pkg.version} (${pkg.license || 'see below'})\n`);
          for (const file of licenses) notices.push(readNotice(path.join(dir, file)));
          if (supplement) {
            // Exact reviewed distributions only; changes require fresh attribution review.
            const hash = createHash('sha256').update(packageBytes).digest('hex');
            if (pkg.version !== supplement.version || hash !== supplement.packageSha256) {
              throw new Error(`License supplement requires review for ${name}@${pkg.version}`);
            }
            if (!supplement.files?.length) throw new Error(`Missing license supplement files for ${name}`);
            for (const file of supplement.files) notices.push(readNotice(path.join('scripts/licenses', file)));
          }
        }
        fs.writeFileSync('THIRD-PARTY-NOTICES.md', notices.join('\n\n'));
      });
    },
  }],
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('watching...');
  } else {
    await esbuild.build(options);
    console.log('built dist/extension.js with PDFKit runtime data and notices');
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
