'use client';
import type {ImageLoaderProps} from 'next/image';
/** Fixed build-time variants; no arbitrary URL fetching or paid image service. */
export default function imageLoader({src,width,quality}:ImageLoaderProps){
  const names:Record<string,string>={'/images/christmas-village.png':'christmas-village','/images/santa-summer.jpg':'santa-summer','/images/santa-cutout.png':'santa-cutout','/images/santa-workshop.webp':'santa-workshop','/images/santa-family.jpg':'santa-family'};
  if(!names[src]||![32,48,64,96,128,256,384,400,640,750,828,1080,1200,1920,2048,3840].includes(width)||(quality!==undefined&&quality!==75))throw new Error('Image variant must be prepared: '+JSON.stringify({src,width,quality}));
  return '/_optimized/'+names[src]+'-'+width+'.webp';
}
