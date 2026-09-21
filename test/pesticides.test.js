/* בדיקות למאגר התכשירים המאומת ולתבניות הטיפול.
   רצות בדפדפן אמיתי מול public/pest-log.html.  הרצה: npm run test:pesticides */
const path=require('path'),fs=require('fs');
const {chromium}=require('playwright-core');
const PAGE='file://'+path.join(__dirname,'..','public','pest-log.html');
const EXE=process.env.CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SEED=JSON.parse(fs.readFileSync(path.join(__dirname,'..','src','data','pesticides.seed.json'),'utf8'));

let pass=0,fail=0;const fails=[];
const ok=(n,c,x)=>{if(c){pass++;console.log('  ✓ '+n)}else{fail++;fails.push(n);console.log('  ✗ '+n+(x?'\n      '+x:''))}};
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),'expected '+JSON.stringify(b)+'  got '+JSON.stringify(a));

const PROFILE={company:'יצחק אחזקות והדברות',vat:'1',companyPhone:'02',companyEmail:'a@b.com',
  name:'יצחק כהן',license:'12345',phone:'050-1234567',email:'a@b.com',address:'ירושלים',licenseType:'במבנים ובשטח פתוח'};
const PLACE={kind:'building',city:'ירושלים',street:'הרצל',houseApt:'10',buildingType:'מפעל',
  buildingTypeOther:'',houseNo:'',aptNo:'',authority:'',siteType:'',siteTypeOther:'',siteDesc:'',coords:'',neighborhood:''};
const seed=JSON.stringify({counter:1000,pending:{},mine:[],photos:{},stations:{},profile:PROFILE,
  clients:{c1:{id:'c1',name:'מסעדת הגפן',phone:'02-5551234',role:'מנהל אחזקה',updatedAt:2,places:[PLACE]}},
  journals:{}});

let B;
async function page(fn){
  /* הקשר נפרד לכל בדיקה, כדי שהאחסון יהיה מבודד.
     הזריעה רק כשהמפתח חסר, כדי שרענון בתוך בדיקה לא ימחק את מה שנשמר. */
  const ctx=await B.newContext({viewport:{width:430,height:950},hasTouch:true});
  const p=await ctx.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(s=>{
    try{if(!localStorage.getItem('yp-reg-log-v2'))localStorage.setItem('yp-reg-log-v2',s)}catch(e){}
  },seed);
  await p.goto(PAGE);
  await p.waitForFunction(()=>document.querySelector('#app')&&document.querySelector('#app').children.length>0);
  try{await fn(p,errs)}finally{await ctx.close()}
  return errs;
}
const startJ=p=>p.evaluate(async pl=>{await A.newJ();cur.client.name='מסעדת הגפן';
  cur.place=Object.assign(cur.place,pl);cur.step=4;touch();render()},PLACE);
/* בחירת חומר דרך שדה החיפוש, כפי שמשתמש עושה בפועל */
const pick=async(p,id)=>{
  const name=SEED.products.find(x=>x.id===id).nameHe;
  await p.fill('#pq',name);await p.waitForTimeout(320);
  await p.click(`.sugitem[data-p="${id}"]`);await p.waitForTimeout(250);
};

(async()=>{
B=await chromium.launch({executablePath:EXE,args:['--no-sandbox']});
const PRODUCTS_LEN=SEED.products.length;

console.log('\n1. תקינות קובץ הנתונים');
const byId=id=>SEED.products.find(p=>p.id===id);
eq('ארבעת התכשירים מהרשימה שנמסרה קיימים',
   SEED.products.filter(p=>!p.id.startsWith('reg-')).map(p=>p.id).sort(),
   ['blokion-plus','dragon','draker-10-2','pastion-plus-pasta']);
ok('הרשימה המלאה נטענה',SEED.products.length>=150,'got '+SEED.products.length);
eq('שלושה מאומתים מתווית',SEED.products.filter(p=>p.verificationStatus==='verified').length,3);
eq('אין אף חומר חסום',SEED.products.filter(p=>p.verificationStatus==='blocked').length,0);
ok('השאר במצב unknown',
   SEED.products.filter(p=>p.verificationStatus==='unknown').length===SEED.products.length-3);
ok('כל חומר מסומן כניתן לבחירה',SEED.products.every(p=>p.isSelectable===true));
ok('לתכשיר לא מאומת אין אזהרות, מינונים או זמן כניסה',
   SEED.products.filter(p=>p.verificationStatus==='unknown').every(p=>
     !p.warningsHuman.length&&!p.warningsAnimals.length&&!p.warningsEnvironment.length&&
     !p.dosages.length&&!p.applicationRestrictions.length&&!p.reentry.text&&!p.reentry.minutes));
ok('לתכשיר לא מאומת אין מספר רישום או קישור לתווית',
   SEED.products.filter(p=>p.verificationStatus==='unknown').every(p=>
     !p.registrationNumber&&!p.registrationExpiry&&!p.officialLabelUrl));
ok('לחומר ללא מזיקי תווית מוזן המזיק ידנית',
   SEED.products.filter(p=>!p.targetPests.length).every(p=>p.verificationStatus!=='verified'));
ok('כל תכשיר לא מאומת נושא הסבר על מקור הנתונים',
   SEED.products.filter(p=>p.verificationStatus==='unknown').every(p=>
     !!p.statusLabel&&!!p.verificationNote));
eq('דרגון – רישום וחומר פעיל',[byId('dragon').registrationNumber,byId('dragon').registrationExpiry,
   byId('dragon').activeIngredients[0].name,byId('dragon').activeIngredients[0].percent],['640','2030','Bifenthrin','9.6%']);
eq('דרקר – שלושה חומרים פעילים',byId('draker-10-2').activeIngredients.map(x=>x.name+' '+x.percent),
   ['Cypermethrin 10%','Tetramethrin 2%','Piperonyl Butoxide 10%']);
eq('פסטיון – ברודיפקום 0.005% וחומר מר',[byId('pastion-plus-pasta').activeIngredients[0].percent,
   byId('pastion-plus-pasta').activeIngredients[1].name],['0.005%','Denatonium Benzoate']);
ok('כל קישורי התוויות הם כתובות תקינות',
   SEED.products.filter(p=>p.officialLabelUrl).every(p=>/^https:\/\/\S+\.pdf$/.test(p.officialLabelUrl)),
   SEED.products.filter(p=>p.officialLabelUrl).map(p=>p.officialLabelUrl).join(' '));
const bl=byId('blokion-plus');
eq('בלוקיון – ניתן לבחירה עם תג מידע',[bl.verificationStatus,bl.isSelectable,bl.statusLabel],
   ['unknown',true,'מידע יושלם בהמשך']);
ok('בלוקיון – עדיין אין בו תוכן תווית שהומצא',
   [...bl.warningsHuman,...bl.warningsAnimals,...bl.warningsEnvironment,...bl.dosages,
    ...bl.targetPests,...bl.activeIngredients,...bl.applicationRestrictions].length===0&&
   !bl.reentry.text&&!bl.registrationNumber);
const pw=new Set(byId('pastion-plus-pasta').warningsHuman.concat(byId('pastion-plus-pasta').warningsAnimals));
ok('אזהרות פסטיון לא הועתקו לבלוקיון',
   !bl.warningsHuman.some(w=>pw.has(w))&&!bl.warningsAnimals.some(w=>pw.has(w)));
ok('לא נטען hash של קובץ תווית לאף מוצר',SEED.products.every(p=>p.labelSha256===''));
ok('לכל מוצר יש הערת מקור',SEED.products.every(p=>!!p.verificationNote));
ok('אין מינונים באף מוצר',SEED.products.every(p=>p.dosages.length===0),
   SEED.products.map(p=>p.id+':'+p.dosages.length).join(' '));
ok('אין מגבלות ריסוס באף מוצר',SEED.products.every(p=>p.applicationRestrictions.length===0),
   SEED.products.map(p=>p.id+':'+p.applicationRestrictions.length).join(' '));
ok('אזהרות הסיכון נשמרו',byId('dragon').warningsHuman.length===4&&byId('draker-10-2').warningsHuman.length===6);
ok('ההנחיות ללקוח בסיום נשמרו',byId('dragon').customerInstructionsAfter.length===1);
ok('זמני הכניסה מחדש נשמרו',byId('dragon').reentry.minutes===60&&
   byId('pastion-plus-pasta').reentry.type==='not_applicable_by_label');

console.log('\n2. מזיקים ומינונים – רק מהתווית');
await page(async p=>{
  await startJ(p);
  const r=await p.evaluate(()=>({
    dragonPests:prodById('dragon').targetPests,
    drakerPests:prodById('draker-10-2').targetPests,
    pastionPests:prodById('pastion-plus-pasta').targetPests,
    anyDos:PRODUCTS().reduce((n,x)=>n+(x.dosages||[]).length,0),
    anyRes:PRODUCTS().reduce((n,x)=>n+(x.applicationRestrictions||[]).length,0),
    total:PRODUCTS().length
  }));
  ok('דרגון – תיקנים, פשפש המיטה וחרקים זוחלים',
     r.dragonPests.includes('תיקנים')&&r.dragonPests.includes('פשפש המיטה'));
  ok('דרקר – זוחלים ומעופפים',r.drakerPests.includes('נמלים')&&r.drakerPests.includes('יתושים'));
  eq('פסטיון – עכברים וחולדות בלבד',r.pastionPests,['עכברים','חולדות']);
  eq('אין מינונים בזיכרון האפליקציה',r.anyDos,0);
  eq('אין מגבלות ריסוס בזיכרון האפליקציה',r.anyRes,0);
  ok('כל הרשימה זמינה באפליקציה',r.total>=150,'got '+r.total);
});

console.log('\n3. אין מינונים ומגבלות ריסוס במסך');
await page(async p=>{
  await startJ(p);
  await pick(p,'draker-10-2');
  await p.evaluate(()=>{A.setPest({i:0,val:'תיקנים'})});
  const t=await p.textContent('#app');
  ok('לא מוצגת בחירת סוג משטח',!t.includes('סוג המשטח'));
  ok('לא מוצג מינון מהתווית',!t.includes('מינון מהתווית'));
  ok('לא מוצגים ערכי מינון',!t.includes('5-10 מ"ל')&&!t.includes('10-20 מ"ל'));
  ok('לא מוצגות מגבלות שימוש',!t.includes('מגבלות שימוש'));
  ok('מוצגת הבהרה מאיפה לקחת מינון',t.includes('יש לקחת אותם מהתווית העדכנית'));
  eq('לא נשמר מינון ביישום',await p.evaluate(()=>cur.apps[0].dosageId),'');
  eq('אין דרישת מינון בבדיקת התקינות',
     await p.evaluate(()=>validate(cur).filter(e=>e.msg.includes('מינון')).length),0);
});

console.log('\n4. דרגון – כניסה מחדש והוראת 24 השעות למיטה');
await page(async p=>{
  await startJ(p);
  await pick(p,'dragon');
  await p.evaluate(()=>{A.setPest({i:0,val:'תיקנים'})});
  const re1=await p.evaluate(()=>reentryFor(cur));
  eq('כניסה מחדש שעה',re1.minutes,60);
  eq('בטיפול בתיקנים אין הוראת 24 שעות',re1.conditional.length,0);
  ok('לא נשאלת שאלת מסגרת המיטה בטיפול בתיקנים',
     await p.evaluate(()=>pendingConditionals(prodById('dragon'),cur.apps[0]).length===0));
  await p.evaluate(()=>{A.setPest({i:0,val:'פשפש המיטה'})});
  ok('בפשפש המיטה נשאלת שאלת מסגרת המיטה',
     (await p.textContent('#app')).includes('האם רוסס גוף או בסיס המיטה?'));
  await p.evaluate(()=>{A.setCond({i:0,k:'bedFrameSprayed',val:'no'})});
  const re2=await p.evaluate(()=>reentryFor(cur));
  eq('לא רוססה המסגרת – אין הוראת 24 שעות',re2.conditional.length,0);
  await p.evaluate(()=>{A.setCond({i:0,k:'bedFrameSprayed',val:'yes'})});
  const re3=await p.evaluate(()=>reentryFor(cur));
  eq('רוססה המסגרת – נוספת הוראת 24 שעות',re3.conditional.length,1);
  ok('ההוראה משויכת לדרגון ומזכירה 24 שעות',
     re3.conditional[0].product==='דרגון'&&re3.conditional[0].text.includes('24 שעות'),JSON.stringify(re3.conditional));
  eq('זמן הכניסה הכללי נשאר שעה',re3.minutes,60);
  ok('ההוראה מוצגת בהנחיות ללקוח',(await p.textContent('#app')).includes('אין לישון'));
  ok('איסור ריסוס מזרנים הוסר עם מגבלות הריסוס',
     !(await p.textContent('#app')).includes('אין לרסס מזרנים'));
});

console.log('\n5. פסטיון – בלי זמן כניסה מחדש של ריסוס');
await page(async p=>{
  await startJ(p);
  await pick(p,'pastion-plus-pasta');
  await p.evaluate(()=>{A.setPest({i:0,val:'עכברים'})});
  const r=await p.evaluate(()=>({re:reentryFor(cur),t:prodById('pastion-plus-pasta').reentry}));
  eq('אין זמן כניסה מספרי',r.re.minutes,0);
  eq('סוג הכניסה מחדש לפי התווית',r.t.type,'not_applicable_by_label');
  eq('נוסח הכניסה מחדש',r.t.text,'פיתיון בתיבות האכלה; יש לפעול לפי מגבלות התווית ומיקום התיבות');
  ok('לא מוצג "שעה" כזמן כניסה',!(await p.textContent('#app')).includes('זמן כניסה מחדש: שעה'));
  ok('מוצגות תיבות האכלה',(await p.textContent('#app')).includes('תיבות האכלה שהוצבו'));
});

console.log('\n5א. שדה חיפוש חומר עם השלמה אוטומטית');
await page(async p=>{
  await startJ(p);
  ok('מוצג שדה חיפוש נקי',!!(await p.$('#pq')));
  eq('הכיתוב בשדה',await p.evaluate(()=>document.getElementById('pq').placeholder),'הקלד שם חומר…');
  eq('לפני הקלדה אין רשימת חומרים',(await p.$$('.sugitem')).length,0);
  eq('אין רשימה פתוחה של כל החומרים',(await p.$$('.pcard')).length,0);

  const type=async q=>{await p.fill('#pq',q);await p.waitForTimeout(320);
    return p.evaluate(()=>[...document.querySelectorAll('.sugitem .smain b')].map(x=>x.textContent));};

  let r=await type('ד');
  ok('הקלדת "ד" מציגה את דרגון ודרקר',r.includes('דרגון')&&r.includes('דרקר 10.2'),r.join(','));
  r=await type('דר');
  ok('הקלדת "דר" מציגה את שניהם',r.includes('דרגון')&&r.includes('דרקר 10.2'),r.join(','));
  r=await type('דרג');
  eq('הקלדת "דרג" – דרגון ראשון',r[0],'דרגון');
  r=await type('דרק');
  eq('הקלדת "דרק" – דרקר ראשון',r[0],'דרקר 10.2');
  r=await type('פס');
  ok('הקלדת "פס" מציגה את פסטיון',r.includes('פסטיון פלוס פסטה'),r.join(','));
  r=await type('בל');
  ok('הקלדת "בל" מציגה את בלוקיון',r.includes('בלוקיון פלוס'),r.join(','));

  r=await type('dragon');
  eq('חיפוש באנגלית מוצא את דרגון',r[0],'דרגון');
  r=await type('DRAKER');
  eq('אותיות גדולות באנגלית',r[0],'דרקר 10.2');
  r=await type('Bifenthrin');
  eq('חיפוש לפי חומר פעיל באנגלית',r[0],'דרגון');
  r=await type('ביפנתרין');
  eq('חיפוש לפי חומר פעיל בעברית',r[0],'דרגון');
  r=await type('Pestion Plus');
  eq('שם חלופי מלא',r[0],'פסטיון פלוס פסטה');
  r=await type('דרקר 10.2');
  eq('התאמה מלאה',r[0],'דרקר 10.2');
  r=await type('דרקר-10.2');
  eq('מקפים ונקודות אינם משפיעים',r[0],'דרקר 10.2');
  r=await type('  דרקר   10.2  ');
  eq('רווחים כפולים אינם משפיעים',r[0],'דרקר 10.2');
  r=await type('פסטיון פלוס"');
  eq('גרשיים אינם משפיעים',r[0],'פסטיון פלוס פסטה');

  await p.fill('#pq','דרג');await p.waitForTimeout(320);
  eq('האותיות שהוקלדו מודגשות',
     await p.evaluate(()=>document.querySelector('.sugitem mark.hl').textContent),'דרג');
  const card=await p.textContent('.sugitem');
  ok('הכרטיס מציג רישום ותוקף',card.includes('640')&&card.includes('2030'),card);

  await p.fill('#pq','א');await p.waitForTimeout(320);
  const shown=(await p.$$('.sugitem')).length;
  ok('עד שמונה הצעות',shown<=8&&shown>0,'shown='+shown);
  ok('הודעה על תוצאות נוספות',(await p.textContent('#app')).includes('נמצאו תוצאות נוספות'));

  await p.fill('#pq','זזזזז');await p.waitForTimeout(320);
  ok('אין תוצאות – הודעה מתאימה',(await p.textContent('#app')).includes('לא נמצא חומר מתאים'));
  ok('קיים כפתור בקשה להוספת חומר',!!(await p.$('[data-a="reqProd"]')));
  await p.click('[data-a="reqProd"]');
  const req=await p.evaluate(()=>({list:S.prodRequests,total:PRODUCTS().length}));
  ok('הבקשה נשמרה בלבד ולא הוסיפה חומר',
     req.list.length===1&&req.list[0].q==='זזזזז'&&req.list[0].status==='ממתין לבדיקה'&&req.total===151,
     JSON.stringify(req));
});

console.log('\n5ב. מקלדת ובחירה');
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','דר');await p.waitForTimeout(320);
  await p.press('#pq','ArrowDown');
  eq('חץ למטה מסמן תוצאה',await p.evaluate(()=>sugState.active),0);
  await p.press('#pq','ArrowDown');
  eq('חץ נוסף מתקדם',await p.evaluate(()=>sugState.active),1);
  await p.press('#pq','ArrowUp');
  eq('חץ למעלה חוזר',await p.evaluate(()=>sugState.active),0);
  eq('ARIA מסמן את התוצאה הפעילה',
     await p.evaluate(()=>document.getElementById('pq').getAttribute('aria-activedescendant')),'sug-0');
  await p.press('#pq','Enter');
  await p.waitForTimeout(250);
  eq('Enter בוחר את התוצאה',await p.evaluate(()=>cur.apps[0].selectedMaterialId),'dragon');
  eq('הרשימה נסגרה',(await p.$$('.sugitem')).length,0);
  ok('החומר מוצג בשדה עם כפתור הסרה',!!(await p.$('.selchip'))&&!!(await p.$('.xbtn')));
  ok('מוצג שדה בחירת מזיק',(await p.textContent('#app')).includes('בחר מזיק'));
});
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','דר');await p.waitForTimeout(320);
  await p.press('#pq','Escape');
  await p.waitForTimeout(120);
  eq('Escape סוגר את ההצעות',(await p.$$('.sugitem')).length,0);
});

console.log('\n5ג. טעינת נתוני התווית והחלפת חומר');
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','דרגון');await p.waitForTimeout(320);
  await p.click('.sugitem');await p.waitForTimeout(250);
  const r=await p.evaluate(()=>({pid:cur.apps[0].selectedMaterialId,active:cur.apps[0].active,
    reg:cur.apps[0].registrationNumber,pests:(labelOf(cur.apps[0])||{}).targetPests,
    re:reentryFor(cur).minutes,batch:cur.apps[0].batch,exp:cur.apps[0].pkgExpiry,
    used:cur.apps[0].amountUsed}));
  eq('נטענו נתוני התווית הנכונים',[r.pid,r.active,r.reg,r.re],['dragon','Bifenthrin','640',60]);
  ok('נטענו המזיקים המותרים',r.pests.includes('פשפש המיטה'));
  eq('נתוני ביצוע לא מולאו',[r.batch,r.exp,r.used],['','','']);
  await p.evaluate(()=>{cur.apps[0].pest='תיקנים';touch();
    clearMaterial(cur.apps[0],cur);touch();render()});
  await p.fill('#pq','פסטיון');await p.waitForTimeout(320);
  await p.click('.sugitem');await p.waitForTimeout(250);
  const r2=await p.evaluate(()=>({pid:cur.apps[0].selectedMaterialId,active:cur.apps[0].active,
    pest:cur.apps[0].pest,re:reentryFor(cur).minutes,
    groups:warningGroups(cur).map(g=>g.name),
    txt:document.getElementById('app').textContent}));
  eq('נטען החומר החדש',[r2.pid,r2.active],['pastion-plus-pasta','Brodifacoum, Denatonium Benzoate']);
  eq('המזיק של החומר הקודם נוקה',r2.pest,'');
  eq('זמן הכניסה של דרגון נמחק',r2.re,0);
  eq('אין ערבוב אזהרות בין חומרים',r2.groups,['פסטיון פלוס פסטה']);
  ok('אזהרה ייחודית לדרגון אינה מוצגת',!r2.txt.includes('עלול להיות קטלני בבליעה'));
});

console.log('\n5ד. מזיק מהתווית בלבד');
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','פסטיון');await p.waitForTimeout(320);
  await p.click('.sugitem');await p.waitForTimeout(250);
  const chips=await p.evaluate(()=>[...document.querySelectorAll('[data-a="setPest"]')].map(x=>x.dataset.val));
  eq('רק המזיקים שבתווית',chips,['עכברים','חולדות']);
  await p.evaluate(()=>{A.setPest({i:0,val:'תיקנים'})});
  eq('מזיק שאינו בתווית אינו נבחר',await p.evaluate(()=>cur.apps[0].pest),'');
  await p.evaluate(()=>{A.setPest({i:0,val:'חולדות'})});
  eq('מזיק מהתווית נבחר',await p.evaluate(()=>cur.apps[0].pest),'חולדות');
});

console.log('\n5ה. תכשיר ללא נתוני אימות ניתן לבחירה');
await page(async p=>{
  await startJ(p);
  const m=await p.evaluate(()=>{const x=PRODUCTS().find(y=>y.verificationStatus==='unknown');
    return {id:x.id,name:x.nameHe}});
  await p.fill('#pq',m.name);await p.waitForTimeout(320);
  const r=await p.evaluate(i=>{
    const el=[...document.querySelectorAll('.sugitem')].find(x=>x.dataset.mid===i);
    return {found:!!el,disabled:!!(el&&(el.disabled||el.getAttribute('aria-disabled')==='true')),
      pickable:!!(el&&el.dataset.a),txt:el?el.textContent:''};
  },m.id);
  ok('התכשיר מופיע בחיפוש',r.found);
  ok('אינו מושבת וניתן לבחירה',!r.disabled&&r.pickable);
  ok('לא מוצג "לא ניתן לשימוש"',!r.txt.includes('לא ניתן לשימוש'));
  await p.click(`.sugitem[data-mid="${m.id}"]`);await p.waitForTimeout(250);
  eq('נכנס ליומן',await p.evaluate(()=>cur.apps[0].selectedMaterialId),m.id);
});

console.log('\n5ו. בחירת חומר מתוצאות החיפוש (רגרסיה לתקלה)');
/* התקלה: ל-.sec היה overflow:hidden, והרשימה הממוקמת absolute נחתכה.
   כל תוצאה מתחת לגבול הסקשן לא קיבלה את הלחיצה. */
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','דר');await p.waitForTimeout(320);
  const hits=await p.evaluate(()=>[...document.querySelectorAll('.sugitem')].map((el,i)=>{
    const r=el.getBoundingClientRect(),h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return {i,name:el.querySelector('b').textContent,inside:!!(h&&el.contains(h))};
  }));
  ok('כל תוצאה בחיפוש ניתנת ללחיצה, לא רק הראשונה',
     hits.length>1&&hits.every(h=>h.inside),JSON.stringify(hits));
  ok('הרשימה אינה נחתכת על ידי הסקשן',
     await p.evaluate(()=>getComputedStyle(document.querySelector('.sec.openflow')).overflow==='visible'));
  ok('כל תוצאה היא כפתור אמיתי',
     await p.evaluate(()=>[...document.querySelectorAll('.sugitem')].every(e=>e.tagName==='BUTTON'&&e.type==='button')));
  ok('לכל תוצאה מזהה ייחודי לפי מזהה החומר',
     await p.evaluate(()=>{const ids=[...document.querySelectorAll('.sugitem')].map(e=>e.dataset.mid);
       return ids.every(Boolean)&&new Set(ids).size===ids.length}));
  ok('אין שכבה שחוסמת לחיצות',
     await p.evaluate(()=>[...document.querySelectorAll('.sugitem')].every(e=>getComputedStyle(e).pointerEvents!=='none')));
  ok('אין תוצאה מושבתת ואין מנעול',
     await p.evaluate(()=>document.querySelectorAll('.sugitem[disabled],.sugitem[aria-disabled="true"]').length===0));
  ok('כל תוצאה ניתנת לבחירה',
     await p.evaluate(()=>[...document.querySelectorAll('.sugitem')].every(e=>e.dataset.a==='pickProd')));
});

/* 1-3: לחיצה על כל אחד מהחומרים המאומתים */
for(const [q,name,id] of [['דרג','דרגון','dragon'],['דרק','דרקר 10.2','draker-10-2'],['פס','פסטיון פלוס פסטה','pastion-plus-pasta']]){
  await page(async p=>{
    await startJ(p);
    await p.fill('#pq',q);await p.waitForTimeout(320);
    await p.click(`.sugitem[data-mid="${id}"]`);
    await p.waitForTimeout(300);
    const r=await p.evaluate(()=>({id:cur.apps[0].selectedMaterialId,nm:cur.apps[0].selectedMaterialName,
      det:!!cur.apps[0].materialDetails,txt:document.getElementById('app').textContent}));
    eq(`הקלדת "${q}" ולחיצה על ${name} מכניסה אותו ליומן`,[r.id,r.nm],[id,name]);
    ok('נטענה תבנית החומר',r.det&&r.txt.includes(name));
  });
}
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','דרק');await p.waitForTimeout(320);
  await p.click('.sugitem[data-mid="draker-10-2"]');await p.waitForTimeout(300);
  const t=await p.textContent('#app');
  ok('תבנית דרקר: אזהרות וזמן כניסה',t.includes('חשוד כגורם לסרטן')&&t.includes('זמן כניסה מחדש'));
  ok('תבנית דרקר: מזיקי התווית בלבד',
     (await p.evaluate(()=>[...document.querySelectorAll('[data-a="setPest"]')].map(x=>x.dataset.val)))
       .every(x=>['תיקנים','נמלים','חרקים זוחלים אחרים','זבובים','יתושים','חרקים מעופפים אחרים'].includes(x)));
});
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','פס');await p.waitForTimeout(320);
  await p.click('.sugitem[data-mid="pastion-plus-pasta"]');await p.waitForTimeout(300);
  const chips=await p.evaluate(()=>[...document.querySelectorAll('[data-a="setPest"]')].map(x=>x.dataset.val));
  eq('תבנית מכרסמים: עכברים וחולדות',chips,['עכברים','חולדות']);
  await p.evaluate(()=>{A.setPest({i:0,val:'חולדות'})});
  const t=await p.textContent('#app');
  ok('מוצגים שדות תיבות האכלה',t.includes('תיבות האכלה שהוצבו'));
  eq('אין זמן כניסה מחדש של ריסוס',await p.evaluate(()=>reentryFor(cur).minutes),0);
});

console.log('\n5ז. מגע, blur, מקלדת ושמירה');
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','דרג');await p.waitForTimeout(320);
  /* מגע אמיתי */
  const box=await p.evaluate(()=>{const r=document.querySelector('.sugitem').getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2}});
  await p.touchscreen.tap(box.x,box.y);
  await p.waitForTimeout(300);
  eq('לחיצה במגע בוחרת את החומר',await p.evaluate(()=>cur.apps[0].selectedMaterialId),'dragon');
});
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','דרג');await p.waitForTimeout(320);
  /* blur מיד לפני הלחיצה – pointerdown חייב לתפוס ראשון */
  const r=await p.evaluate(()=>{
    const el=document.querySelector('.sugitem');
    let blurred=false;
    document.getElementById('pq').addEventListener('blur',()=>{blurred=true});
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));
    return {picked:cur.apps[0].selectedMaterialId,blurred};
  });
  eq('blur אינו מבטל את הבחירה',r.picked,'dragon');
});
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','דרג');await p.waitForTimeout(320);
  await p.press('#pq','ArrowDown');
  await p.press('#pq','Enter');
  await p.waitForTimeout(300);
  eq('Enter בוחר כמו לחיצה',await p.evaluate(()=>cur.apps[0].selectedMaterialId),'dragon');
});
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','בל');await p.waitForTimeout(320);
  await p.evaluate(()=>{const el=document.querySelector('.sugitem[data-mid="blokion-plus"]');
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}))});
  await p.waitForTimeout(250);
  eq('בלוקיון נכנס ליומן כרגיל',await p.evaluate(()=>cur.apps[0].selectedMaterialId),'blokion-plus');
  ok('אין הודעת חסימה',
     !(await p.textContent('#app')).includes('לא ניתן לבחור בחומר זה'));
});

console.log('\n5ח. שמירה, רענון והחלפה');
await page(async p=>{
  await startJ(p);
  const errs=await p.evaluate(()=>validate(cur).filter(e=>e.msg.includes('יש לבחור חומר מתוך תוצאות החיפוש')).length);
  ok('שמירה חסומה כשלא נבחר חומר',errs>0);
  /* טקסט חופשי בשדה אינו נחשב בחירה */
  await p.fill('#pq','חומר שלא קיים');await p.waitForTimeout(320);
  const r=await p.evaluate(()=>({id:cur.apps[0].selectedMaterialId,
    blocked:validate(cur).filter(e=>e.msg.includes('יש לבחור חומר')).length}));
  eq('טקסט חופשי אינו נשמר כחומר',r.id,'');
  ok('השמירה עדיין חסומה',r.blocked>0);
});
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','דרג');await p.waitForTimeout(320);
  await p.click('.sugitem[data-mid="dragon"]');await p.waitForTimeout(300);
  const jid=await p.evaluate(()=>cur.id);
  const stored=await p.evaluate(()=>JSON.parse(localStorage.getItem('yp-reg-log-v2')));
  const app=stored.journals[jid].apps[0];
  eq('מזהה החומר נשמר באחסון ולא רק בזיכרון המסך',
     [app.selectedMaterialId,app.selectedMaterialName],['dragon','דרגון']);
  ok('נתוני התווית נשמרו עם היומן',!!app.materialDetails&&app.materialDetails.registrationNumber==='640');
  /* רענון הדף */
  await p.reload();
  await p.waitForFunction(()=>document.querySelector('#app')&&document.querySelector('#app').children.length>0);
  await p.evaluate(id=>{cur=S.journals[id];cur.step=4;view='wizard';render()},jid);
  await p.waitForTimeout(200);
  const after=await p.evaluate(()=>({id:cur.apps[0].selectedMaterialId,
    nm:cur.apps[0].selectedMaterialName,chip:!!document.querySelector('.selchip'),
    txt:document.getElementById('app').textContent}));
  eq('לאחר רענון החומר עדיין מופיע',[after.id,after.nm],['dragon','דרגון']);
  ok('החומר מוצג בשדה ולא נדרשת בחירה מחדש',after.chip&&after.txt.includes('דרגון'));
});
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','דרג');await p.waitForTimeout(320);
  await p.click('.sugitem[data-mid="dragon"]');await p.waitForTimeout(300);
  await p.evaluate(()=>{A.setPest({i:0,val:'תיקנים'});cur.apps[0].batch='B1';
    cur.apps[0].amountUsed='100';touch()});
  await p.evaluate(()=>{clearMaterial(cur.apps[0],cur);touch();render()});
  await p.fill('#pq','פס');await p.waitForTimeout(320);
  await p.click('.sugitem[data-mid="pastion-plus-pasta"]');await p.waitForTimeout(300);
  const r=await p.evaluate(()=>({id:cur.apps[0].selectedMaterialId,pest:cur.apps[0].pest,
    batch:cur.apps[0].batch,used:cur.apps[0].amountUsed,
    groups:warningGroups(cur).map(g=>g.name),txt:document.getElementById('app').textContent}));
  eq('החלפת חומר טוענת רק את החדש',r.id,'pastion-plus-pasta');
  eq('המזיק והכמויות של הקודם נמחקו',[r.pest,r.batch,r.used],['','','']);
  eq('אין ערבוב אזהרות',r.groups,['פסטיון פלוס פסטה']);
  ok('אזהרת דרגון נעלמה',!r.txt.includes('עלול להיות קטלני בבליעה'));
});
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','דרג');await p.waitForTimeout(320);
  await p.click('.sugitem[data-mid="dragon"]');await p.waitForTimeout(300);
  await p.evaluate(()=>{A.setPest({i:0,val:'תיקנים'});touch()});
  await p.evaluate(()=>{window.__ask=ask;ask=async()=>true});
  await p.click('.xbtn');await p.waitForTimeout(300);
  const r=await p.evaluate(()=>({id:cur.apps[0].selectedMaterialId,nm:cur.apps[0].selectedMaterialName,
    det:cur.apps[0].materialDetails,pest:cur.apps[0].pest,input:!!document.getElementById('pq')}));
  eq('X מנקה את החומר לגמרי',[r.id,r.nm,r.det,r.pest],['','',null,'']);
  ok('שדה החיפוש חוזר למצב ריק',r.input);
});

console.log('\n6. כל חומר ניתן לבחירה');
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','בל');await p.waitForTimeout(320);
  const r=await p.evaluate(()=>({
    shown:[...document.querySelectorAll('.sugitem .smain b')].map(x=>x.textContent),
    locked:document.querySelectorAll('.sugitem[disabled],.sugitem[aria-disabled="true"]').length,
    locks:document.querySelectorAll('.sugbox .sicon svg rect[y="11"]').length,
    txt:document.querySelector('.sugbox').textContent}));
  ok('בלוקיון מופיע בתוצאות',r.shown.includes('בלוקיון פלוס'),r.shown.join(','));
  eq('אין תוצאה מושבתת',r.locked,0);
  ok('לא מוצג הכיתוב "לא ניתן לשימוש"',!r.txt.includes('לא ניתן לשימוש'));
  await p.click('.sugitem[data-mid="blokion-plus"]');
  await p.waitForTimeout(300);
  const after=await p.evaluate(()=>({id:cur.apps[0].selectedMaterialId,
    nm:cur.apps[0].selectedMaterialName,txt:document.getElementById('app').textContent}));
  eq('בלוקיון נכנס ליומן',[after.id,after.nm],['blokion-plus','בלוקיון פלוס']);
  ok('לא מוצגת הודעת חסימה',!after.txt.includes('לא ניתן לבחור בחומר זה'));
  ok('מוצג תג מידע כתום',after.txt.includes('מידע יושלם בהמשך'));
  ok('המסך נקי מהודעות "אין לנו את זה"',
     !after.txt.includes('לא נשמרו במערכת אזהרות')&&
     !after.txt.includes('לא הוזנו נתונים מהתווית')&&
     !after.txt.includes('פרטי רישום לא הוזנו'),after.txt.slice(0,200));
  ok('מוצגים שדות ריקים למילוי',after.txt.includes('אזהרות והנחיות ללקוח')&&
     after.txt.includes('זמן כניסה מחדש')&&after.txt.includes('הזנה ידנית'));
});
await page(async p=>{
  await startJ(p);
  /* חמישה חומרים שונים מתוך הרשימה, כולל אלה שבצילום */
  for(const name of ['מאסטר פליי','מארש','גרנולר','סנו K-333','אנטי אנט']){
    const id=await p.evaluate(n=>{const x=PRODUCTS().find(y=>y.nameHe.includes(n));return x?x.id:''},name);
    if(!id){ok('נמצא במאגר: '+name,false);continue}
    await p.evaluate(()=>{clearMaterial(cur.apps[0],cur);touch();render()});
    await p.fill('#pq',name);await p.waitForTimeout(320);
    const has=await p.$(`.sugitem[data-mid="${id}"]`);
    if(!has){ok('נבחר: '+name,false,'לא הופיע בתוצאות');continue}
    await p.click(`.sugitem[data-mid="${id}"]`);await p.waitForTimeout(250);
    eq('נבחר בהצלחה: '+name,await p.evaluate(()=>cur.apps[0].selectedMaterialId),id);
  }
});
await page(async p=>{
  await startJ(p);
  /* לחיצה על כל שטח הכרטיס, לא רק על השם */
  await p.fill('#pq','מאסט');await p.waitForTimeout(320);
  const hit=await p.evaluate(()=>{
    const el=document.querySelector('.sugitem');
    const r=el.getBoundingClientRect();
    const pts=[[r.left+8,r.top+8],[r.right-8,r.bottom-8],[r.left+r.width/2,r.top+r.height/2]];
    return pts.map(([x,y])=>{const h=document.elementFromPoint(x,y);return !!(h&&el.contains(h))});
  });
  ok('כל שטח הכרטיס לחיץ',hit.every(Boolean),JSON.stringify(hit));
  const small=await p.evaluate(()=>{const s=document.querySelector('.sugitem small');
    s.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));
    return cur.apps[0].selectedMaterialId});
  ok('לחיצה על טקסט משני בכרטיס בוחרת את החומר',!!small);
});
await page(async p=>{
  await startJ(p);
  const id=await p.evaluate(()=>PRODUCTS().find(x=>x.verificationStatus==='unknown'&&!x.registrationExpiry).id);
  await p.evaluate(i=>{selectMaterial(prodById(i),{index:0});render()},id);
  const r=await p.evaluate(()=>({id:cur.apps[0].selectedMaterialId,
    errs:validate(cur).map(e=>e.msg)}));
  eq('חומר ללא תאריך תוקף נכנס ליומן',r.id,id);
  ok('אין שגיאת אימות שחוסמת בגלל סטטוס או תוקף',
     !r.errs.some(m=>m.includes('ממתין לאימות')||m.includes('תוקף הרישום')||m.includes('לא ניתן לשמור')),
     r.errs.join(' | '));
});
await page(async p=>{
  await startJ(p);
  await p.evaluate(()=>{prodById('dragon').registrationExpiry='2019';
    selectMaterial(prodById('dragon'),{index:0});render()});
  const r=await p.evaluate(()=>({id:cur.apps[0].selectedMaterialId,
    txt:document.getElementById('app').textContent,
    errs:validate(cur).filter(e=>e.msg.includes('תוקף')).length}));
  eq('חומר עם תוקף ישן נכנס ליומן',r.id,'dragon');
  ok('מוצגת אזהרה בלבד',r.txt.includes('תוקף הרישום המופיע במאגר דורש בדיקה'));
  ok('קיימת אפשרות "קראתי והבנתי"',r.txt.includes('קראתי והבנתי'));
  eq('האזהרה אינה חוסמת שמירה',r.errs,0);
  await p.click('[data-a="ackExpiry"]');await p.waitForTimeout(250);
  ok('האישור נרשם',await p.evaluate(()=>!!(cur.expiryAck||{})['dragon']));
});
await page(async p=>{
  await startJ(p);
  /* חומר ללא מזיקי תווית – המזיק מוזן ידנית והיומן ניתן לשמירה */
  await p.evaluate(()=>{selectMaterial(prodById('blokion-plus'),{index:0});render()});
  const t=await p.textContent('#app');
  ok('מוצג שדה מזיק להזנה ידנית',t.includes('הוזן ידנית'));
  await p.evaluate(()=>{const el=document.querySelector('[data-f="apps.0.pest"]');
    el.value='חולדות';el.dispatchEvent(new Event('input',{bubbles:true}))});
  const r=await p.evaluate(()=>({pest:cur.apps[0].pest,
    bad:validate(cur).filter(e=>e.msg.includes('אינו מופיע בתווית')).length}));
  eq('המזיק נשמר',r.pest,'חולדות');
  eq('אין חסימה על מזיק שלא בתווית',r.bad,0);
});
await page(async p=>{
  /* תבניות: אין תבנית חסומה */
  await p.evaluate(()=>go('templates'));
  const r=await p.evaluate(()=>({
    states:TREATMENTS.map(t=>tplState(t)),
    disabled:document.querySelectorAll('.tcard[disabled]').length,
    txt:document.getElementById('app').textContent}));
  ok('אין תבנית במצב blocked',!r.states.includes('blocked'),r.states.join(','));
  eq('אין כרטיס תבנית מושבת',r.disabled,0);
  ok('לא מוצגת הודעת הפעלה עתידית',!r.txt.includes('התבנית תופעל לאחר אימות'));
  ok('טעינת תבנית ללא יומן פתוח אינה קורסת',
     await p.evaluate(()=>{try{A.useTplHere({p:'t-blokion'});return true}catch(e){return false}}));
});
await page(async p=>{
  await startJ(p);
  await p.evaluate(()=>{A.useTplHere({p:'t-blokion'})});
  await p.waitForTimeout(200);
  eq('תבנית בלוקיון נטענת',await p.evaluate(()=>cur.apps[0].selectedMaterialId),'blokion-plus');
});

console.log('\n7. תוקף רישום שפג אינו חוסם');
await page(async p=>{
  await startJ(p);
  await pick(p,'dragon');
  const r=await p.evaluate(()=>{
    prodById('dragon').registrationExpiry='2020';
    return {expired:regExpired(prodById('dragon')),
      blocking:validate(cur).filter(e=>e.msg.includes('תוקף')||e.msg.includes('לא ניתן לשמור')).length,
      id:cur.apps[0].selectedMaterialId};
  });
  ok('מזוהה שתוקף הרישום חלף',r.expired);
  eq('החומר נשאר ביומן',r.id,'dragon');
  eq('אין חסימת שמירה בגלל תוקף',r.blocking,0);
});

console.log('\n8. שדות ביצוע – הזנה ידנית בלבד');
await page(async p=>{
  await startJ(p);
  await pick(p,'dragon');
  const a=await p.evaluate(()=>cur.apps[0]);
  eq('אצווה, תפוגה וכמויות ריקות לאחר בחירת החומר',
     [a.batch,a.pkgExpiry,a.amountUsed,a.waterAmount,a.areas],['','','','','']);
  ok('חומר פעיל ומספר רישום מולאו אוטומטית',a.active==='Bifenthrin'&&a.registrationNumber==='640');
  const errs=await p.evaluate(()=>validate(cur).map(e=>e.msg).filter(m=>m.includes('אצווה')||m.includes('תפוגה')||m.includes('כמות')||m.includes('אזורי')));
  ok('כולם נדרשים לפני סיום',errs.length>=4,errs.join(' | '));
});

console.log('\n9. תבניות טיפול');
await page(async p=>{
  await p.evaluate(()=>go('templates'));
  const t=await p.textContent('#app');
  ok('מסך התבניות נפתח',t.includes('תבניות טיפול'));
  ok('שש תבניות',(await p.$$('.tcard')).length>=6);
  eq('אין תבנית חסומה',(await p.$$('.tcard.blocked')).length,0);
  ok('אין כרטיס תבנית מושבת',(await p.$$('.tcard[disabled]')).length===0);
  const st=await p.evaluate(()=>TREATMENTS.map(x=>[x.id,tplState(x)]));
  eq('מצבי התבניות',st,[['t-dragon-crawling','ok'],['t-dragon-bedbug','choice'],
     ['t-draker-crawling','ok'],['t-pastion-mice','ok'],['t-pastion-rats','ok'],['t-blokion','info']]);
});
await page(async p=>{
  await startJ(p);
  await p.evaluate(()=>{A.useTplHere({p:'t-pastion-rats'})});
  const r=await p.evaluate(()=>({pid:cur.apps[0].selectedMaterialId,pest:cur.apps[0].pest,dos:cur.apps[0].dosageId,
    batch:cur.apps[0].batch,amount:cur.apps[0].amountUsed,tpl:cur.tplId}));
  eq('תבנית חולדות טוענת חומר ומזיק',[r.pid,r.pest],['pastion-plus-pasta','חולדות']);
  eq('התבנית אינה טוענת מינון',r.dos,'');
  eq('התבנית אינה ממלאת נתוני ביצוע',[r.batch,r.amount],['','']);
  ok('מוצג תג "נטען מתבנית מאומתת"',(await p.textContent('#app')).includes('נטען מתבנית מאומתת'));
  ok('לא מוצג שום מינון',!(await p.textContent('#app')).includes('100-300 גרם')&&
     !(await p.textContent('#app')).includes('10-60 גרם'));
});

console.log('\n10. תבנית לקוח וטעינה מיומן אחרון');
await page(async p=>{
  await p.evaluate(()=>go('client','c1'));
  await p.click('[data-a="ctplSave"]');
  const t=await p.evaluate(()=>S.clients.c1.siteTemplate);
  ok('התבנית נשמרה',!!t);
  ok('התבנית אינה שומרת אצווה, תפוגה, כמויות או חתימות',
     !('batch' in t)&&!('pkgExpiry' in t)&&!('amountUsed' in t)&&!('techSig' in t)&&!('findings' in t),
     Object.keys(t).join(','));
});
await page(async p=>{
  const r=await p.evaluate(async pl=>{
    await A.newJ();
    cur.client.name='מסעדת הגפן';cur.place=Object.assign(cur.place,pl);
    const p0=prodById('dragon');
    applyProduct(cur.apps[0],p0,{pest:'תיקנים'});
    cur.apps[0].batch='BX-1';cur.apps[0].pkgExpiry='2027-01-01';
    cur.apps[0].amountUsed='100 סמ"ק';cur.apps[0].waterAmount='10 ליטר';cur.apps[0].areas='מטבח';
    cur.findings[0].pest='תיקנים';cur.findings[0].signs='x';cur.findings[0].level='נמוכה';
    cur.findings[0].identification='x';cur.findings[0].location='מטבח';
    cur.status='done';cur.completedAt=Date.now();cur.techSig='sig';
    cur.handover={delivered:true,receiverName:'דנה',receiverSig:'sig'};
    const srcId=cur.id;S.journals[srcId]=cur;saveLocal();
    await A.newJ();
    cur.client.name='מסעדת הגפן';cur.place=Object.assign(cur.place,pl);touch();
    applyClone(cur,S.journals[srcId],ALL_SECTIONS());
    const a=cur.apps[0];
    return {pid:a.selectedMaterialId,dos:a.dosageId,batch:a.batch,exp:a.pkgExpiry,used:a.amountUsed,
      water:a.waterAmount,areas:a.areas,stations:(a.stations||[]).length,
      sig:cur.techSig,recv:cur.handover.receiverSig,
      pendingDose:(cur.verify['dose:'+a.id]||{}).state,
      pendingProd:(cur.verify['product:'+a.id]||{}).state};
  },PLACE);
  eq('החומר הועתק',r.pid,'dragon');
  eq('אין מינון להעתיק',r.dos,'');
  eq('אצווה, תפוגה וכמויות נוקו',[r.batch,r.exp,r.used,r.water,r.areas,r.stations],['','','','','',0]);
  eq('חתימות לא הועתקו',[r.sig,r.recv],[null,null]);
  eq('החומר דורש אישור מחדש',r.pendingProd,'pending');
});

console.log('\n11. אזהרות משויכות ותצוגות נפרדות');
const errs=await page(async p=>{
  await startJ(p);
  await p.evaluate(()=>{
    const d=prodById('dragon'),k=prodById('draker-10-2');
    applyProduct(cur.apps[0],d,{pest:'תיקנים'});cur.apps[0].dosageId='dragon-crawling';
    cur.apps.push(newApp());applyProduct(cur.apps[1],k,{pest:'נמלים'});
    cur.apps[1].surface='משטח סופג';cur.apps[1].dosageId='draker-absorbent';
    touch();render();
  });
  const g=await p.evaluate(()=>warningGroups(cur).map(x=>({n:x.name,h:x.label.warningsHuman.length})));
  eq('שתי קבוצות אזהרות נפרדות',g.map(x=>x.n),['דרגון','דרקר 10.2']);
  const txt=await p.textContent('#app');
  ok('אזהרה ייחודית לדרקר מופיעה',txt.includes('חשוד כגורם לסרטן'));
  ok('אזהרה ייחודית לדרגון מופיעה',txt.includes('עלול להיות קטלני בבליעה'));
  ok('שתי התצוגות קיימות',txt.includes('הנחיות ללקוח')&&txt.includes('מידע מקצועי למדביר'));
  ok('ציוד מגן אינו מוצג כדרישה מהלקוח',
     await p.evaluate(()=>{const c=customerView(cur);return !/ציוד מגן אישי/.test(c)}));
  ok('התצוגה המקצועית מציגה את פרטי הרישום',
     await p.evaluate(()=>{const v=professionalView(cur);
       return /640/.test(v)&&/569/.test(v)&&/מידע מקצועי למדביר/.test(v)}));
  const re=await p.evaluate(()=>reentryFor(cur));
  eq('שני זמנים מספריים',re.numeric.length,2);
  eq('הוחל הזמן המחמיר',re.minutes,60);
  ok('קישורי התוויות מוצגים',(await p.$$('a[href$=".pdf"]')).length>=2);
});
ok('אין שגיאות JavaScript',errs.length===0,errs.join(' | '));

console.log('\n12. RTL ועברית');
await page(async p=>{
  const r=await p.evaluate(()=>({dir:document.documentElement.dir,lang:document.documentElement.lang}));
  eq('הדף RTL בעברית',[r.dir,r.lang],['rtl','he']);
  await p.evaluate(()=>go('templates'));
  ok('מסך התבניות RTL',await p.evaluate(()=>getComputedStyle(document.querySelector('.tgrid')).direction==='rtl'));
  const overflow=await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1);
  ok('אין גלילה אופקית בנייד',overflow);
});

console.log('\n13. מילוי ידני ושימוש חוזר');
await page(async p=>{
  await startJ(p);
  await p.fill('#pq','מאסטר פליי');await p.waitForTimeout(320);
  await p.click('.sugitem');await p.waitForTimeout(300);
  const t=await p.textContent('#app');
  ok('אין ערימת הודעות על מידע חסר',
     !t.includes('לא נשמרו במערכת אזהרות')&&!t.includes('לא הוזנו נתונים מהתווית')&&
     !t.includes('מינונים ומגבלות ריסוס אינם נשמרים במערכת. יש לקחת'),t.slice(0,160));
  ok('מוצגים שדות ריקים למילוי',t.includes('אזהרות והנחיות ללקוח')&&
     t.includes('זמן כניסה מחדש')&&t.includes('מינון והוראות שימוש'));
  eq('השדות ריקים',await p.evaluate(()=>{const m=cur.apps[0].manualLabel||{};
    return [m.warnings||'',m.reentry||'',m.dosage||'']}),['','','']);
  ok('אין כפתור טעינה כשאין יומן קודם',!(await p.$('[data-a="loadManual"]')));
  ok('אין תצוגה מקצועית ריקה',!t.includes('מידע מקצועי למדביר'));
});
await page(async p=>{
  /* ממלאים פעם אחת ומסיימים יומן */
  const first=await p.evaluate(async pl=>{
    await A.newJ();
    cur.client.name='מסעדת הגפן';cur.place=Object.assign(cur.place,pl);
    const m=PRODUCTS().find(x=>x.nameHe==='מאסטר פליי');
    selectMaterial(m,{index:0});
    const a=cur.apps[0];
    a.pest='זבובים בוגרים';
    a.manualLabel={warnings:'לאוורר את המקום.\nלהרחיק ילדים עד להתייבשות.',
      reentry:'שעה לאחר הריסוס',dosage:'לפי התווית, 30 מ"ל ל-10 ליטר'};
    a.batch='MF-77';a.pkgExpiry='2027-05-01';a.amountUsed='30 מ"ל';
    a.waterAmount='10 ליטר';a.areas='מטבח ומחסן';
    cur.findings[0].pest='זבובים בוגרים';cur.findings[0].signs='x';
    cur.findings[0].level='נמוכה';cur.findings[0].identification='x';cur.findings[0].location='מטבח';
    cur.status='done';cur.completedAt=Date.now();cur.techSig='s';
    cur.handover={delivered:true,receiverName:'דנה',receiverSig:'s'};
    S.journals[cur.id]=cur;saveLocal();
    return {id:cur.id,no:cur.no};
  },PLACE);
  /* יומן חדש עם אותו חומר */
  await p.evaluate(async pl=>{
    await A.newJ();cur.client.name='מסעדת הגפן';
    cur.place=Object.assign(cur.place,pl);cur.step=4;
    selectMaterial(PRODUCTS().find(x=>x.nameHe==='מאסטר פליי'),{index:0});
    render();
  },PLACE);
  await p.waitForTimeout(250);
  ok('מוצע לטעון מהיומן הקודם',!!(await p.$('[data-a="loadManual"]')));
  ok('הכפתור מציין את מספר היומן',
     (await p.textContent('[data-a="loadManual"]')).includes('#'+first.no));
  eq('לפני הטעינה השדות ריקים',
     await p.evaluate(()=>(cur.apps[0].manualLabel||{}).warnings||''),'');
  await p.click('[data-a="loadManual"]');await p.waitForTimeout(300);
  const m=await p.evaluate(()=>cur.apps[0].manualLabel);
  ok('האזהרות נטענו',m.warnings.includes('לאוורר את המקום'),JSON.stringify(m));
  eq('זמן הכניסה נטען',m.reentry,'שעה לאחר הריסוס');
  ok('המינון נטען',m.dosage.includes('30 מ"ל'));
  const r=await p.evaluate(()=>({batch:cur.apps[0].batch,used:cur.apps[0].amountUsed,
    areas:cur.apps[0].areas,txt:document.getElementById('app').textContent,
    re:reentryFor(cur)}));
  eq('נתוני הביצוע לא נטענו',[r.batch,r.used,r.areas],['','','']);
  ok('האזהרות מוצגות בהנחיות ללקוח תחת שם החומר',
     r.txt.includes('אזהרות והנחיות שנמסרו ללקוח')&&r.txt.includes('לאוורר את המקום'));
  ok('זמן הכניסה הידני נכלל בחישוב',
     r.re.special.some(x=>x.product==='מאסטר פליי'&&x.text==='שעה לאחר הריסוס'),
     JSON.stringify(r.re));
});
await page(async p=>{
  await startJ(p);
  await p.evaluate(()=>{selectMaterial(PRODUCTS().find(x=>x.nameHe==='מאסטר פליי'),{index:0});
    cur.apps[0].pest='זבובים בוגרים';touch();render()});
  const errs=await p.evaluate(()=>validate(cur).map(e=>e.msg));
  ok('נדרשות אזהרות וזמן כניסה למילוי ידני',
     errs.some(m=>m.includes('אזהרות והנחיות ללקוח'))&&errs.some(m=>m.includes('זמן כניסה מחדש')),
     errs.join(' | '));
  await p.evaluate(()=>{cur.apps[0].manualLabel={warnings:'א',reentry:'ב',dosage:''};touch()});
  const after=await p.evaluate(()=>validate(cur).map(e=>e.msg));
  ok('לאחר מילוי אין יותר דרישה',
     !after.some(m=>m.includes('אזהרות והנחיות ללקוח'))&&!after.some(m=>m.includes('זמן כניסה מחדש')),
     after.join(' | '));
  ok('מינון אינו חובה',!after.some(m=>m.includes('מינון והוראות שימוש')));
});

console.log('\n14. טיוטה, רוחבי אייפון ושגיאות ריצה');
/* 13 – שמירת טיוטה ופתיחתה מחדש אחרי רענון */
await page(async p=>{
  await startJ(p);
  await pick(p,'dragon');
  await p.evaluate(()=>{const a=cur.apps[0];
    a.batch='LOT-5512';a.pkgExpiry='2028-03-01';a.amountUsed='40 מ"ל';a.areas='מטבח';
    cur.findings[0].pest='תיקן גרמני';cur.findings[0].signs='פעילות מאחורי המקרר';
    touch()});
  const jid=await p.evaluate(()=>cur.id);
  await p.reload();
  await p.waitForFunction(()=>document.querySelector('#app')&&document.querySelector('#app').children.length>0);
  const stored=await p.evaluate(i=>{const j=S.journals[i];return j?{st:j.status,mid:j.apps[0].selectedMaterialId,
    b:j.apps[0].batch,pest:j.findings[0].pest}:null},jid);
  ok('הטיוטה נשמרה ונפתחת מחדש',!!stored&&stored.st==='draft',JSON.stringify(stored));
  eq('החומר נשאר משויך לטיוטה',stored&&stored.mid,'dragon');
  eq('נתוני הביצוע נשארו בטיוטה',stored&&stored.b,'LOT-5512');
  await p.evaluate(i=>A.openJ({p:i}),jid);
  const t=await p.textContent('#app');
  ok('פתיחת הטיוטה מחזירה לאשף',await p.evaluate(()=>view==='wizard'));
  ok('החומר מוצג בטיוטה שנפתחה',t.includes('דרגון'));
});
/* 14 – רוחבי אייפון 320 עד 430, כולל המסכים החדשים */
for(const w of [320,375,430]){
  const ctx=await B.newContext({viewport:{width:w,height:820},hasTouch:true});
  const p=await ctx.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(x=>{try{if(!localStorage.getItem('yp-reg-log-v2'))localStorage.setItem('yp-reg-log-v2',x)}catch(e){}},seed);
  await p.goto(PAGE);
  await p.waitForFunction(()=>document.querySelector('#app')&&document.querySelector('#app').children.length>0);
  await p.evaluate(()=>{const t=todayStr();
    addStop(t,{clientId:'c1',name:'מסעדת הגפן',phone:'02-5551234',address:'הרצל 10, ירושלים',time:'08:30',duration:'45',focus:'מחסן אחורי'});
    addTask({title:'להזמין דרקר',date:todayStr()})});
  for(const v of ['home','route','tasks','calendar','materials','clients','archive','templates','profile']){
    await p.evaluate(x=>go(x),v);
    await p.waitForTimeout(90);
    const over=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    ok(`אין גלילה אופקית ב-${v} ברוחב ${w}`,over<=1,'עודף '+over+'px');
  }
  await p.evaluate(()=>go('home'));
  const small=await p.evaluate(()=>[...document.querySelectorAll('button,a')]
    .filter(el=>el.offsetParent!==null)
    .map(el=>{const r=el.getBoundingClientRect();return {t:(el.textContent||'').trim().slice(0,18),w:Math.round(r.width),h:Math.round(r.height)}})
    .filter(x=>x.w>0&&x.h>0&&(x.w<44||x.h<44)));
  ok(`אזורי לחיצה 44px במסך הבית ברוחב ${w}`,small.length===0,JSON.stringify(small));
  ok(`אין שגיאות JavaScript ברוחב ${w}`,errs.length===0,errs.join(' | '));
  await ctx.close();
}
/* 15 – מעבר על כל המסכים בלי שגיאות ריצה */
{
  const errs=await page(async p=>{
    const con=[];p.on('console',m=>{if(m.type()==='error')con.push(m.text())});
    await p.evaluate(()=>{const t=todayStr();
      addStop(t,{name:'בדיקה',address:'הרצל 1',time:'09:00'});addTask({title:'משימת בדיקה'})});
    for(const v of ['home','route','tasks','calendar','materials','clients','archive','templates','profile']){
      await p.evaluate(x=>go(x),v);await p.waitForTimeout(70);
    }
    await startJ(p);
    for(let i=0;i<8;i++){await p.evaluate(x=>{cur.step=x;render()},i);await p.waitForTimeout(60)}
    ok('אין שגיאות console במעבר על כל המסכים',con.length===0,con.join(' | '));
  });
  ok('אין שגיאות JavaScript במעבר על כל המסכים',errs.length===0,errs.join(' | '));
}

await B.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
if(fail){console.log('נכשלו:\n - '+fails.join('\n - '));process.exit(1)}
})().catch(e=>{console.error(e);process.exit(1)});
