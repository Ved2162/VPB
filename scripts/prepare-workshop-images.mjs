import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('public/images/workshop',{recursive:true});
for(let i=1;i<=7;i++) {
  const name=`workshop-${String(i).padStart(2,'0')}`;
  await sharp(`assets/workshop-originals/${name}.png`).webp({quality:88,effort:6}).toFile(`public/images/workshop/${name}.webp`);
}
