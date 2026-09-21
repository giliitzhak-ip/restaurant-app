/* בדיקות לפיצ'ר "טעינה מיומן אחרון" – רצות בדפדפן אמיתי מול public/pest-log.html
   הרצה:  npm test                                                            */
const path=require('path');
const {chromium}=require('playwright-core');

const PAGE='file://'+path.join(__dirname,'..','public','pest-log.html');
const EXE=process.env.CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let pass=0,fail=0;const fails=[];
function ok(name,cond,extra){
  if(cond){pass++;console.log('  ✓ '+name)}
  else{fail++;fails.push(name);console.log('  ✗ '+name+(extra?'\n      '+extra:''))}
}
const eq=(name,a,b)=>ok(name,JSON.stringify(a)===JSON.stringify(b),'expected '+JSON.stringify(b)+'  got '+JSON.stringify(a));

/* ---------- seed ---------- */
const PROFILE={company:'יצחק אחזקות והדברות',vat:'558436135',companyPhone:'02-6420555',
  companyEmail:'a@b.com',name:'יצחק כהן',license:'12345',phone:'050-1234567',
  email:'a@b.com',address:'ירושלים',licenseType:'במבנים ובשטח פתוח'};

function doneJournal(o){
  return Object.assign({
    id:o.id,no:o.no,status:'done',createdAt:1,updatedAt:1,completedAt:o.completedAt||1,
    date:o.date,time:'09:30',opKind:'הדברה רגילה',
    company:{name:PROFILE.company,vat:PROFILE.vat,phone:PROFILE.companyPhone,email:PROFILE.companyEmail},
    tech:{name:'יצחק כהן',license:'12345',phone:'050-1234567',email:'a@b.com',address:'ירושלים',licenseType:'במבנים ובשטח פתוח'},
    geo:{lat:31.77,lng:35.21,acc:5,at:1},stationChecks:{st1:{status:'נצרך במלואו',no:1}},
    hasOperator:false,operator:{name:'',phone:'',email:'',address:''},
    client:{name:o.client,role:'מנהל אחזקה',roleOther:'',phone:'02-5551234'},
    place:o.place,
    findings:[{id:'f1',pest:'תיקן גרמני',subtype:'',identification:'ניטור מלכודות',stage:'',
      signs:'תיקנים חיים מאחורי המקרר.',location:'מטבח',level:'בינונית'}],
    prevention:'איטום סדקים ופתחים בקירות ובצנרת.',
    circumstances:'נמצאה פעילות מזיקים בביקורת – נדרש טיפול להפחתת הפעילות.',
    warnBefore:{nature:'ריסוס שאריתי',product:'סופר ג\'ל',active:'fipronil',riskHuman:'להרחיק ילדים',
      riskAnimals:'להרחיק חיות מחמד',reentry:'4 שעות',other:''},
    apps:[{id:'a1',pest:'תיקן גרמני',product:'סופר ג\'ל',active:'fipronil',conc:'0.05%',
      batch:'BX-2291',dose:'3',unit:'גרם/מ"ר',unitOther:'',rtu:true,useConc:'',method:'אחר',methodOther:'ג\'ל',fromDb:false}],
    sealing:'',publicNotice:'',warnAfter:'לאוורר את האזור המטופל.',supplementary:'',
    needSupplementary:o.supp||false,natureAfter:'',
    warranty:{period:'3 חודשים',note:'אחריות ל-3 חודשים ממועד הטיפול.',kind:'months',amount:3,
      start:o.date,end:o.oldEnd||'2026-01-01',cond:'בכפוף לפעולות מניעה.',check:true,checkDays:30},
    hasAssistants:false,assistants:[],assistGuidance:false,assistCopy:false,
    spots:[{id:'sp1',name:'חדר אשפה',checked:true,note:''}],
    siteNotes:'שער אחורי נעול',access:'קוד שער 1234',
    handover:{delivered:true,receiverName:'דנה לוי',receiverSig:'data:image/png;base64,AAA'},
    techSig:'data:image/png;base64,BBB',verify:{},audit_events:[]
  },{});
}
const PLACE_A={kind:'building',city:'ירושלים',street:'הרצל',houseApt:'10',buildingType:'מפעל',
  buildingTypeOther:'',houseNo:'',aptNo:'',authority:'',siteType:'',siteTypeOther:'',siteDesc:'',coords:'',neighborhood:''};
const PLACE_B=Object.assign({},PLACE_A,{street:'יפו',houseApt:'55',buildingType:'בית מלון'});

function seed(extra){
  return JSON.stringify(Object.assign({
    counter:1010,pending:{},mine:[],photos:{},stations:{},
    profile:PROFILE,
    clients:{c1:{id:'c1',name:'מסעדת הגפן',phone:'02-5551234',role:'מנהל אחזקה',updatedAt:2,
      places:[PLACE_A,PLACE_B],regular:{on:true,service:'הדברה תקופתית',freq:'אחת לחודש'}}},
    journals:{}
  },extra||{}));
}

/* ---------- harness ---------- */
async function withPage(store,fn){
  const p=await BROWSER.newPage({viewport:{width:420,height:900}});
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(s=>{localStorage.setItem('yp-reg-log-v2',s)},store);
  await p.goto(PAGE);
  await p.waitForFunction(()=>document.querySelector('#app')&&document.querySelector('#app').children.length>0);
  try{await fn(p,errs)}finally{await p.close()}
  return errs;
}
/* open a fresh journal and put the client + place in, so the card can appear */
const startJournal=async(p,place)=>p.evaluate(async pl=>{
  await A.newJ();
  cur.client.name='מסעדת הגפן';cur.client.phone='02-5551234';
  cur.place=Object.assign(cur.place,pl);
  cur.step=1; /* שלב "לקוח ואתר" – שם מופיע כרטיס היומן הקודם */
  touch();render();
},place);

let BROWSER;
(async()=>{
BROWSER=await chromium.launch({executablePath:EXE,args:['--no-sandbox']});
const prev=doneJournal({id:'j1',no:1001,client:'מסעדת הגפן',place:PLACE_A,date:'2026-06-10',completedAt:2000,supp:true,oldEnd:'2026-09-10'});
const older=doneJournal({id:'j0',no:999,client:'מסעדת הגפן',place:PLACE_A,date:'2026-03-01',completedAt:1000});
older.apps[0].batch='OLD-111';older.apps[0].product='פרו-ג\'ל';older.findings[0].pest='נמלים';
const otherSite=doneJournal({id:'j2',no:1002,client:'מסעדת הגפן',place:PLACE_B,date:'2026-07-01',completedAt:3000});
otherSite.apps[0].batch='HOTEL-7';
const FULL=seed({journals:{j0:older,j1:prev,j2:otherSite}});

console.log('\n1. זיהוי יומן קודם');
await withPage(seed(),async p=>{
  await startJournal(p,PLACE_A);
  ok('לקוח חדש ללא יומן קודם – אין כרטיס',!(await p.$('.prevcard')));
});
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  ok('לקוח קבוע עם יומן קודם – מוצג כרטיס',!!(await p.$('.prevcard')));
  const t=await p.textContent('.prevcard .ph');
  ok('הכרטיס מציג מספר ותאריך',t.includes('1001')&&t.includes('10/06/2026'),t);
  ok('מסומן כלקוח אחזקה קבוע',(await p.textContent('.prevcard')).includes('לקוח אחזקה קבוע'));
  const kv=await p.textContent('.pkv');
  ok('תקציר: מזיקים',kv.includes('תיקן גרמני'));
  ok('תקציר: תכשירים',kv.includes('סופר ג\'ל'));
  ok('תקציר: אצווה',kv.includes('BX-2291'));
  ok('תקציר: אחריות',kv.includes('3 חודשים'));
  ok('דגשים: טיפול משלים',(await p.textContent('.pflags')).includes('טיפול משלים'));
  ok('שלוש אפשרויות',(await p.$$('[data-a="smartClone"],[data-a="pickSections"],[data-a="blankStart"]')).length===3);
});
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_B);
  const n=await p.evaluate(()=>findPrev(cur).j.no);
  eq('לקוח עם כמה אתרים – נבחר היומן של האתר הנכון',n,1002);
});
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  const n=await p.evaluate(()=>findPrev(cur).j.no);
  eq('נבחר היומן האחרון של האתר (ולא הישן)',n,1001);
});

console.log('\n2. שכפול חכם');
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  await p.click('[data-a="smartClone"]');
  const r=await p.evaluate(()=>({
    client:cur.client.name,role:cur.client.role,phone:cur.client.phone,
    street:cur.place.street,kind:cur.place.kind,notes:cur.siteNotes,access:cur.access,
    spots:(cur.spots||[]).map(s=>s.name),spotsChecked:(cur.spots||[]).some(s=>s.checked),
    product:cur.apps[0].product,active:cur.apps[0].active,method:cur.apps[0].method,
    batch:cur.apps[0].batch,dose:cur.apps[0].dose,
    findings:cur.findings.map(f=>f.pest),signs:cur.findings[0].signs,
    reentry:cur.warnBefore.reentry,risk:cur.warnBefore.riskHuman,
    src:cur.source_pest_log_id,sections:cur.copied_sections.length,
    status:cur.verification_status,pending:Object.values(cur.verify).filter(v=>v.state==='pending').length
  }));
  ok('הועתקו פרטי לקוח',r.client==='מסעדת הגפן'&&r.role==='מנהל אחזקה'&&r.phone==='02-5551234');
  ok('הועתקו כתובת וסוג מקום',r.street==='הרצל'&&r.kind==='building');
  ok('הועתקו הערות קבועות והוראות הגעה',r.notes==='שער אחורי נעול'&&r.access==='קוד שער 1234');
  eq('הועתקו מוקדי בדיקה (ללא הסימון הקודם)',[r.spots,r.spotsChecked],[['חדר אשפה'],false]);
  ok('הועתקו תכשיר, חומר פעיל ושיטה',r.product==='סופר ג\'ל'&&r.active==='fipronil'&&r.method==='אחר');
  eq('אצווה ומינון לא נטענו בברירת המחדל',[r.batch,r.dose],['','']);
  eq('הועתק שם המזיק',r.findings,['תיקן גרמני']);
  eq('ממצאי הניטור לא הועתקו בברירת המחדל',r.signs,'');
  ok('הועתקו אזהרות וזמן כניסה',r.reentry==='4 שעות'&&r.risk==='להרחיק ילדים');
  ok('נשמר קישור ליומן המקור',r.src==='j1'&&r.sections>0);
  ok('היומן במצב "ממתין לאימות"',r.status==='pending'&&r.pending>0);
});

console.log('\n3. מה שאסור להעתיק');
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  const before=await p.evaluate(()=>({no:cur.no,date:cur.date,time:cur.time}));
  await p.click('[data-a="smartClone"]');
  const r=await p.evaluate(()=>({
    no:cur.no,date:cur.date,time:cur.time,geo:cur.geo,sig:cur.techSig,
    recv:cur.handover.receiverSig,recvName:cur.handover.receiverName,
    delivered:cur.handover.delivered,status:cur.status,completedAt:cur.completedAt,
    checks:Object.keys(cur.stationChecks||{}).length,id:cur.id
  }));
  ok('מספר היומן לא הועתק',r.no!==1001&&r.no===before.no);
  ok('תאריך ושעה נשארו של הטיפול הנוכחי',r.date===before.date&&r.time===before.time);
  ok('נ"צ הטיפול הקודם לא הועתק',r.geo===null);
  ok('חתימות לא הועתקו',r.sig===null&&r.recv===null);
  ok('אישור המסירה ושם המקבל לא הועתקו',r.delivered===false&&r.recvName==='');
  ok('סטטוס וזמן השלמה לא הועתקו',r.status==='draft'&&r.completedAt===null);
  ok('תוצאות התחנות מהביקור הקודם לא הועתקו',r.checks===0);
  ok('מזהה חדש ליומן',r.id!=='j1');
});

console.log('\n4. בחירת פרטים להעתקה');
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  await p.click('[data-a="pickSections"]');
  ok('נפתחה חלונית בחירה',!!(await p.$('[data-sec]')));
  const def=await p.evaluate(()=>[...A._clSel]);
  ok('מספר אצווה אינו ניתן להעתקה כלל',
     !(await p.evaluate(()=>ALL_SECTIONS())).includes('batch'));
  ok('ברירת מחדל: מינון לא מסומן',!def.includes('dose'));
  ok('ברירת מחדל: ממצאים קודמים לא מסומנים',!def.includes('findings'));
  ok('ברירת מחדל: לקוח, כתובת, תחנות, תכשיר ואחריות מסומנים',
     ['client','address','stations','product','warPeriod','spots'].every(k=>def.includes(k)));
  await p.click('[data-a="secAll"]');
  eq('בחר הכול',await p.evaluate(()=>A._clSel.size),await p.evaluate(()=>ALL_SECTIONS().length));
  await p.click('[data-a="secNone"]');
  eq('נקה בחירה',await p.evaluate(()=>A._clSel.size),0);
  await p.click('[data-a="secDef"]');
  await p.evaluate(()=>{A._clSel=new Set(['product','dose']);sectionSheet()});
  await p.click('[data-a="secLoad"]');
  await p.click('[data-a="secLoadGo"]');
  const r=await p.evaluate(()=>({b:cur.apps[0].batch,p:cur.apps[0].product,
    keys:Object.keys(cur.verify),sections:cur.copied_sections}));
  ok('נטענו רק השדות שנבחרו',r.p==='סופר ג\'ל');
  ok('מספר האצווה לא הועתק גם כשנבחר מינון',r.b==='');
  ok('אין דרישת אימות לאצווה כי היא לא הועתקה',!r.keys.some(k=>k.startsWith('batch:')));
  ok('נשמרו קבוצות המידע שהועתקו',r.sections.includes('dose'));
});
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  await p.evaluate(()=>{A._clSrc='j1';A._clSel=new Set(['product','active']);sectionSheet()});
  await p.click('[data-a="secLoad"]');
  await p.click('[data-a="secLoadGo"]');
  const r=await p.evaluate(()=>({b:cur.apps[0].batch,p:cur.apps[0].product,
    hasBatchKey:Object.keys(cur.verify).some(k=>k.startsWith('batch:'))}));
  ok('העתקת תכשיר ללא אצווה',r.p==='סופר ג\'ל'&&r.b===''&&!r.hasBatchKey);
});

console.log('\n5. אימות אצווה, מינון ואזהרות');
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  await p.evaluate(()=>{A._clSrc='j1';A._clSel=new Set(ALL_SECTIONS());sectionSheet()});
  await p.click('[data-a="secLoad"]');
  await p.click('[data-a="secLoadGo"]');
  await p.evaluate(()=>{cur.step=4;render()});
  const id=await p.evaluate(()=>cur.apps[0].id);
  const ex=await p.evaluate(()=>({b:cur.apps[0].batch,e:cur.apps[0].pkgExpiry,
    u:cur.apps[0].amountUsed,w:cur.apps[0].waterAmount,a:cur.apps[0].areas}));
  eq('נתוני הביצוע נוקו בשכפול',[ex.b,ex.e,ex.u,ex.w,ex.a],['','','','','']);
  ok('מוצג "נדרש אימות"',(await p.textContent('#app')).includes('נדרש אימות'));
  /* ביומן ישן ללא תכשיר מהמאגר, המינון שבוצע הוא נתון ביצוע ולכן נוקה ולא הועתק */
  const dkey=await p.evaluate(i=>cur.verify['dose:'+i],id);
  ok('המינון שבוצע לא הועתק ולכן אין לו דרישת אימות',dkey===undefined,JSON.stringify(dkey));
  eq('שדה המינון נוקה',await p.evaluate(()=>cur.apps[0].dose),'');
  const pv=await p.evaluate(i=>(cur.verify['product:'+i]||{}).state,id);
  eq('התכשיר דורש אימות מחדש',pv,'pending');
  await p.click(`[data-a="vOk"][data-key="product:${id}"]`);
  const v=await p.evaluate(i=>cur.verify['product:'+i],id);
  ok('אישור התכשיר נשמר עם מי ומתי',v.state==='ok'&&v.at>0&&v.by.includes('יצחק כהן'),JSON.stringify(v));
  /* אזהרות דורשות אישור מפורש – עריכה לבדה לא מספיקה */
  await p.evaluate(()=>{cur.step=5;render()});
  await p.evaluate(()=>{const el=document.querySelector('[data-f="warnBefore.riskHuman"]');
    el.value='להרחיק ילדים ובעלי חיים';el.dispatchEvent(new Event('input',{bubbles:true}))});
  eq('עריכת אזהרה אינה מאמתת אותה לבד',await p.evaluate(()=>cur.verify.warnBefore.state),'pending');
  await p.click('[data-a="vOk"][data-key="warnBefore"]');
  eq('אישור מפורש של מסירת האזהרות',await p.evaluate(()=>cur.verify.warnBefore.state),'ok');
  ok('מוצג מאיזה תכשיר נלקחו האזהרות',(await p.textContent('#app')).includes('סופר ג\'ל'));
});

console.log('\n6. אישור מרוכז');
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  await p.evaluate(()=>{A._clSrc='j1';A._clSel=new Set(ALL_SECTIONS());sectionSheet()});
  await p.click('[data-a="secLoad"]');
  await p.click('[data-a="secLoadGo"]');
  await p.evaluate(()=>{cur.step=7;render()});
  const r=await p.evaluate(()=>{
    const pend=Object.keys(cur.verify).filter(k=>cur.verify[k].state==='pending');
    return {bulk:pend.filter(k=>vBulkOk(k)),strict:pend.filter(k=>!vBulkOk(k))};
  });
  ok('ממצאים ואזהרות אינם ניתנים לאישור מרוכז',
     r.strict.some(k=>k.startsWith('finding:'))&&r.strict.includes('warnBefore')&&
     r.strict.includes('reentry')&&r.strict.includes('warnAfter'),
     JSON.stringify(r));
  ok('אצווה לעולם אינה ברשימה כי אינה מועתקת',
     !r.bulk.concat(r.strict).some(k=>k.startsWith('batch:')),JSON.stringify(r));
  await p.click('[data-a="vOkBulk"]');
  const after=await p.evaluate(()=>Object.keys(cur.verify).filter(k=>cur.verify[k].state==='pending'));
  ok('האישור המרוכז לא נגע בשדות הרגישים',
     after.includes('reentry')&&after.includes('warnBefore')&&after.some(k=>k.startsWith('finding:')),
     JSON.stringify(after));
  ok('פס ההתקדמות מוצג',!!(await p.$('.vbar i')));
});

console.log('\n7. חסימת סיום כל עוד יש שדות לא מאומתים');
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  await p.evaluate(()=>{A._clSrc='j1';A._clSel=new Set(ALL_SECTIONS());sectionSheet()});
  await p.click('[data-a="secLoad"]');
  await p.click('[data-a="secLoadGo"]');
  const r=await p.evaluate(()=>{
    /* להשלים את כל שאר השדות כדי שרק האימות ייחסום */
    cur.findings[0].signs='נמצאו תיקנים';cur.findings[0].level='בינונית';
    cur.handover.delivered=true;cur.handover.receiverName='דנה';
    cur.handover.receiverSig='x';cur.techSig='y';
    const errs=validate(cur);
    return {blocked:errs.filter(e=>e.path.startsWith('verify:')).length,total:errs.length};
  });
  ok('שדות לא מאומתים חוסמים את הסיום',r.blocked>0,JSON.stringify(r));
  await p.evaluate(()=>{Object.keys(cur.verify).forEach(k=>vOkMark(cur,k,'kept'))});
  eq('לאחר אימות מלא אין יותר חסימת אימות',
     await p.evaluate(()=>validate(cur).filter(e=>e.path.startsWith('verify:')).length),0);
  eq('סטטוס האימות',await p.evaluate(()=>cur.verification_status),'verified');
  ok('נשמר מי אימת ומתי',await p.evaluate(()=>!!cur.verified_at&&!!cur.verified_by));
});

console.log('\n8. אחריות');
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  await p.evaluate(()=>{cur.date='2026-09-20';touch()});
  await p.evaluate(()=>{A._clSrc='j1';A._clSel=new Set(ALL_SECTIONS());sectionSheet()});
  await p.click('[data-a="secLoad"]');
  await p.click('[data-a="secLoadGo"]');
  const w=await p.evaluate(()=>cur.warranty);
  eq('תקופת האחריות הועתקה',[w.kind,w.amount],['months',3]);
  eq('תאריך הסיום חושב מחדש ממועד הטיפול',w.end,'2026-12-20');
  ok('תאריך הסיום הישן לא הועתק',w.end!=='2026-09-10');
  eq('תאריך ההתחלה הוא מועד הטיפול',w.start,'2026-09-20');
  eq('חושב מועד ביקור בקרה',w.checkAt,'2026-10-20');
  /* שינוי תאריך הטיפול מזיז את סוף האחריות */
  await p.evaluate(()=>{cur.date='2026-10-01';touch()});
  eq('שינוי מועד הטיפול מחשב מחדש את האחריות',await p.evaluate(()=>cur.warranty.end),'2027-01-01');
  /* תבניות */
  const n=await p.evaluate(()=>S.warTpls.length);
  ok('קיימות תבניות אחריות מובנות',n>=7,'got '+n);
  await p.evaluate(()=>{const t=S.warTpls.find(x=>x.id==='w-30d');applyWarTpl(cur,t);touch()});
  const w2=await p.evaluate(()=>cur.warranty);
  eq('תבנית 30 יום מחושבת נכון',[w2.period,w2.end],['30 ימים','2026-10-31']);
});

console.log('\n9. יומן קודם שאינו האחרון + השוואה');
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  await p.click('[data-a="pickPrev"]');
  const txt=await p.textContent('#sheet');
  ok('הרשימה מציגה מספר, תאריך, מזיקים, תכשירים ואצוות',
     txt.includes('#1001')&&txt.includes('#999')&&txt.includes('נמלים')&&txt.includes('OLD-111'));
  ok('היומן האחרון מסומן',txt.includes('האחרון'));
  ok('טיוטות אינן ברשימה',!txt.includes('טיוטה נוכחית'));
  await p.click('[data-a="prevPick"][data-p="j0"]');
  await p.evaluate(()=>{A._clSel=new Set(ALL_SECTIONS());sectionSheet()});
  await p.click('[data-a="secLoad"]');
  await p.click('[data-a="secLoadGo"]');
  const r=await p.evaluate(()=>({no:cur.cloned_from_no,pest:cur.findings[0].pest,
    b:cur.apps[0].batch,prod:cur.apps[0].product}));
  eq('נטען מיומן ישן שנבחר ידנית',[r.no,r.pest,r.prod],[999,'נמלים',"פרו-ג'ל"]);
  eq('האצווה מהיומן הישן לא הועתקה',r.b,'');
  /* השוואה */
  await p.evaluate(()=>{cur.apps[0].batch='NEW-999';cur.findings[0].level='גבוהה';touch()});
  /* האצווה החדשה הוזנה ידנית בטיפול הזה, ולכן ההשוואה מראה שינוי מול הישנה */
  await p.click('[data-a="compare"]');
  const c=await p.textContent('#sheet');
  ok('ההשוואה מציגה ערך קודם וערך נוכחי',c.includes('OLD-111')&&c.includes('NEW-999'));
  ok('ההשוואה מסמנת מה השתנה',c.includes('שונה'));
  ok('ההשוואה מדגישה שינוי אצווה',(await p.$$('.cmp tr.hot')).length>0);
});

console.log('\n10. מניעת כפילויות ועצמאות היומן');
await withPage(FULL,async p=>{
  const n=await p.evaluate(async()=>{
    await Promise.all([A.newJ(),A.newJ(),A.newJ()]);
    return Object.keys(S.journals).length;
  });
  eq('לחיצות כפולות אינן יוצרות כמה יומנים',n,4);
});
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  const found=await p.evaluate(()=>{
    const d=openDraftForSite('מסעדת הגפן',cur.place,null);
    return d?d.id===cur.id:false;
  });
  ok('מזוהה טיוטה פתוחה לאותו אתר',found);
});
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  await p.click('[data-a="smartClone"]');
  const r=await p.evaluate(()=>{
    cur.findings[0].pest='נמלים';cur.apps[0].product='אחר';touch();
    const src=S.journals.j1;
    return {srcPest:src.findings[0].pest,srcProd:src.apps[0].product,srcVerify:Object.keys(src.verify||{}).length};
  });
  eq('שינוי היומן החדש לא נגע ביומן המקור',[r.srcPest,r.srcProd,r.srcVerify],['תיקן גרמני','סופר ג\'ל',0]);
});

console.log('\n11. עבודה ללא ענן + ביטול טעינה');
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  await p.click('[data-a="smartClone"]');
  ok('ללא חיבור לענן – הנתונים מסומנים כעשויים להיות לא מעודכנים',
     await p.evaluate(()=>cur.clone_stale===true));
  ok('מוצגת התראה במסך',(await p.textContent('#app')).includes('ייתכן שאינם מעודכנים'));
  ok('נרשם audit trail ביומן',await p.evaluate(()=>cur.audit_events.some(e=>e.ev==='clone')));
  ok('נרשם גם ב-audit הכללי',await p.evaluate(()=>S.auditEvents.some(e=>e.ev==='clone')));
  await p.evaluate(()=>clearClone(cur));
  const r=await p.evaluate(()=>({v:Object.keys(cur.verify).length,src:cur.source_pest_log_id,
    st:cur.verification_status,prod:cur.apps[0].product}));
  eq('ביטול הטעינה מסיר את דרישת האימות',[r.v,r.src,r.st],[0,null,'none']);
  ok('הערכים שכבר הוזנו נשארים',r.prod==='סופר ג\'ל');
});

console.log('\n12. אימות תכשיר ותווית');
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  const r=await p.evaluate(()=>({
    known:labelCheck('סופר ג\'ל').ok,
    unknown:labelCheck('תכשיר שלא קיים').ok,
    why:labelCheck('תכשיר שלא קיים').why,
    fit:labelFit({product:'סופר ג\'ל',pest:'תיקן גרמני'}),
    bad:labelFit({product:'סופר ג\'ל',pest:'חולדות'})
  }));
  ok('תכשיר מהמאגר מזוהה',r.known===true);
  ok('תכשיר שאינו במאגר אינו מאומת',r.unknown===false&&!!r.why);
  ok('התאמת מזיק לרישום – תקין',r.fit===null);
  ok('התאמת מזיק לרישום – אי התאמה מזוהה',typeof r.bad==='string'&&r.bad.includes('חולדות'));
  await p.evaluate(()=>{cur.apps[0].product='תכשיר שלא קיים';cur.step=4;touch();render()});
  ok('מוצגת אזהרה על תכשיר שלא ניתן לאמת',
     (await p.textContent('#app')).includes('לא ניתן לאמת את התכשיר'));
});

console.log('\n14. מסך השוואה לפני הטעינה');
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  await p.evaluate(()=>{cur.prevention='הוזן ידנית לפני הטעינה';A._clSrc='j1';
    A._clSel=new Set(['product','dose','prevention','reentry']);sectionSheet()});
  await p.click('[data-a="secLoad"]');
  const t=await p.textContent('.sheet');
  ok('מוצגת תצוגה מקדימה לפני הטעינה',t.includes('מה ייטען מיומן'));
  ok('נאמר שעדיין לא נטען דבר',t.includes('עדיין לא נטען דבר'));
  ok('מוצג מה ייועתק',t.includes('ייועתק ליומן הנוכחי'));
  ok('מוצג מה לא ייועתק בשום מקרה',t.includes('לא ייועתק בשום מקרה'));
  ok('מספרי אצווה מסומנים כלא מועתקים',t.includes('מספרי אצווה ותאריכי תפוגה'));
  ok('חתימות מסומנות כלא מועתקות',t.includes('חתימות המדביר והלקוח'));
  ok('מוזהר על דריסת ערך קיים',t.includes('יידרס'));
  ok('מוזכר שיידרשו אימותים',t.includes('נדרש אימות'));
  const before=await p.evaluate(()=>({pr:cur.prevention,ap:cur.apps.map(a=>a.product).join(','),src:cur.source_pest_log_id}));
  ok('התצוגה המקדימה אינה מבצעת טעינה',before.pr==='הוזן ידנית לפני הטעינה'&&!before.src,JSON.stringify(before));
  await p.click('[data-a="secBack"]');
  ok('אפשר לחזור לבחירת הפרטים',(await p.textContent('.sheet')).includes('בחירת פרטים להעתקה'));
  await p.click('[data-a="secLoad"]');
  await p.click('[data-a="secLoadGo"]');
  const after=await p.evaluate(()=>({pr:cur.prevention,p:cur.apps[0].product,b:cur.apps[0].batch,src:cur.source_pest_log_id}));
  ok('לאחר האישור הטעינה בוצעה',after.p==='סופר ג\'ל'&&after.src==='j1',JSON.stringify(after));
  ok('נתוני הביצוע עדיין לא הועתקו',after.b==='');
});
await withPage(FULL,async p=>{
  await startJournal(p,PLACE_A);
  await p.evaluate(()=>{A._clSrc='j1';A._clSel=new Set(['product']);sectionSheet()});
  await p.click('[data-a="secLoad"]');
  await p.click('[data-a="closeSheet"]');
  const r=await p.evaluate(()=>({n:cur.apps.filter(a=>a.product).length,src:cur.source_pest_log_id}));
  ok('ביטול בתצוגה המקדימה אינו טוען דבר',r.n===0&&!r.src,JSON.stringify(r));
});

console.log('\n15. מסך הבית');
await withPage(FULL,async p=>{
  const t=await p.textContent('#app');
  ['יומנים','לקוחות','מסלול עבודה','תבניות','משימות','לוח שנה','חומרים','פרופיל','יומן חדש']
    .forEach(n=>ok('כפתור בית: '+n,t.includes(n)));
  await p.click('[data-a="go"][data-v="route"]');
  ok('כפתור מסלול עבודה פותח את המסלול',(await p.textContent('#app')).includes('תאריך המסלול'));
  await p.click('[data-a="go"][data-v="home"]');
  await p.click('[data-a="go"][data-v="tasks"]');
  ok('כפתור משימות פותח את המשימות',(await p.textContent('#app')).includes('משימה חדשה'));
  await p.click('[data-a="go"][data-v="home"]');
  await p.click('[data-a="go"][data-v="calendar"]');
  ok('כפתור לוח שנה פותח את הלוח',(await p.textContent('#app')).includes('לוח שנה'));
  await p.click('[data-a="go"][data-v="home"]');
  await p.click('[data-a="go"][data-v="materials"]');
  ok('כפתור חומרים פותח את המאגר',(await p.textContent('#app')).includes('חומרים במאגר'));
});

console.log('\n16. מסלול עבודה');
await withPage(FULL,async p=>{
  await p.evaluate(()=>{A._rDate='2026-08-04';
    addStop('2026-08-04',{clientId:'c1',name:'מסעדת הגפן',phone:'02-5551234',address:'הרצל 10',time:'08:30',duration:'45',focus:'לבדוק מחסן'});
    addStop('2026-08-04',{name:'בית ספר רמות',address:'הרב פרנק 3',time:'10:30'});
    addStop('2026-08-04',{name:'דירה פרטית',address:'בן יהודה 5',time:'13:00'});
    go('route')});
  const t=await p.textContent('#app');
  ok('רשימת לקוחות מסודרת לפי הסדר',/1\. מסעדת הגפן[\s\S]*2\. בית ספר רמות[\s\S]*3\. דירה פרטית/.test(t));
  ok('מוצגים שעה, כתובת ומשך',t.includes('08:30')&&t.includes('הרצל 10')&&t.includes("45 דק'"));
  ok('מוצגים דגשים לטיפול',t.includes('לבדוק מחסן'));
  ok('כל הסטטוסים זמינים',['ממתין','בדרך','בטיפול','הושלם','נדחה'].every(x=>t.includes(x)));
  ok('יש כפתור ניווט',t.includes('ניווט'));
  ok('יש כפתור פתיחת יומן',t.includes('פתיחת יומן'));
  /* סדר – חיצים */
  const ids=await p.evaluate(()=>stopsOf('2026-08-04').map(x=>x.name));
  await p.click(`[data-a="rDown"][data-p="${await p.evaluate(()=>stopsOf('2026-08-04')[0].id)}"]`);
  const after=await p.evaluate(()=>stopsOf('2026-08-04').map(x=>x.name));
  eq('שינוי סדר בחיצים',after[0],ids[1]);
  eq('הפריט שהוזז ירד למקום השני',after[1],ids[0]);
  /* הסדר נשמר באחסון המקומי */
  const keep=await p.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('yp-reg-log-v2')).stops)
    .filter(x=>!x.removed&&x.date==='2026-08-04').sort((a,b)=>a.order-b.order).map(x=>x.name));
  eq('הסדר נשמר באחסון המקומי',keep.join('|'),after.join('|'));
  /* סטטוס */
  await p.evaluate(()=>{A._rDate='2026-08-04';go('route')});
  const sid=await p.evaluate(()=>stopsOf('2026-08-04')[0].id);
  await p.click(`[data-a="rStatus"][data-p="${sid}"][data-val="בטיפול"]`);
  eq('עדכון סטטוס נשמר',await p.evaluate(i=>S.stops[i].status,sid),'בטיפול');
  /* פתיחת יומן מהמסלול */
  const gid=await p.evaluate(()=>stopsOf('2026-08-04').find(x=>x.name==='מסעדת הגפן').id);
  await p.click(`[data-a="rOpenJ"][data-p="${gid}"]`);
  const r=await p.evaluate(i=>({v:view,name:cur&&cur.client.name,jid:S.stops[i].journalId,st:S.stops[i].status}),gid);
  ok('פתיחת יומן מהמסלול פותחת אשף עם הלקוח',r.v==='wizard'&&r.name==='מסעדת הגפן',JSON.stringify(r));
  ok('היומן נקשר לעצירה והסטטוס עודכן',!!r.jid&&r.st==='בטיפול',JSON.stringify(r));
  /* טיפול קודם */
  await p.evaluate(()=>{A._rDate='2026-08-04';go('route')});
  ok('מוצג הטיפול הקודם של הלקוח',(await p.textContent('#app')).includes('טיפול קודם: #1002')||
     (await p.textContent('#app')).includes('טיפול קודם: #1001'));
});
await withPage(FULL,async p=>{
  /* הוספה מרשימת הלקוחות */
  await p.evaluate(()=>{A._rDate='2026-08-05';go('route')});
  await p.click('[data-a="rAddClient"]');
  await p.click('[data-a="rPickClient"][data-p="c1"]');
  const st=await p.evaluate(()=>stopsOf('2026-08-05')[0]);
  ok('עצירה מלקוח שמור מביאה שם, טלפון וכתובת',
     st.name==='מסעדת הגפן'&&!!st.phone&&!!st.address,JSON.stringify(st));
  /* עריכה */
  await p.click(`[data-a="rEdit"][data-p="${st.id}"]`);
  await p.fill('#stTime','07:15');
  await p.fill('#stFocus','להביא תחנות חדשות');
  await p.click(`[data-a="rSave"][data-p="${st.id}"]`);
  const up=await p.evaluate(i=>S.stops[i],st.id);
  ok('עריכת עצירה נשמרת',up.time==='07:15'&&up.focus==='להביא תחנות חדשות',JSON.stringify(up));
  ok('המסלול מוצג ללא שגיאה',(await p.textContent('#app')).includes('07:15'));
});

console.log('\n17. משימות ולוח שנה');
await withPage(FULL,async p=>{
  await p.evaluate(()=>go('tasks'));
  await p.fill('#tkNew','להזמין דרקר');
  await p.fill('#tkDate','2026-08-04');
  await p.click('[data-a="tkAdd"]');
  const t1=await p.evaluate(()=>tasksAll()[0]);
  ok('משימה נוספת ונשמרת',t1.title==='להזמין דרקר'&&t1.date==='2026-08-04',JSON.stringify(t1));
  await p.click(`[data-a="tkTog"][data-p="${t1.id}"]`);
  eq('סימון משימה כבוצעה',await p.evaluate(i=>S.tasks[i].done,t1.id),true);
  eq('המשימה נשמרה באחסון המקומי',
     await p.evaluate(i=>!!JSON.parse(localStorage.getItem('yp-reg-log-v2')).tasks[i],t1.id),true);
  await p.evaluate(()=>{A._calM='2026-08';go('calendar')});
  await p.click('[data-a="calD"][data-val="2026-08-04"]');
  ok('לוח השנה מציג את היום שנבחר',(await p.textContent('#app')).includes('04/08/2026'));
});

console.log('\n18. מאגר החומרים');
await withPage(FULL,async p=>{
  await p.evaluate(()=>go('materials'));
  ok('מוצג מספר החומרים במאגר',(await p.textContent('#app')).includes('151 חומרים במאגר'));
  await p.fill('#mq','דרקר');
  await p.waitForTimeout(150);
  const t=await p.textContent('#app');
  ok('חיפוש מחזיר את החומר',t.includes('דרקר 10.2'));
  await p.click('[data-a="mInfo"][data-p="draker-10-2"]');
  const sh=await p.textContent('.sheet');
  ok('כרטיס החומר נפתח',sh.includes('דרקר 10.2')&&sh.includes('Cypermethrin'));
  ok('נאמר שמינונים אינם נשמרים',sh.includes('מינונים ומגבלות ריסוס אינם נשמרים'));
});

console.log('\n18א. שמירה כפולה ותאימות לאחור');
await withPage(FULL,async p=>{
  /* לחיצה כפולה על "יומן חדש" לא תיצור שני יומנים */
  const before=await p.evaluate(()=>Object.keys(S.journals).length);
  await p.evaluate(()=>{const b=document.querySelector('[data-a="newJ"]');b.click();b.click();b.click()});
  await p.waitForTimeout(500);
  eq('לחיצה משולשת על יומן חדש יוצרת יומן אחד',
     await p.evaluate(()=>Object.keys(S.journals).length),before+1);
  /* לחיצה כפולה על הוספת עצירה */
  await p.evaluate(()=>{A._rDate='2026-08-09';go('route')});
  await p.click('[data-a="rAddClient"]');
  await p.evaluate(()=>{const b=document.querySelector('[data-a="rPickClient"][data-p="c1"]');b.click();b.click()});
  await p.waitForTimeout(300);
  eq('לחיצה כפולה מוסיפה עצירה אחת',await p.evaluate(()=>stopsOf('2026-08-09').length),1);
});
await withPage(FULL,async p=>{
  /* יומן ישן בלי השדות החדשים – נפתח, נערך ונשמר */
  await p.evaluate(()=>{const j=clone(S.journals.j1);
    j.id='old1';j.no=900;j.status='draft';j.step=0;
    delete j.verify;delete j.spots;delete j.siteNotes;delete j.warnSrcProducts;
    j.apps.forEach(a=>{delete a.selectedMaterialId;delete a.manualLabel;delete a.materialDetails;delete a.stations});
    S.journals.old1=j;saveLocal();A.openJ({p:'old1'})});
  ok('יומן ישן נפתח באשף',await p.evaluate(()=>view==='wizard'&&cur.id==='old1'));
  const steps=await p.evaluate(()=>{const out=[];for(let i=0;i<STEPS.length;i++){cur.step=i;try{render();out.push('ok')}catch(e){out.push(String(e))}}return out});
  ok('כל שמונת השלבים נטענים ביומן ישן',steps.every(x=>x==='ok'),steps.join(' | '));
  ok('נשמר ללא קריסה',await p.evaluate(()=>{cur.siteNotes='הערה חדשה';touch();return S.journals.old1.siteNotes==='הערה חדשה'}));
  ok('אין מחיקה של נתונים קיימים',await p.evaluate(()=>S.journals.j1&&S.journals.j0&&S.journals.j2?true:false));
});

console.log('\n19. רגרסיה – מסלולים קיימים');
const errs=await withPage(FULL,async p=>{
  await p.evaluate(()=>go('archive'));
  ok('הארכיון נטען',(await p.textContent('#app')).includes('יומני הדברה'));
  await p.evaluate(()=>go('clients'));
  ok('מסך הלקוחות נטען',(await p.textContent('#app')).includes('מסעדת הגפן'));
  await p.evaluate(()=>go('client','c1'));
  ok('הגדרות לקוח קבוע מוצגות',(await p.textContent('#app')).includes('לקוח אחזקה קבוע'));
  await p.evaluate(()=>go('journal','j1'));
  ok('יומן שהושלם נפתח',(await p.textContent('#app')).includes('#1001')||(await p.textContent('#app')).includes('1001'));
  ok('יומן ישן ללא שדות חדשים אינו נשבר',await p.evaluate(()=>validate(S.journals.j1).length>=0));
  await p.evaluate(()=>go('profile'));
  ok('הפרופיל נטען',(await p.textContent('#app')).includes('פרופיל מדביר'));
});
ok('אין שגיאות JavaScript בזמן ריצה',errs.length===0,errs.join(' | '));

await BROWSER.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
if(fail){console.log('נכשלו:\n - '+fails.join('\n - '));process.exit(1)}
})().catch(e=>{console.error(e);process.exit(1)});
