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
  const p=await B.newPage({viewport:{width:430,height:950}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(s=>{localStorage.setItem('yp-reg-log-v2',s)},seed);
  await p.goto(PAGE);
  await p.waitForFunction(()=>document.querySelector('#app')&&document.querySelector('#app').children.length>0);
  try{await fn(p,errs)}finally{await p.close()}
  return errs;
}
const startJ=p=>p.evaluate(async pl=>{await A.newJ();cur.client.name='מסעדת הגפן';
  cur.place=Object.assign(cur.place,pl);cur.step=3;touch();render()},PLACE);

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
eq('אחד חסום',SEED.products.filter(p=>p.verificationStatus==='blocked').length,1);
ok('השאר מסומנים כלא מאומתים',
   SEED.products.filter(p=>p.verificationStatus==='needs_review').length===SEED.products.length-4);
ok('לתכשיר לא מאומת אין אזהרות, מינונים או זמן כניסה',
   SEED.products.filter(p=>p.verificationStatus==='needs_review').every(p=>
     !p.warningsHuman.length&&!p.warningsAnimals.length&&!p.warningsEnvironment.length&&
     !p.dosages.length&&!p.applicationRestrictions.length&&!p.reentry.text&&!p.reentry.minutes));
ok('לתכשיר לא מאומת אין מספר רישום או קישור לתווית',
   SEED.products.filter(p=>p.verificationStatus==='needs_review').every(p=>
     !p.registrationNumber&&!p.registrationExpiry&&!p.officialLabelUrl));
ok('לכל תכשיר לא מאומת יש מזיקי מטרה',
   SEED.products.filter(p=>p.verificationStatus==='needs_review').every(p=>p.targetPests.length>0));
ok('כל תכשיר לא מאומת נושא הסבר על מקור הנתונים',
   SEED.products.filter(p=>p.verificationStatus==='needs_review').every(p=>
     p.statusLabel.includes('לא אומת')&&p.verificationNote.includes('לא אומת')));
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
eq('בלוקיון – חסום ולא ניתן לבחירה',[bl.verificationStatus,bl.isSelectable,bl.statusLabel],
   ['blocked',false,'ממתין לאימות תווית ורישום בתוקף']);
ok('בלוקיון – אין בו שום תוכן תווית',
   [...bl.warningsHuman,...bl.warningsAnimals,...bl.warningsEnvironment,...bl.dosages,
    ...bl.targetPests,...bl.activeIngredients,...bl.applicationRestrictions].length===0&&
   !bl.reentry.text&&!bl.registrationNumber);
const pw=new Set(byId('pastion-plus-pasta').warningsHuman.concat(byId('pastion-plus-pasta').warningsAnimals));
ok('אזהרות פסטיון לא הועתקו לבלוקיון',
   !bl.warningsHuman.some(w=>pw.has(w))&&!bl.warningsAnimals.some(w=>pw.has(w)));
ok('לא נטען hash של קובץ תווית לאף מוצר',SEED.products.every(p=>p.labelSha256===''));
ok('לכל מוצר פעיל יש הערת מקור המסבירה את האימות',
   SEED.products.filter(p=>p.verificationStatus!=='blocked').every(p=>!!p.verificationNote));
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
  await p.click('[data-a="pickProd"][data-p="draker-10-2"]');
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
  await p.click('[data-a="pickProd"][data-p="dragon"]');
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
  await p.click('[data-a="pickProd"][data-p="pastion-plus-pasta"]');
  await p.evaluate(()=>{A.setPest({i:0,val:'עכברים'})});
  const r=await p.evaluate(()=>({re:reentryFor(cur),t:prodById('pastion-plus-pasta').reentry}));
  eq('אין זמן כניסה מספרי',r.re.minutes,0);
  eq('סוג הכניסה מחדש לפי התווית',r.t.type,'not_applicable_by_label');
  eq('נוסח הכניסה מחדש',r.t.text,'פיתיון בתיבות האכלה; יש לפעול לפי מגבלות התווית ומיקום התיבות');
  ok('לא מוצג "שעה" כזמן כניסה',!(await p.textContent('#app')).includes('זמן כניסה מחדש: שעה'));
  ok('מוצגות תיבות האכלה',(await p.textContent('#app')).includes('תיבות האכלה שהוצבו'));
});

console.log('\n5א. חיפוש ברשימה המלאה');
await page(async p=>{
  await startJ(p);
  ok('תיבת חיפוש קיימת',!!(await p.$('#pq')));
  const cards=(await p.$$('.pcard')).length;
  ok('לא כל 151 מוצגים בבת אחת',cards<60,'cards='+cards);
  const okc=(await p.$$('.pcard.ok')).length;
  ok('שלושת המאומתים מוצגים תמיד',okc===3,'ok='+okc);
  await p.evaluate(()=>{A._pq='סנו';render()});
  const hits=await p.evaluate(()=>{
    const shown=[...document.querySelectorAll('.pcard')].map(el=>el.dataset.p);
    return shown.filter(id=>{const x=prodById(id);
      if(!x||x.verificationStatus==='verified')return false;/* המאומתים מוצגים תמיד */
      const q='סנו';
      return !(x.nameHe.includes(q)||(x.manufacturer||'').includes(q)||
               ingText(x).includes(q)||(x.targetPests||[]).join(' ').includes(q));
    });
  });
  eq('כל תוצאה תואמת לחיפוש (שם, חומר פעיל, מזיק או בעל רישום)',hits,[]);
  const cnt=await p.evaluate(()=>document.querySelectorAll('.pcard').length);
  ok('החיפוש מצמצם את הרשימה',cnt>0&&cnt<SEED.products.length,'cards='+cnt);
  await p.evaluate(()=>{A._pq='fipronil';render()});
  const n2=await p.evaluate(()=>document.querySelectorAll('.pcard .pmain b').length);
  ok('חיפוש לפי חומר פעיל עובד',n2>0);
  await p.evaluate(()=>{A._pq='';A._pcat='rodents';render()});
  const c2=(await p.$$('.pcard')).length;
  ok('סינון לפי קטגוריה עובד',c2>0&&c2<40,'cards='+c2);
});
await page(async p=>{
  await startJ(p);
  const id=await p.evaluate(()=>PRODUCTS().find(x=>x.verificationStatus==='needs_review').id);
  await p.evaluate(i=>{A.pickProd({p:i,i:0})},id);
  const r=await p.evaluate(()=>({pid:cur.apps[0].pid,prod:cur.apps[0].product,
    pests:(labelOf(cur.apps[0])||{}).targetPests||[]}));
  ok('אפשר לבחור תכשיר מהרשימה',r.pid===id&&!!r.prod);
  ok('רשימת המזיקים נטענת מהרשימה',r.pests.length>0);
  const t=await p.textContent('#app');
  ok('מוצגת אזהרה שהתכשיר לא אומת',t.includes('לא אומת מול תווית'));
  ok('מוצג שאין אזהרות שמורות',t.includes('לא נשמרו במערכת אזהרות לתכשיר הזה'));
  eq('אין זמן כניסה מחדש',await p.evaluate(()=>reentryFor(cur).minutes),0);
});

console.log('\n6. בלוקיון חסום');
await page(async p=>{
  await startJ(p);
  await p.evaluate(()=>{A._pq='בלוקיון';render()});
  const r=await p.evaluate(()=>({blocked:prodBlocked(prodById('blokion-plus')),
    reason:prodBlockReason(prodById('blokion-plus')),
    disabled:!!document.querySelector('[data-p="blokion-plus"][disabled]')}));
  ok('בלוקיון מסומן כחסום',r.blocked&&r.reason.includes('ממתין לאימות'));
  ok('הכפתור מושבת במסך',r.disabled);
  await p.evaluate(()=>{A.pickProd({p:'blokion-plus',i:0})});
  eq('לחיצה עליו אינה בוחרת אותו',await p.evaluate(()=>cur.apps[0].pid),'');
  eq('תבנית בלוקיון חסומה',await p.evaluate(()=>tplState(tplById('t-blokion'))),'blocked');
  await p.evaluate(()=>{A.useTplHere({p:'t-blokion'})});
  eq('לא ניתן לטעון את תבנית בלוקיון',await p.evaluate(()=>cur.tplId||''),'');
});

console.log('\n7. תוקף רישום שפג חוסם יומן חדש');
await page(async p=>{
  await startJ(p);
  await p.click('[data-a="pickProd"][data-p="dragon"]');
  const r=await p.evaluate(()=>{
    prodById('dragon').registrationExpiry='2020';
    return {blocked:prodBlocked(prodById('dragon')),
      errs:validate(cur).filter(e=>e.msg.includes('תוקף')).length};
  });
  ok('מוצר שתוקפו פג מזוהה',r.blocked);
  ok('היומן החדש נחסם',r.errs>0);
  const hist=await p.evaluate(()=>{
    cur.status='done';const e=validate(cur).filter(x=>x.msg.includes('תוקף')).length;cur.status='draft';return e});
  eq('ביומן היסטורי הוא נשאר זמין',hist,0);
});

console.log('\n8. שדות ביצוע – הזנה ידנית בלבד');
await page(async p=>{
  await startJ(p);
  await p.click('[data-a="pickProd"][data-p="dragon"]');
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
  ok('תבנית חסומה עם מנעול',!!(await p.$('.tcard.blocked')));
  ok('הודעת ההפעלה של בלוקיון',t.includes('התבנית תופעל לאחר אימות תווית ורישום בתוקף'));
  const st=await p.evaluate(()=>TREATMENTS.map(x=>[x.id,tplState(x)]));
  eq('מצבי התבניות',st,[['t-dragon-crawling','ok'],['t-dragon-bedbug','choice'],
     ['t-draker-crawling','ok'],['t-pastion-mice','ok'],['t-pastion-rats','ok'],['t-blokion','blocked']]);
});
await page(async p=>{
  await startJ(p);
  await p.evaluate(()=>{A.useTplHere({p:'t-pastion-rats'})});
  const r=await p.evaluate(()=>({pid:cur.apps[0].pid,pest:cur.apps[0].pest,dos:cur.apps[0].dosageId,
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
    return {pid:a.pid,dos:a.dosageId,batch:a.batch,exp:a.pkgExpiry,used:a.amountUsed,
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
  ok('ציוד מגן מופיע רק בתצוגה המקצועית',
     await p.evaluate(()=>/ציוד מגן אישי/.test(professionalView(cur))));
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

await B.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
if(fail){console.log('נכשלו:\n - '+fails.join('\n - '));process.exit(1)}
})().catch(e=>{console.error(e);process.exit(1)});
