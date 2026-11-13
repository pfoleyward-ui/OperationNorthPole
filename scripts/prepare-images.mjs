/** Reproduce Next's existing WebP transforms at build time for static Cloudflare
 * assets; originals and approved component markup remain untouched. */
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
const widths=[32,48,64,96,128,256,384,400,640,750,828,1080,1200,1920,2048,3840];
const images=['santa-cutout.png','santa-workshop.webp','santa-family.jpg','christmas-village.png','santa-summer.jpg'];
await mkdir('public/_optimized',{recursive:true});
for(const name of images)for(const width of widths)await sharp('public/images/'+name).rotate().resize(width,undefined,{withoutEnlargement:true}).webp({quality:75}).toFile('public/_optimized/'+name.replace(/\.[^.]+$/,'')+'-'+width+'.webp');
console.log('Prepared static variants of five approved images; originals unchanged.');
