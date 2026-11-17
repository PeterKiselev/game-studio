// Programmatic Vitest config avoids Windows ancestor realpath restrictions.
import {startVitest} from 'vitest/node';
import {readFile} from 'node:fs/promises';
const ctx=await startVitest('test',['packages/rules/test/klondike.test.ts'],{
 config:false,watch:false,
},{configFile:false,resolve:{preserveSymlinks:true},
 esbuild:{tsconfigRaw:JSON.parse(await readFile('tsconfig.json','utf8'))},
});
if(!ctx)throw new Error('Vitest did not start');
process.exitCode=ctx.state.getFiles().some(f=>f.result?.state==='fail')||ctx.state.getUnhandledErrors().length?1:0;
await ctx.close();
