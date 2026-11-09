// Development-only bridge. This is NOT Wrangler, workerd, Miniflare, or actual D1.
import http from 'node:http';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import worker from '../worker/index.js';
import {D1Shim} from '../tests/d1-shim.mjs';
const db=new D1Shim();
const env={DB:db,ASSETS:{async fetch(request){try{return new Response(await readFile(new URL('../public'+new URL(request.url).pathname,import.meta.url)));}catch{return new Response('missing',{status:404});}}}};
const port=Number(process.env.PORT??4182);
const server=http.createServer(async(req,res)=>{
  try {
    const request=new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
    const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503);res.end('Local shim error');}
});
server.listen(port,'127.0.0.1',()=>console.log('WORKER + NODE SQLITE D1 SHIM preview (not actual Cloudflare): http://127.0.0.1:'+port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
