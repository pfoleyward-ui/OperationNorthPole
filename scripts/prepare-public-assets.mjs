import {rm} from 'node:fs/promises';
// Drop development review artifacts from the generated upload, preserving source files.
await rm('.open-next/assets/review',{recursive:true,force:true});
console.log('Public upload excludes development review artifacts; no database or test seeds are deployed.');
