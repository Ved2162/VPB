import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';
await mkdir('public/images/craft',{recursive:true});
for (const file of await readdir('assets/craft-originals')) {
 await sharp('assets/craft-originals/'+file).webp({quality:90,effort:6}).toFile('public/images/craft/'+file.replace(/\.(jpg|png)$/,'.webp'));
}
