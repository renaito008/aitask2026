import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {SqliteRepository,ApiError} from './server-repository.mjs';
const root=new URL('./',import.meta.url);
export function createServer(repo){
 const allowed=new Set(['/index.html','/style.css','/app.js','/shared-app.js','/http-repository.js','/domain.js','/repository.js','/landing.html','/landing.js']);
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
   const file=path==='/'?'/landing.html':path==='/room'||path==='/demo'?'/index.html':path;
   if(!allowed.has(file))throw new ApiError(404,'ページが見つかりません。');
   let data=await readFile(new URL(file.slice(1),root));if(path==='/room')data=Buffer.from(data.toString('utf8').replace('src="app.js"','src="shared-app.js"').replace('ローカル試作・架空データ専用 ｜ 保存先はこのブラウザ内です。別PC共有・認証・リンク発行は未実装です。','ローカルサーバー検証版・架空データ専用 ｜ このPCのSQLiteへ保存。公開・別PC接続は行っていません。').replace('<footer>', '<section id="sharePanel" class="panel" hidden><h2>共有リンクの管理</h2><p>閲覧リンクだけを上司に渡してください。再発行すると対象の古いリンクは即座に使えなくなります。</p><div class="toolbar"><button id="showEditLink">編集リンクを表示</button><button data-rotate="view">閲覧リンクを再発行</button><button data-rotate="edit">編集リンクを再発行</button><button data-rotate="both">両方を再発行</button></div><div id="issuedLinks" hidden><label>今回表示・発行したリンク<textarea id="linkOutput" readonly rows="4"></textarea></label><small>閉じる前に必ず控えてください。閲覧リンクから編集リンクは取得できません。</small></div></section><footer>').replace('href="?mode=view"','href="/"').replace('上司の閲覧デモ ↗','ルーム作成画面へ ↗'));
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
