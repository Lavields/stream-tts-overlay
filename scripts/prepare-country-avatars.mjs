// Package ImageGen's four-state artwork for the existing PNG-tuber renderer.
// Pass a Sharp module path as the first argument when using a bundled runtime.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const sharp=require(process.argv[2]||'sharp');
const root=new URL('../',import.meta.url);
const artPath=process.argv[3]||'docs/country-avatar-art.json';
const metadataPath=process.argv[4]||'docs/country-avatar-sprites.json';
const art=JSON.parse(await readFile(new URL(artPath,root),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// Remove disconnected matte flecks without changing the character artwork.
// Large separate objects, including flags, are retained.
function cleanMatte(data,width,height){
  const labels=new Int32Array(width*height),queue=new Int32Array(width*height),sizes=[0];
  for(let pixel=0;pixel<labels.length;pixel++){
    if(labels[pixel]||data[pixel*4+3]<16)continue;
    const label=sizes.length;let head=0,tail=1;queue[0]=pixel;labels[pixel]=label;
    while(head<tail){
      const p=queue[head++],x=p%width,y=Math.floor(p/width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if((!dx&&!dy)||x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
        const n=p+dy*width+dx;
        if(!labels[n]&&data[n*4+3]>=16){labels[n]=label;queue[tail++]=n;}
      }
    }
    sizes.push(tail);
  }
  const largest=sizes.reduce((a,b)=>Math.max(a,b),0),minimum=Math.max(32,largest*.005);
  let removed=0;
  for(let p=0;p<labels.length;p++)if(!labels[p]||sizes[labels[p]]<minimum){
    if(data[p*4+3])removed++;
    data.fill(0,p*4,p*4+4);
  }
  return removed;
}
const assets=[];
for(const item of art.assets){
  const source=fileURLToPath(new URL(item.source,root)),metadata=await sharp(source).metadata();
  if(!metadata.hasAlpha)throw Error('Artwork lacks alpha: '+item.id);
  const width=Math.floor(metadata.width/2),height=Math.floor(metadata.height/2),cells=[];
  let removedMattePixels=0;
  for(let row=0;row<2;row++)for(let column=0;column<2;column++){
    const {data,info}=await sharp(source).extract({left:column*width,top:row*height,width,height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    removedMattePixels+=cleanMatte(data,info.width,info.height);
    const frame=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}})
      .resize(512,512,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
    cells.push(frame);
  }
  const frameHashes=cells.map(sha);
  if(new Set(frameHashes).size!==4)throw Error('Repeated animation frame: '+item.id);
  const sprite=await sharp({create:{width:1024,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite(cells.map((input,i)=>({input,left:(i%2)*512,top:Math.floor(i/2)*512})))
    .png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
  const thumb=await sharp(cells[0]).resize(160,160).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
  const spritePath=`public/assets/avatars/${item.id}-sprites.png`,thumbPath=`public/assets/avatars/${item.id}-thumb.png`;
  await writeFile(new URL(spritePath,root),sprite);await writeFile(new URL(thumbPath,root),thumb);
  assets.push({id:item.id,country:item.country,sprite:spritePath,thumbnail:thumbPath,frameSize:512,
    spriteBytes:sprite.length,thumbnailBytes:thumb.length,frameHashes,sha256:sha(sprite),removedMattePixels});
  console.log(`${item.id}: ${Math.round(sprite.length/1024)} KiB sprite, ${Math.round(thumb.length/1024)} KiB thumbnail`);
}
await writeFile(new URL(metadataPath,root),JSON.stringify({date:'2026-10-27',layout:['closed','open','closed-blink','open-blink'],assets},null,2)+'\n');
