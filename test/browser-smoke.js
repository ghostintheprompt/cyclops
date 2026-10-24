const http=require('node:http');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function child(file,env={}) {return new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,[file],{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 let output='';p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>output+=d);p.on('error',reject);p.on('exit',code=>resolve({code,output}));
});}
(async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/missing'){res.writeHead(404);res.end('Missing');return;}res.end('<html><body style="background:#245678;color:white"><h1>Capture fixture</h1></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
 const env={TARGET_URL:`http://127.0.0.1:${server.address().port}`,ROUTES:JSON.stringify([{name:'fixture',path:'/'}])};
 let result=await child('flows/web/capture.js',env);assert.equal(result.code,0,result.output);
 result=await child('src/framer.js');assert.equal(result.code,0,result.output);
 const {PNG}=require('pngjs');let image=PNG.sync.read(fs.readFileSync(path.join(root,'screenshots/framed/fixture.png')));
 assert.equal(image.width,1284);assert.equal(image.height,2778);
 result=await child('flows/web/capture.js',{...env,ROUTES:JSON.stringify([{name:'missing',path:'/missing'}])});
 assert.equal(result.code,1,result.output);assert.ok(!fs.existsSync(path.join(root,'screenshots/after/missing.png')));
 console.log('PASS: real Chromium capture, 1284x2778 framing, and HTTP 404 failure');
 } finally {server.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
