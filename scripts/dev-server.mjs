import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT || 3000);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
    const filename=path.resolve(root,relative);
    if(!filename.startsWith(root) || relative.split('/').some(x=>x.startsWith('.')) || !types[path.extname(filename)]){
      res.writeHead(404);res.end('Not found');return;
    }
    const body=await readFile(filename);res.writeHead(200,{'Content-Type':`${types[path.extname(filename)]}; charset=utf-8`,'Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Clawd Beat Lab: http://localhost:${port}`));
