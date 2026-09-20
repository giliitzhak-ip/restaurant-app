/* lint לפרויקט: תחביר ה-JS של הדף + תקינות נתוני התכשירים + סנכרון ההטמעה */
const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process');
const ROOT=path.join(__dirname,'..');
const PAGE=path.join(ROOT,'public','pest-log.html');
const html=fs.readFileSync(PAGE,'utf8');
const m=html.match(/<script>\n"use strict";([\s\S]*)<\/script>/);
if(!m){console.error('לא נמצא סקריפט הדף');process.exit(1)}
try{new vm.Script('"use strict";'+m[1],{filename:'pest-log.html'})}
catch(e){console.error('שגיאת תחביר ב-pest-log.html: '+e.message);process.exit(1)}
console.log('תחביר JS תקין ('+m[1].length+' תווים)');
const r=cp.spawnSync(process.execPath,[path.join(__dirname,'build-data.js'),'--check'],{stdio:'inherit'});
process.exit(r.status||0);
