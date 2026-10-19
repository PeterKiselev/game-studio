import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const root=resolve(process.argv[2]);
const filename='style.Cl5ZLtEP.css';
const css=await readFile('sudoku-hint.css','utf8');
if(!css.includes('grid-template-columns:minmax(0,1fr) minmax(0,2fr)'))throw Error('Expected hint layout not present');
for(const folder of ['sudoku','sudoku/vk']){
 const path=join(root,folder,'index.html');
 const original=await readFile(path,'utf8');
 const refs=[...original.matchAll(/href="\.\/assets\/style\.[^"/]+\.css"/g)];
 if(refs.length!==1)throw Error('Unexpected stylesheet references: '+folder);
 const updated=original.replace(refs[0][0],`href="./assets/${filename}"`);
 if(updated===original)throw Error('Stylesheet is already current; inspect baseline');
 const scripts=s=>[...s.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
 if(JSON.stringify(scripts(original))!==JSON.stringify(scripts(updated)))throw Error('Script changed');
 await copyFile('sudoku-hint.css',join(root,folder,'assets',filename));
 await writeFile(path,updated);
 console.log('Updated CSS only: '+folder);
}
