import http from 'node:http';
import {renderRoomHTML} from './worker/room-html.js';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {SqliteRepository,ApiError} from './server-repository.mjs';
const root=new URL('./',import.meta.url);
export function createServer(repo){
 const allowed=new Set(['/index.html','/style.css','/shared-app.js','/http-repository.js','/domain.js','/landing.html','/landing.js']);
 return http.createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
  const json=(status,value)=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  try{
   const u=new URL(req.url,'http://localhost');const path=u.pathname;
   if(path.startsWith('/api/')){
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw new ApiError(403,'異なるサイトからは操作できません。');
    if(req.headers['sec-fetch-site']==='cross-site')throw new ApiError(403,'異なるサイトからは操作できません。');
    let body;if(req.method==='POST'){
     if(!req.headers['content-type']?.startsWith('application/json'))throw new ApiError(415,'JSON形式が必要です。');
     const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>262144)throw new ApiError(413,'入力が大きすぎます。');chunks.push(chunk);}try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(400,'JSON形式が不正です。');}
    }
    const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
    if(path==='/api/rooms'&&req.method==='POST'){if(!body||Object.keys(body).some(k=>k!=='profile'))throw new ApiError(400,'基本情報だけを指定してください。');json(201,repo.create(body.profile));return;}
    if(path==='/api/state'&&req.method==='GET'){json(200,repo.read(token));return;}
    const action={'/api/save':'save','/api/record':'record','/api/remove':'remove','/api/links':'rotate'}[path];
    if(action&&req.method==='POST'){json(200,repo.update(token,body,action));return;}
    throw new ApiError(404,'APIが見つかりません。');
   }
   if(!['GET','HEAD'].includes(req.method))throw new ApiError(405,'許可されていない操作です。');
   if(path==='/demo'||path==='/index.html'){res.writeHead(302,{...headers,Location:'/'});res.end();return;}
   const file=path==='/'?'/landing.html':path==='/room'?'/index.html':path;
   if(!allowed.has(file))throw new ApiError(404,'ページが見つかりません。');
   let data=await readFile(new URL(file.slice(1),root));if(path==='/room')data=Buffer.from(renderRoomHTML(data.toString('utf8')));
   res.writeHead(200,{...headers,'Content-Type':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){const status=e instanceof ApiError?e.status:e instanceof TypeError?400:422;json(status,{error:e instanceof ApiError||status===422?e.message:'入力を確認してください。'});}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await mkdir(new URL('./data/',root),{recursive:true});const repo=new SqliteRepository(fileURLToPath(new URL('./data/app.sqlite',root)));const server=createServer(repo);const port=Number(process.env.PORT??4173);
 server.listen(port,'127.0.0.1',()=>console.log(`Local server: http://127.0.0.1:${port} (fictional data only)`));
 server.on('error',()=>{console.error('起動できません。ポート使用中か保存先を確認してください。');repo.close();process.exitCode=1;});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{repo.close();process.exit(0);}));
}
