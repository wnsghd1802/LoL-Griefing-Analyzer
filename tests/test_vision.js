const assert=require('assert');
const V=require('../vision.js');
function frame(r,g,b){const width=24,height=24,data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4){data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=255;}return {width,height,data};}
const normal=V.measure(frame(20,100,26)),gray=V.measure(frame(85,86,84));
assert(normal.chroma>70);
assert(gray.chroma<3);
assert(V.difference(normal,normal)===0);
assert(V.difference(normal,gray)>20);
const s=[
  {at:0,...normal},{at:10,...normal},{at:20,...gray},{at:30,...gray},{at:40,...gray},{at:50,...normal}
].map((x,i,a)=>({...x,delta:i?V.difference(x,a[i-1]):Infinity}));
const results=V.analyze(s,{step:10});
assert(results.some(x=>x.rule==='visual-grayscale'&&x.at===20),'grayscale interval not found');
assert(results.every(x=>!/(?:AFK 확정|고의적)/.test(x.title)));
assert(V.analyze([{at:0,...normal}],{step:10}).length===0);
console.log('Vision detector tests OK:',results.map(x=>x.rule).join(', '));
