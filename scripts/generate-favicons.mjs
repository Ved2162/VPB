import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
const source = 'public/images/vpb-favicon-master.png';
for (const [size, name] of [[16,'favicon-16x16.png'],[32,'favicon-32x32.png'],[180,'apple-touch-icon.png'],[192,'icon-192.png'],[512,'icon-512.png']]) await sharp(source).resize(size,size).png().toFile('public/'+name);
const entries = await Promise.all([16,32,48].map(size => sharp(source).resize(size,size).png().toBuffer()));
const header = Buffer.alloc(6+16*entries.length); header.writeUInt16LE(1,2); header.writeUInt16LE(entries.length,4);
let offset=header.length;
entries.forEach((data,i)=>{const pos=6+16*i;header[pos]=[16,32,48][i];header[pos+1]=header[pos];header.writeUInt16LE(1,pos+4);header.writeUInt16LE(32,pos+6);header.writeUInt32LE(data.length,pos+8);header.writeUInt32LE(offset,pos+12);offset+=data.length;});
await writeFile('public/favicon.ico',Buffer.concat([header,...entries]));
