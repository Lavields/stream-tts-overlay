import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scryptSync,randomBytes} from 'node:crypto';
export async function authFixture(){const dir=await mkdtemp(join(tmpdir(),'streamvoice-auth-test-'));const path=join(dir,'accounts.json');await writeFile(path,JSON.stringify(['admin','streamer1','streamer2'].map(username=>({username,salt:'test-salt',passwordHash:scryptSync('test-password','test-salt',64).toString('hex'),overlayToken:randomBytes(32).toString('hex')}))));return {path,cleanup:()=>rm(dir,{recursive:true,force:true})};}
