import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const [baseline,actual]=process.argv.slice(2);
if(!baseline||!actual)throw new Error('Usage: node scripts/check-preserved-layout.mjs <baseline capture directory> <current capture directory>');
const before=JSON.parse(await readFile(path.join(baseline,'capture-report.json'),'utf8'));
const after=JSON.parse(await readFile(path.join(actual,'capture-report.json'),'utf8'));
const report=[];
for(const old of before.checks){
 const current=after.checks.find(c=>c.width===old.width);if(!current)throw new Error(`Missing viewport ${old.width}`);
 for(const key of ['heading','eyebrow','supporting','headingSize'])if(old[key]!==current[key])throw new Error(`Approved hero changed: ${key} at ${old.width}`);
 for(let i=0;i<old.sections.length;i++){
  const a=old.sections[i],b=current.sections[i];
  if(!b||a.id!==b.id||Math.abs(a.width-b.width)>0.1||Math.abs(a.height-b.height)>0.1)throw new Error(`Existing section geometry changed at ${old.width}: ${a.id||'hero'}`);
 }
 const options={left:0,top:0,width:old.width,height:Math.ceil(old.hero.height)};
 const a=await sharp(path.join(baseline,`homepage-${old.width}.jpg`)).extract(options).raw().toBuffer();
 const b=await sharp(path.join(actual,`homepage-${old.width}.jpg`)).extract(options).raw().toBuffer();
 let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);
 const difference=sum/a.length;if(difference>0.1)throw new Error(`Hero pixels changed at ${old.width}: ${difference}`);
 report.push({width:old.width,originalSectionSizesPreserved:true,heroMeanChannelDifference:difference});
 console.log(`PASS ${old.width}px: existing section sizes/copy preserved; hero delta ${difference.toFixed(4)}/255. Sensory panel is an intentional addition.`);
}
await writeFile(path.join(actual,'preserved-layout-report.json'),JSON.stringify(report,null,2)+'\n');
