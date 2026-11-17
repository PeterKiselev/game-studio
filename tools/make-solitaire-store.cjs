// Resize generated illustrations and typeset the snippet. No game screenshot editing.
const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');
const store=path.resolve('games/solitaire/store');
(async()=>{
 const browser=await chromium.launch();try{
 const p=await browser.newPage();const data=f=>'data:image/png;base64,'+fs.readFileSync(path.join(store,f)).toString('base64');
 const results=await p.evaluate(async({icon,art})=>{
  async function load(src){const i=new Image();i.src=src;await i.decode();return i;}
  const master=await load(icon),a=await load(art),results=[];
  for(const n of [576,278,150]){const c=document.createElement('canvas');c.width=c.height=n;const x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(master,0,0,n,n);results.push({file:`icons/icon-${n}.png`,data:c.toDataURL()});}
  const c=document.createElement('canvas');c.width=1120;c.height=630;const x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(a,0,0,1120,630);
  const shade=x.createLinearGradient(0,0,490,0);shade.addColorStop(0,'#17231788');shade.addColorStop(1,'#17231700');x.fillStyle=shade;x.fillRect(0,0,490,630);
  x.fillStyle='#e8c77c';x.font='bold 15px Arial';x.fillText('КОСЫНКА · ДАЧНАЯ КОЛОДА',40,105);
  x.fillStyle='#fff3d4';x.font='bold 59px Georgia';x.fillText('Пасьянсы',36,197);x.font='bold 47px Georgia';x.fillText('на веранде',39,254);
  x.fillStyle='#e8c77c';x.fillRect(40,288,64,3);x.fillStyle='#fff3d4';x.font='23px Arial';x.fillText('Разложите уют',40,337);x.fillText('по картам',40,369);
  x.fillStyle='#eee1bc';x.font='18px Arial';x.fillText('Задания дня',40,489);x.fillText('Коллекция столов и рубашек',40,521);
  results.push({file:'promo/snippet-1120x630.png',data:c.toDataURL()});return results;
 },{icon:data('icons/icon-master.png'),art:data('promo/artwork-master.png')});
 for(const r of results){fs.writeFileSync(path.join(store,r.file),Buffer.from(r.data.split(',')[1],'base64'));console.log(r.file);}
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
