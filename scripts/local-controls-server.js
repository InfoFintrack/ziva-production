// Local test server: uses only disposable localhost PostgreSQL and a test signing key.
const http=require('http'),fs=require('fs'),path=require('path'),Module=require('module');
const {Pool}=require('pg');
process.env.JWT_SECRET='local-controls-browser-test';
const pool=new Pool({host:'127.0.0.1',port:55432,user:'postgres',password:'localtest',database:'postgres',ssl:false});
require('../api/_lib/db').getPool=()=>pool;
const cache={};
function handler(file){if(cache[file])return cache[file];const filename=path.resolve(__dirname,'../api',file+'.js');const code=require('@babel/core').transformSync(fs.readFileSync(filename,'utf8'),{plugins:['@babel/plugin-transform-modules-commonjs'],configFile:false,babelrc:false}).code;const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(code,filename);return cache[file]=m.exports.default;}
http.createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/')){
  req.query=Object.fromEntries(url.searchParams);let body='';for await(const b of req)body+=b;req.body=body?JSON.parse(body):{};
  res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
  return await handler(url.pathname.slice(5))(req,res);
 }
 const filename=path.resolve(__dirname,'../build',url.pathname.slice(1));const file=fs.existsSync(filename)&&fs.statSync(filename).isFile()?filename:path.resolve(__dirname,'../build/index.html');
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 }catch(e){console.error(e.message);res.statusCode=500;res.end(JSON.stringify({success:false,message:e.message}));}
}).listen(3005,'127.0.0.1',()=>console.log('Local controls test server ready on 3005'));
