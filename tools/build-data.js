/* מטמיע את src/data/pesticides.seed.json בתוך public/pest-log.html ומאמת אותו.
   node tools/build-data.js          – בונה
   node tools/build-data.js --check  – בודק בלבד (lint), נכשל אם יש בעיה */
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const SEED=path.join(ROOT,'src','data','pesticides.seed.json');
const PAGE=path.join(ROOT,'public','pest-log.html');
const START='/*PESTICIDES_START*/',END='/*PESTICIDES_END*/';

const REQUIRED=['id','nameHe','category','formulation','registrationNumber','registrationExpiry',
 'activeIngredients','targetPests','warningsHuman','warningsAnimals','warningsEnvironment',
 'customerInstructionsBefore','customerInstructionsAfter','professionalPpe','firstAid',
 'applicationRestrictions','dosages','reentry','officialLabelUrl','sourceType',
 'verificationStatus','isSelectable','lastVerifiedAt','labelSha256'];
/* unknown = טרם הוזנו נתוני אימות. אינו חוסם בחירה – מידע בלבד. */
const STATUSES=['verified','needs_review','unknown','blocked'];
const REENTRY=['numeric','label_condition','not_applicable_by_label',''];
const CATEGORIES=['crawling_insects','rodents','flying_insects','other'];

function lint(data){
  const err=[];
  if(!Array.isArray(data.products)||!data.products.length)err.push('אין מוצרים בקובץ');
  const ids=new Set();
  for(const p of data.products||[]){
    const at=s=>`[${p.id||'ללא id'}] ${s}`;
    REQUIRED.forEach(k=>{if(!(k in p))err.push(at('חסר שדה '+k))});
    if(ids.has(p.id))err.push(at('id כפול'));
    ids.add(p.id);
    if(!CATEGORIES.includes(p.category))err.push(at('category לא חוקי: '+p.category));
    if(!STATUSES.includes(p.verificationStatus))err.push(at('verificationStatus לא חוקי'));
    if(!REENTRY.includes(p.reentry&&p.reentry.type))err.push(at('reentry.type לא חוקי'));
    if(p.reentry&&p.reentry.type==='numeric'&&!(p.reentry.minutes>0))
      err.push(at('reentry numeric ללא minutes'));
    if(p.reentry&&p.reentry.type!=='numeric'&&p.reentry.minutes!=null)
      err.push(at('reentry לא numeric אך יש minutes'));

    const blocked=p.verificationStatus==='blocked';
    if(blocked){
      if(p.isSelectable)err.push(at('מוצר חסום חייב isSelectable=false'));
      if(!p.statusLabel)err.push(at('מוצר חסום ללא statusLabel'));
      /* מוצר חסום לא יישא שום תוכן תווית */
      ['activeIngredients','targetPests','warningsHuman','warningsAnimals','warningsEnvironment',
       'customerInstructionsBefore','customerInstructionsAfter','applicationRestrictions','dosages',
       'professionalPpe','firstAid','conditionalInstructions','preparationSteps']
       .forEach(k=>{if((p[k]||[]).length)err.push(at('מוצר חסום מכיל תוכן בשדה '+k))});
      if((p.reentry||{}).text)err.push(at('מוצר חסום מכיל reentry.text'));
      if(p.registrationNumber||p.registrationExpiry)err.push(at('מוצר חסום מכיל פרטי רישום'));
    }else if(p.verificationStatus==='verified'){
      /* מוצר שמוצג כמאומת מתווית חייב לשאת את כל פרטי המקור */
      if(!p.officialLabelUrl)err.push(at('מוצר מאומת ללא קישור לתווית'));
      if(!p.registrationNumber)err.push(at('מוצר מאומת ללא מספר רישום'));
      if(!p.registrationExpiry)err.push(at('מוצר מאומת ללא תוקף רישום'));
      if(!(p.activeIngredients||[]).length)err.push(at('מוצר מאומת ללא חומר פעיל'));
      if(!(p.targetPests||[]).length)err.push(at('מוצר מאומת ללא מזיקי מטרה'));
      if(!(p.reentry||{}).type)err.push(at('מוצר מאומת ללא reentry.type'));
      if(!p.lastVerifiedAt)err.push(at('מוצר מאומת ללא lastVerifiedAt'));
      if(!p.labelSha256&&!p.verificationNote)
        err.push(at('אין labelSha256 ואין verificationNote המסביר את מקור הנתונים'));
    }else{
      /* מוצר מהרשימה המובנית: מותר בלי פרטי תווית, אך אסור שיציג תוכן תווית
         שלא אומת – אחרת הוא ייראה כאילו נבדק */
      /* מזיקי מטרה אינם חובה לחומר שטרם הוזנו לו נתוני תווית –
         באפליקציה המזיק מוזן ידנית במקרה כזה */
      if(!p.statusLabel)err.push(at('מוצר לא מאומת ללא statusLabel'));
      if(!p.verificationNote)err.push(at('מוצר לא מאומת ללא הסבר על מקור הנתונים'));
      if(p.officialLabelUrl)err.push(at('מוצר לא מאומת עם קישור לתווית'));
      if(p.registrationNumber||p.registrationExpiry)err.push(at('מוצר לא מאומת עם פרטי רישום'));
      ['warningsHuman','warningsAnimals','warningsEnvironment','customerInstructionsBefore',
       'customerInstructionsAfter','professionalPpe','firstAid','conditionalInstructions']
       .forEach(k=>{if((p[k]||[]).length)err.push(at('מוצר לא מאומת מכיל תוכן תווית בשדה '+k))});
      if((p.reentry||{}).text||(p.reentry||{}).minutes)
        err.push(at('מוצר לא מאומת מכיל זמן כניסה מחדש'));
    }
    /* מינונים ומגבלות ריסוס אינם נשמרים במערכת – אם חזרו, יש לאמת אותם מול התווית */
    if((p.dosages||[]).length)err.push(at('מינונים אינם נשמרים במערכת'));
    if((p.applicationRestrictions||[]).length)err.push(at('מגבלות ריסוס אינן נשמרות במערכת'));
    /* אם בעתיד יוחזרו מינונים – כל מינון חייב להתייחס למזיקים שבתווית בלבד */
    (p.dosages||[]).forEach(d=>{
      if(!d.id)err.push(at('מינון ללא id'));
      if(!d.text)err.push(at('מינון ללא טקסט'));
      (d.forPests||[]).forEach(x=>{if(!(p.targetPests||[]).includes(x))
        err.push(at(`המינון ${d.id} מתייחס למזיק שאינו בתווית: ${x}`))});
    });
    (p.searchAliases||[]).forEach(a=>{if(typeof a!=='string'||!a.trim())
      err.push(at('searchAliases מכיל ערך שאינו מחרוזת'))});
    (p.conditionalInstructions||[]).forEach(c=>{
      (c.forPests||[]).forEach(x=>{if(!(p.targetPests||[]).includes(x))
        err.push(at(`הוראה מותנית מתייחסת למזיק שאינו בתווית: ${x}`))});
    });
  }
  /* בדיקת זליגה בין מוצרים: טקסט תווית של מוצר אחד לא יופיע אצל אחר */
  const texts=p=>[].concat(p.warningsHuman,p.warningsAnimals,p.warningsEnvironment,
    p.applicationRestrictions,p.customerInstructionsBefore,p.customerInstructionsAfter,
    (p.dosages||[]).map(d=>d.text),[(p.reentry||{}).text]).filter(Boolean);
  const prods=data.products||[];
  for(let i=0;i<prods.length;i++)for(let j=0;j<prods.length;j++){
    if(i===j)continue;
    const a=prods[i],b=prods[j];
    if(a.verificationStatus!=='blocked'&&b.verificationStatus!=='blocked')continue;
    const setB=new Set(texts(b));
    texts(a).forEach(t=>{if(setB.has(t))
      err.push(`זליגת נתוני תווית בין ${a.id} ל-${b.id}: "${t.slice(0,40)}..."`)});
  }
  return err;
}

const data=JSON.parse(fs.readFileSync(SEED,'utf8'));
const errs=lint(data);
if(errs.length){console.error('בדיקת נתוני התכשירים נכשלה:');errs.forEach(e=>console.error(' - '+e));process.exit(1)}

const html=fs.readFileSync(PAGE,'utf8');
const a=html.indexOf(START),b=html.indexOf(END);
if(a<0||b<0){console.error('לא נמצאו סימני ההטמעה '+START+' / '+END+' בקובץ הדף');process.exit(1)}
const embedded='\nconst PEST_CATALOG='+JSON.stringify(data)+';\n';
const current=html.slice(a+START.length,b);
if(process.argv.includes('--check')){
  if(current!==embedded){console.error('הנתונים המוטמעים בדף אינם תואמים ל-src/data/pesticides.seed.json. הריצו: npm run build');process.exit(1)}
  console.log('נתוני התכשירים תקינים ומסונכרנים ('+data.products.length+' מוצרים)');
  process.exit(0);
}
fs.writeFileSync(PAGE,html.slice(0,a+START.length)+embedded+html.slice(b));
console.log('הוטמעו '+data.products.length+' מוצרים בתוך public/pest-log.html');
