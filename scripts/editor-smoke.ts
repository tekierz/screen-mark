import { mkdtemp, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const repo = resolve(import.meta.dir, '..');
const artifact = process.argv[2] && resolve(process.argv[2]);
const code = process.env.SCREENMARK_CODE ?? '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
const root = await mkdtemp(join(tmpdir(),'screenmark-host-'));
const extensions = join(root,'extensions'), user = join(root,'user');
await Promise.all([mkdir(extensions),mkdir(join(user,'User'),{recursive:true}),mkdir(join(root,'one')),mkdir(join(root,'two'))]);
await writeFile(join(user,'User/settings.json'),JSON.stringify({'security.workspace.trust.enabled':false,'update.mode':'none','extensions.autoUpdate':false,'extensions.autoCheckUpdates':false,'settingsSync.enabled':false,'workbench.startupEditor':'none','workbench.enableExperiments':false,'telemetry.telemetryLevel':'off','editor.autoClosingQuotes':'always','editor.autoClosingBrackets':'always','editor.quickSuggestions':false,'editor.suggest.snippetsPreventQuickSuggestions':false,'editor.suggestSelection':'first','editor.wordBasedSuggestions':'off'}));
const fixture = '---\r\n## metadata\r\n---\r\n## INT. 😀 <!-- 🧪 hidden --> ROOM <!-- tail -->\r\n\r\n**MAYA**\r\n> Hello.\r\n\r\n';
await writeFile(join(root,'one/a.smark'),fixture);
await writeFile(join(root,'two/b.smark'),'## INT. SECOND ROOT - DAY\n\nA room.\n');
const workspace = join(root,'smoke.code-workspace');
await writeFile(workspace,JSON.stringify({folders:[{path:join(root,'one')},{path:join(root,'two')}]}));
async function launch(args: string[], env: NodeJS.ProcessEnv = process.env) {
  await new Promise<void>((resolve,reject) => {
    const executable = args.includes('--install-extension') ? code : (process.env.SCREENMARK_EDITOR ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Electron');
    const cleanEnv = {...env};
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable,args,{env:cleanEnv,stdio:'inherit'});
    const timeout = setTimeout(()=>{child.kill();reject(new Error(`Editor smoke timed out; profile: ${root}`));},120000);
    child.on('error',reject);
    child.on('exit',status=>{clearTimeout(timeout);status===0?resolve():reject(new Error(`Editor exited ${status}; profile: ${root}`));});
  });
}
let extensionPath = repo;
if (artifact) {
  await launch(['--user-data-dir',user,'--extensions-dir',extensions,'--install-extension',artifact,'--force']);
  const installed = (await readdir(extensions)).filter(name=>name.startsWith('tikilabs.screen-mark-'));
  if(installed.length !== 1) throw new Error('Expected exactly one installed ScreenMark');
  extensionPath = join(extensions,installed[0]);
}
const runner = join(root,'smoke.cjs');
await build({entryPoints:[join(repo,'test/extension-host/smoke.ts')],outfile:runner,bundle:true,platform:'node',format:'cjs',external:['vscode']});
const result = join(root,'result.json');
await launch(['--new-window','--user-data-dir',user,'--extensions-dir',extensions,'--skip-welcome','--skip-release-notes','--disable-workspace-trust','--disable-updates',`--extensionDevelopmentPath=${extensionPath}`,`--extensionTestsPath=${runner}`,workspace],{...process.env,SCREENMARK_EXPECTED_EXTENSION:extensionPath,SCREENMARK_SMOKE_RESULT:result});
console.log(await readFile(result,'utf8'));
console.log(`Smoke profile and evidence: ${root}`);
