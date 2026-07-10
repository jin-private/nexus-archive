'use strict';
/* NEXUS V9.3 JINSEO QUALITY PATCH */
const FITNESS_TABLE='nexus_fitness_records';
const INBODY_TABLE='nexus_inbody_records';
const TESSERACT_CDN='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

function fnv1a(value=''){
  let h=0x811c9dc5;
  for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,0x01000193)}
  return (h>>>0).toString(16).padStart(8,'0');
}
function fitnessClientKey(row={}){return `fit-${fnv1a([row.date||row.record_date||'',row.type||row.record_type||'',repairKoreanOcr(row.note||'').toLowerCase().replace(/\s+/g,' ').trim()].join('|'))}`}
function isMissingSyncTable(error){const msg=String(error?.message||'');return['42P01','PGRST205'].includes(error?.code)||/nexus_(fitness|inbody)_records.*(?:does not exist|schema cache|could not find)|relation .* does not exist/i.test(msg)}
function remoteFitnessToLocal(row){return{id:row.id,type:row.record_type,date:row.record_date,note:row.note||'',advice:row.advice||'',createdAt:row.created_at||new Date().toISOString(),clientKey:row.client_key||''}}
function remoteInbodyToLocal(row){const body=row.record&&typeof row.record==='object'?row.record:{};return{...body,id:row.id,date:row.measured_at||body.date,createdAt:row.created_at||body.createdAt}}
function dedupeInbodyRows(rows=[]){const map=new Map();rows.filter(Boolean).forEach(row=>{if(row.date)map.set(String(row.date),row)});return[...map.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)))}
function updateFitnessSyncState(message,status='good'){
  const el=$('#fitnessSyncState');if(!el)return;
  el.textContent=message;el.dataset.status=status;
}
async function migrateFitnessLocalRows(uid,rows=[]){
  if(!rows.length)return;
  const payload=rows.filter(r=>r.date&&r.note).map(r=>({user_id:uid,client_key:fitnessClientKey(r),record_date:r.date,record_type:r.type==='diet'?'diet':'workout',note:r.note,advice:r.advice||'',created_at:r.createdAt||new Date().toISOString()}));
  if(!payload.length)return;
  const{error}=await app.sbClient.from(FITNESS_TABLE).upsert(payload,{onConflict:'user_id,client_key',ignoreDuplicates:true});
  if(error&&!isMissingSyncTable(error))throw error;
}
async function migrateInbodyLocalRows(uid,rows=[]){
  const payload=dedupeInbodyRows(rows).filter(r=>r.date).map(r=>({user_id:uid,measured_at:r.date,record:r,updated_at:new Date().toISOString()}));
  if(!payload.length)return;
  const{error}=await app.sbClient.from(INBODY_TABLE).upsert(payload,{onConflict:'user_id,measured_at'});
  if(error&&!isMissingSyncTable(error))throw error;
}

loadPrivateData=async function(){
  if(!app.user)return;
  const uid=app.user.id,localFitness=readLocal('nexus-fitness-records',app.fitnessRecords||[]),localInbody=readLocal('nexus-inbody-records',app.inbodyRecords||[INBODY_BASE]);
  const[profileResult,txResult,fitnessProbe,inbodyProbe]=await Promise.all([
    app.sbClient.from('nexus_finance_profile').select('*').eq('user_id',uid).maybeSingle(),
    app.sbClient.from('nexus_finance_transactions').select('*').eq('user_id',uid).order('tx_date',{ascending:false}).order('created_at',{ascending:false}),
    app.sbClient.from(FITNESS_TABLE).select('*').eq('user_id',uid).order('record_date',{ascending:false}).order('created_at',{ascending:false}),
    app.sbClient.from(INBODY_TABLE).select('*').eq('user_id',uid).order('measured_at',{ascending:true})
  ]);
  if(profileResult.error)console.warn(profileResult.error);if(txResult.error)console.warn(txResult.error);
  app.financeProfile=profileResult.data?{cash_balance:Number(profileResult.data.cash_balance)||0,bank_balance:Number(profileResult.data.bank_balance)||0,savings_balance:Number(profileResult.data.savings_balance)||0,loan_balance:Number(profileResult.data.loan_balance)||0,card_due_balance:Number(profileResult.data.card_due_balance)||0}:emptyFinanceProfile();
  app.transactions=(txResult.data||[]).map(tx=>({...tx,amount:Number(tx.amount)||0}));

  if(isMissingSyncTable(fitnessProbe.error)||isMissingSyncTable(inbodyProbe.error)){
    app.fitnessCloudReady=false;
    app.fitnessRecords=localFitness||[];app.inbodyRecords=dedupeInbodyRows(localInbody?.length?localInbody:[INBODY_BASE]);
    updateFitnessSyncState('클라우드 동기화 SQL 설정 필요','watch');
  }else{
    if(fitnessProbe.error)console.warn(fitnessProbe.error);if(inbodyProbe.error)console.warn(inbodyProbe.error);
    try{
      await Promise.all([migrateFitnessLocalRows(uid,localFitness||[]),migrateInbodyLocalRows(uid,localInbody?.length?localInbody:[INBODY_BASE])]);
      const[fitnessResult,inbodyResult]=await Promise.all([
        app.sbClient.from(FITNESS_TABLE).select('*').eq('user_id',uid).order('record_date',{ascending:false}).order('created_at',{ascending:false}),
        app.sbClient.from(INBODY_TABLE).select('*').eq('user_id',uid).order('measured_at',{ascending:true})
      ]);
      if(fitnessResult.error)throw fitnessResult.error;if(inbodyResult.error)throw inbodyResult.error;
      app.fitnessRecords=(fitnessResult.data||[]).map(remoteFitnessToLocal);
      app.inbodyRecords=dedupeInbodyRows((inbodyResult.data||[]).map(remoteInbodyToLocal));
      if(!app.inbodyRecords.length)app.inbodyRecords=[INBODY_BASE];
      writeLocal('nexus-fitness-records',app.fitnessRecords);writeLocal('nexus-inbody-records',app.inbodyRecords);
      app.fitnessCloudReady=true;updateFitnessSyncState(`진서 계정 동기화 완료 · 기록 ${app.fitnessRecords.length}건`,'good');
    }catch(error){console.warn('[NEXUS fitness sync]',error);app.fitnessCloudReady=false;app.fitnessRecords=localFitness||[];app.inbodyRecords=dedupeInbodyRows(localInbody?.length?localInbody:[INBODY_BASE]);updateFitnessSyncState('동기화 확인 필요','watch')}
  }
  populateFinanceInputs();renderHome();if(app.currentPage==='finance')renderFinance();if(app.currentPage==='fitness')renderFitnessPage();
};

async function saveWorkout(){
  const date=$('#workoutDate').value,note=$('#workoutNote').value.trim();if(!date||!note){showToast('운동 날짜와 내용을 입력해 주세요.');return}
  const advice=workoutAdviceText(),local={id:createId(),type:'workout',date,note,advice,createdAt:new Date().toISOString()};
  if(app.user&&app.fitnessCloudReady){const payload={id:local.id,user_id:app.user.id,client_key:fitnessClientKey(local),record_date:date,record_type:'workout',note,advice,created_at:local.createdAt};const{data,error}=await app.sbClient.from(FITNESS_TABLE).upsert(payload,{onConflict:'user_id,client_key'}).select().single();if(error){showToast(`운동 기록 동기화 실패: ${error.message}`);return}app.fitnessRecords=[remoteFitnessToLocal(data),...app.fitnessRecords.filter(r=>fitnessClientKey(r)!==payload.client_key)]}else{app.fitnessRecords.unshift(local)}
  writeLocal('nexus-fitness-records',app.fitnessRecords);$('#workoutNote').value='';renderFitnessPage();renderHome();showToast(app.fitnessCloudReady?'운동 기록을 진서 계정에 저장했습니다.':'운동 기록을 이 브라우저에 저장했습니다.');
}
async function saveDiet(){
  const date=$('#dietDate').value,note=$('#dietNote').value.trim();if(!date||!note){showToast('식단 날짜와 내용을 입력해 주세요.');return}
  const advice=dietAdviceText(note),local={id:createId(),type:'diet',date,note,advice,createdAt:new Date().toISOString()};
  if(app.user&&app.fitnessCloudReady){const payload={id:local.id,user_id:app.user.id,client_key:fitnessClientKey(local),record_date:date,record_type:'diet',note,advice,created_at:local.createdAt};const{data,error}=await app.sbClient.from(FITNESS_TABLE).upsert(payload,{onConflict:'user_id,client_key'}).select().single();if(error){showToast(`식단 기록 동기화 실패: ${error.message}`);return}app.fitnessRecords=[remoteFitnessToLocal(data),...app.fitnessRecords.filter(r=>fitnessClientKey(r)!==payload.client_key)]}else{app.fitnessRecords.unshift(local)}
  writeLocal('nexus-fitness-records',app.fitnessRecords);$('#dietAdvice').textContent=advice;$('#dietNote').value='';renderFitnessPage();renderHome();showToast(app.fitnessCloudReady?'식단 기록을 진서 계정에 저장했습니다.':'식단 기록을 이 브라우저에 저장했습니다.');
}
async function deleteFitnessRecord(id){
  const row=app.fitnessRecords.find(r=>r.id===id);if(!row)return;if(!confirm('이 운동·식단 기록을 삭제할까요?'))return;
  if(app.user&&app.fitnessCloudReady){const{error}=await app.sbClient.from(FITNESS_TABLE).delete().eq('id',id).eq('user_id',app.user.id);if(error){showToast(`기록 삭제 실패: ${error.message}`);return}}
  app.fitnessRecords=app.fitnessRecords.filter(r=>r.id!==id);writeLocal('nexus-fitness-records',app.fitnessRecords);renderFitnessPage();renderHome();showToast('기록을 삭제했습니다.');
}

async function getOcrWorker(){
  if(app.ocrWorker)return app.ocrWorker;
  if(!window.Tesseract){const status=$('#ocrStatus')||$('#inbodyOcrStatus');if(status)status.textContent='OCR 엔진을 처음 사용할 때만 불러오는 중…';await loadScriptOnce(TESSERACT_CDN,'nexus-tesseract')}
  if(!window.Tesseract)throw new Error('Tesseract.js를 불러오지 못했습니다.');
  if($('#ocrStatus'))$('#ocrStatus').textContent='한글 OCR worker를 준비하는 중…';
  app.ocrWorker=await Tesseract.createWorker('kor+eng',1,{logger:m=>{if(m.status==='recognizing text'){const text=`OCR 인식 중 ${Math.round((m.progress||0)*100)}%`;if($('#ocrStatus'))$('#ocrStatus').textContent=text;if(app.currentPage==='fitness'&&$('#inbodyOcrStatus'))$('#inbodyOcrStatus').textContent=text}}});return app.ocrWorker;
}

async function handleInbodyFiles(files){
  const list=[...files].filter(f=>f.type.startsWith('image/'));if(!list.length)return;$('#inbodyOcrStatus').textContent=`${list.length}개 검사지 분석 준비 중…`;$('#inbodyUncertain').textContent='';
  try{for(let i=0;i<list.length;i++){
    const url=URL.createObjectURL(list[i]);if(i===0){$('#inbodyPreview').src=url;$('#inbodyPreview').classList.remove('hidden')}else URL.revokeObjectURL(url);
    $('#inbodyOcrStatus').textContent=`${i+1}/${list.length} · 현재 측정값/부위별 근육/신체변화 영역 분리 OCR 중…`;
    const parts=await recognizeInbodyImage(list[i]),parsed=mergeInbodyParsed(parts);if(!parsed.date){parsed.uncertain.push('date');continue}
    const existing=app.inbodyRecords.findIndex(r=>r.date===parsed.date),base=existing>=0?app.inbodyRecords[existing]:{};const record={...base,...parsed,height:base.height||180,age:base.age||21,sex:base.sex||'남성'};
    if(app.user&&app.fitnessCloudReady){const{data,error}=await app.sbClient.from(INBODY_TABLE).upsert({user_id:app.user.id,measured_at:record.date,record,updated_at:new Date().toISOString()},{onConflict:'user_id,measured_at'}).select().single();if(error)throw error;const synced=remoteInbodyToLocal(data);if(existing>=0)app.inbodyRecords[existing]=synced;else app.inbodyRecords.push(synced)}else{if(existing>=0)app.inbodyRecords[existing]=record;else app.inbodyRecords.push(record)}
    if(parsed.uncertain.length)$('#inbodyUncertain').textContent+=`${parsed.date||list[i].name}: 불확실 항목 ${parsed.uncertain.join(', ')} · 자동 확정하지 않았습니다. `
  }
  app.inbodyRecords=dedupeInbodyRows(app.inbodyRecords);writeLocal('nexus-inbody-records',app.inbodyRecords);$('#inbodyOcrStatus').textContent=`${list.length}개 검사지 분석 완료.${app.fitnessCloudReady?' 진서 계정에 동기화했습니다.':' 이 브라우저 기록으로 저장했습니다.'}`;renderFitnessPage();renderHome()
  }catch(error){console.error(error);$('#inbodyOcrStatus').textContent=`InBody OCR 실패: ${error instanceof Error?error.message:String(error)}`}
}

function previousInbodyMetric(key,latest=latestInbody()){
  const sorted=dedupeInbodyRows(app.inbodyRecords||[]).sort((a,b)=>String(a.date).localeCompare(String(b.date))),idx=sorted.findIndex(r=>String(r.date)===String(latest.date));
  if(idx>0&&Number.isFinite(Number(sorted[idx-1]?.[key])))return{value:Number(sorted[idx-1][key]),date:sorted[idx-1].date};
  const history=latest.history?.[key],dates=latest.history?.dates||[];if(history?.length>=2)return{value:Number(history.at(-2)),date:dates.at(-2)||'직전 측정'};
  return null;
}
function metricCompareHtml(key,value,unit='',digits=1){const prev=previousInbodyMetric(key),current=Number(value);if(!prev||!Number.isFinite(current)||!Number.isFinite(prev.value))return'<small class="metric-compare neutral">현재 측정 기준</small>';const delta=current-prev.value,sign=delta>0?'+':'',cls=delta===0?'neutral':delta<0?'down':'up';return`<small class="metric-compare ${cls}">직전 ${prev.value.toFixed(digits)}${unit} → 현재 ${current.toFixed(digits)}${unit}<b>${sign}${delta.toFixed(digits)}${unit}</b></small>`}
function buildPreviousInbodySummary(){const x=latestInbody(),pw=previousInbodyMetric('weight',x),ps=previousInbodyMetric('smm',x),pf=previousInbodyMetric('bodyFatPercent',x);if(!pw)return`${DISPLAY_NAME}님, 현재 체중 ${x.weight}kg · 골격근량 ${x.smm}kg · 체지방률 ${x.bodyFatPercent}%입니다. 다음 측정값이 쌓이면 직전 기록과 바로 비교해 드릴게요.`;const dw=Number(x.weight)-pw.value,ds=ps?Number(x.smm)-ps.value:0,df=pf?Number(x.bodyFatPercent)-pf.value:0;return`${DISPLAY_NAME}님, 직전 측정 ${pw.value.toFixed(1)}kg에서 현재 ${Number(x.weight).toFixed(1)}kg으로 ${Math.abs(dw).toFixed(1)}kg ${dw<=0?'감소':'증가'}했어요. 골격근량은 ${ps?`${ps.value.toFixed(1)} → ${Number(x.smm).toFixed(1)}kg (${ds>=0?'+':''}${ds.toFixed(1)}kg)`:`${x.smm}kg`}, 체지방률은 ${pf?`${pf.value.toFixed(1)} → ${Number(x.bodyFatPercent).toFixed(1)}% (${df>=0?'+':''}${df.toFixed(1)}%p)`:`${x.bodyFatPercent}%`}예요. 지금은 체중·체지방 감소 흐름은 좋지만 골격근량 하락폭을 더 키우지 않는 것이 가장 중요해 보여요.`}
buildInbodySummary=buildPreviousInbodySummary;

function inbodyReviewGroups(){
  const x=latestInbody(),seg=x.segmental||{},prev=(k)=>previousInbodyMetric(k,x),cmp=(k,unit,d=1)=>{const p=prev(k),c=Number(x[k]);return p?`직전 ${p.value.toFixed(d)}${unit} → 현재 ${c.toFixed(d)}${unit}`:`현재 ${c.toFixed(d)}${unit}`},delta=(k,d=1)=>{const p=prev(k),c=Number(x[k]);return p?`${c-p.value>=0?'+':''}${(c-p.value).toFixed(d)}`:'비교 대기'},lrUpper=seg.leftArm&&seg.rightArm?Math.abs(seg.leftArm.kg-seg.rightArm.kg):0,lrLower=seg.leftLeg&&seg.rightLeg?Math.abs(seg.leftLeg.kg-seg.rightLeg.kg):0;
  return[
    {title:'직전 측정과 비교',desc:'가장 최근 변화부터 먼저 봐요.',items:[
      ['체중',`${Number(x.weight).toFixed(1)}kg`,cmp('weight','kg'),`직전 대비 ${delta('weight')}kg. 감량 방향과 속도를 함께 확인하세요.`,'weight'],
      ['골격근량',`${Number(x.smm).toFixed(1)}kg`,cmp('smm','kg'),`직전 대비 ${delta('smm')}kg. 현재 감량 구간에서는 근육 유지가 최우선이에요.`,'muscle'],
      ['체지방량',`${Number(x.fatMass).toFixed(1)}kg`,cmp('fatMass','kg'),`직전 대비 ${delta('fatMass')}kg. 체중 변화가 지방 감소와 연결되는지 봅니다.`,'fat'],
      ['체지방률',`${Number(x.bodyFatPercent).toFixed(1)}%`,cmp('bodyFatPercent','%',1),`직전 대비 ${delta('bodyFatPercent')}%p. 최근 감량 흐름의 핵심 지표예요.`,'fat']
    ]},
    {title:'근육·부위 균형',desc:'좌우 차이와 부위별 발달도를 한 묶음으로 봐요.',items:[
      ['근육·지방 균형',`근육 ${x.smm}kg · 지방 ${x.fatMass}kg`,'현재 체성분',`골격근량을 유지하면서 체지방량을 완만하게 줄이는 방향이 진서님의 현재 흐름과 잘 맞아요.`,'balance'],
      ['상체 좌우 균형',`차이 ${lrUpper.toFixed(2)}kg`,`왼팔 ${seg.leftArm?.kg}kg · 오른팔 ${seg.rightArm?.kg}kg`,`큰 비대칭으로 보이지 않습니다. 한쪽만 별도 교정하기보다 같은 가동범위와 자세를 유지하세요.`,'balance'],
      ['하체 좌우 균형',`차이 ${lrLower.toFixed(2)}kg`,`왼다리 ${seg.leftLeg?.kg}kg · 오른다리 ${seg.rightLeg?.kg}kg`,`양쪽 모두 표준 이상입니다. 현재는 좌우 교정보다 전신 근육 유지가 우선이에요.`,'balance'],
      ['상·하체 균형','팔 113~115% · 다리 105~106%','표준 대비 근육량',`상체 발달도가 조금 더 높지만 전반적으로 기준 이상 범위입니다.`,'balance'],
      ['몸통 근육',`${seg.trunk?.kg}kg · ${seg.trunk?.pct}%`,'부위별 근육량',`몸통과 사지 근육량이 모두 표준 이상 평가입니다. 감량 중 이 수준을 지키는 것이 중요해요.`,'balance']
    ]},
    {title:'수분·회복 지표',desc:'단일 숫자보다 같은 조건에서의 반복 흐름을 봐요.',items:[
      ['체수분 균형',`ICW ${x.icw}L · ECW ${x.ecw}L`,'세포내·외 수분',`한 번의 수치보다 반복 측정에서 급격한 변화가 생기는지 확인하세요.`,'water'],
      ['ECW Ratio',String(x.ecwRatio),`이력 ${(x.history?.ecwRatio||[]).join(' → ')}`,`현재 이력에서는 큰 일방향 악화가 뚜렷하지 않아요.`,'water'],
      ['위상각',`${x.phaseAngle}°`,'현재 측정',`같은 조건의 반복 측정에서 근육 유지·회복 흐름과 함께 추세를 보세요.`,'recovery'],
      ['내장지방',`레벨 ${x.visceralFat}`,'현재 측정',`체지방 감량 흐름은 유지하되 급격한 체중 감소로 근육 손실이 커지지 않게 조절하세요.`,'fat'],
      ['복부지방률',String(x.whr),'현재 측정',`체지방률과 함께 추적하고 같은 날짜에 허리둘레를 기록하면 해석하기 쉬워져요.`,'fat']
    ]},
    {title:'감량·유지 가이드',desc:'진서님의 다음 행동으로 연결되는 지표예요.',items:[
      ['BMI',String(x.bmi),'골격근량·체지방률과 함께 보기',`BMI만 단독으로 판단하지 않고 골격근량 ${x.smm}kg과 체지방률 ${x.bodyFatPercent}%를 같이 보는 편이 적절해요.`,'guide'],
      ['SMI',`${x.smi} kg/m²`,'근육 유지 지표',`현재 감량 국면에서는 이 수치를 크게 떨어뜨리지 않도록 저항운동과 단백질 섭취를 유지하세요.`,'muscle'],
      ['기초대사량',`${x.bmr} kcal`,'현재 측정',`무조건 이 값보다 적게 먹기보다 활동량을 포함한 총소비량 기준의 완만한 적자를 권장해요.`,'guide'],
      ['체중조절 권장',`${x.weightControl}kg`,`적정체중 ${x.targetWeight}kg`,`현재 ${x.weight}kg 기준 권고 조절량입니다. 숫자보다 근육 유지 여부를 함께 보세요.`,'guide'],
      ['지방조절 권장',`${x.fatControl}kg`,'권고 중심: 지방 감소',`현재 감량 방향과 일치합니다. 체중이 줄어도 골격근량 하락이 커지면 속도를 늦추세요.`,'fat'],
      ['근육조절 권장',`${Number(x.muscleControl).toFixed(1)}kg`,'추가 근육 감량 권고 없음',`앞으로는 골격근량 유지가 우선입니다. 중량·반복 수 기록과 단백질 섭취 간격을 유지하세요.`,'muscle']
    ]}
  ]
}

function renderFitnessRecords(){
  const rows=[...(app.fitnessRecords||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,30),el=$('#fitnessRecordList');if(!el)return;
  el.innerHTML=rows.length?`<div class="fitness-record-list">${rows.map(r=>`<article class="fitness-record ${r.type==='workout'?'workout':'diet'}"><div class="fitness-record-date"><b>${esc(r.date)}</b><span>${r.type==='workout'?'운동':'식단'}</span></div><div class="fitness-record-copy"><strong>${esc(r.note)}</strong><p>${esc(r.advice||'')}</p></div><div class="fitness-record-badge">${r.type==='workout'?'WORKOUT':'DIET'}</div><button class="fitness-record-delete" onclick="deleteFitnessRecord('${esc(r.id)}')" aria-label="기록 삭제">삭제</button></article>`).join('')}</div>`:'<div class="empty">아직 운동·식단 기록이 없습니다.</div>'
}
function renderFitnessPage(){
  const x=latestInbody(),title=$('#latestInbodyTitle');if(title)title.textContent=`${String(x.date||'-').replaceAll('-','.')} 기준 신체 상태`;
  const metrics=[['체중',`${Number(x.weight).toFixed(1)}kg`,'weight','kg',1],['골격근량',`${Number(x.smm).toFixed(1)}kg`,'smm','kg',1],['체지방량',`${Number(x.fatMass).toFixed(1)}kg`,'fatMass','kg',1],['체지방률',`${Number(x.bodyFatPercent).toFixed(1)}%`,'bodyFatPercent','%',1],['BMI',x.bmi,null,'',1],['인바디점수',`${x.score}점`,null,'',0],['위상각',`${x.phaseAngle}°`,null,'',1],['SMI',`${x.smi} kg/m²`,null,'',1]];
  $('#fitnessMetrics').innerHTML=metrics.map(([label,value,key,unit,digits])=>`<div class="fitmetric ${key?'compare':''}"><span>${label}</span><strong>${value}</strong>${key?metricCompareHtml(key,x[key],unit,digits):'<small class="metric-compare neutral">현재 측정 기준</small>'}</div>`).join('');
  $('#inbodyMainSummary').textContent=buildPreviousInbodySummary();renderBodyBalanceVisual(x);
  const labels=[['leftArm','왼팔'],['rightArm','오른팔'],['trunk','몸통'],['leftLeg','왼다리'],['rightLeg','오른다리']];$('#bodyBalanceLabels').innerHTML=labels.map(([key,label])=>{const row=x.segmental?.[key]||{kg:'-',pct:0};return`<div class="bodylabel ${key==='trunk'?'trunk':''}"><span>${label}</span><strong>${segmentKg(key,row.kg)}kg / ${Number(row.pct).toFixed(1)}%</strong><span class="eval">${bodyEval(Number(row.pct))}</span></div>`}).join('');
  const h=inbodyTrend();$('#inbodyTrendTable').innerHTML=`<thead><tr><th>항목</th>${h.dates.map(d=>`<th>${d.replaceAll('-','.')}</th>`).join('')}</tr></thead><tbody>${[['체중',h.weight,'kg'],['골격근량',h.smm,'kg'],['체지방량',h.fatMass,'kg'],['체지방률',h.bodyFatPercent,'%'],['ECW Ratio',h.ecwRatio,'']].map(([label,arr,unit])=>`<tr><td>${label}</td>${arr.map(v=>`<td>${v}${unit}</td>`).join('')}</tr>`).join('')}</tbody>`;
  $('#inbodyAnalysisGrid').innerHTML=inbodyReviewGroups().map(group=>`<section class="inbody-review-group"><div class="inbody-review-head"><h3>${esc(group.title)}</h3><p>${esc(group.desc)}</p></div><div class="inbody-review-cards">${group.items.map(([title,value,compare,text,tone])=>`<article class="inbody-review-card ${tone}"><div><span>${esc(title)}</span><strong>${esc(value)}</strong></div><small>${esc(compare)}</small><p>${esc(text)}</p></article>`).join('')}</div></section>`).join('');
  $('#workoutAdvice').textContent=workoutAdviceText();$('#dietAdvice').textContent=dietAdviceText($('#dietNote').value||'');renderFitnessRecords();
}

const GUIDE_IMAGES_V93={
  newbie:'assets/images/guides/v93/newbie.webp','starter-base':'assets/images/guides/v93/starter-base.webp',gear:'assets/images/guides/v93/gear.webp',furniture:'assets/images/guides/v93/furniture.webp',dream:'assets/images/guides/v93/dream.webp',winter:'assets/images/guides/v93/winter.webp','deviation-scenario':'assets/images/guides/v93/deviation-scenario.webp',manibus:'assets/images/guides/v93/manibus.webp','gravity-abyss':'assets/images/guides/v93/gravity-abyss.webp','eternaland-transition':'assets/images/guides/v93/eternaland-transition.webp','aug-build':'assets/images/guides/v93/aug-build.webp',tips:'assets/images/guides/v93/tips.webp','prime-war':'assets/images/guides/v93/prime-war.webp','silo-controller':'assets/images/guides/v93/silo-controller.webp','deviation-combat':'assets/images/guides/v93/deviation-combat.webp'
};
const GUIDE_META_V93={
  newbie:['F 상호작용 안내','탐색 대상 오브젝트','미니맵·상태 HUD'],
  'starter-base':['거점 건물 기준','영지·주변 지형','진입 동선 확인'],
  gear:['장비 탭','현재 전투 스탯','무기·방어구 슬롯'],
  furniture:['작업·제작 구역','수납·가구 배치','실내 이동 동선'],
  dream:['꿈 영역 왜곡','위험 구역 중심','복귀 방향 확인'],
  winter:['설원 생존 구역','거점·보급 위치','온도 대응 동선'],
  'deviation-scenario':['감염물 지도 목록','추적 대상 선택','목표 위치·경로'],
  manibus:['월드맵 목표','이벤트·임무 지점','이동 루트'],
  'gravity-abyss':['중력 이상 오브젝트','공중 위험 구간','안전 이동 방향'],
  'eternaland-transition':['이터널랜드 영역','공간 경계','전환·정착 기준'],
  'aug-build':['모듈 옵션','효과 방향 비교','장착·교체 슬롯'],
  tips:['작업대·제작 구역','보관·수납 위치','반복 작업 동선'],
  'prime-war':['방어 거점','시설·사격 위치','팀 전투 방향'],
  'silo-controller':['사일로 입구','보안·진입 지점','반복 파밍 시작점'],
  'deviation-combat':['공격 역할 감염물','보조 역할 감염물','제어·조합 역할']
};
const GUIDE_POINTS_V93={newbie:[[31,39],[49,58],[88,18]],'starter-base':[[48,58],[74,44],[28,73]],gear:[[25,8],[53,46],[79,53]],furniture:[[27,58],[70,55],[48,82]],dream:[[28,50],[60,51],[83,72]],winter:[[28,63],[52,50],[72,36]],'deviation-scenario':[[18,30],[55,52],[74,60]],manibus:[[45,54],[65,42],[34,71]],'gravity-abyss':[[48,35],[72,52],[24,73]],'eternaland-transition':[[57,45],[76,38],[37,72]],'aug-build':[[28,33],[69,33],[48,78]],tips:[[21,54],[63,55],[45,81]],'prime-war':[[45,55],[63,42],[75,66]],'silo-controller':[[48,66],[66,54],[31,75]],'deviation-combat':[[30,50],[55,42],[78,58]]};
const contextualVisualLegacy=contextualVisual;
contextualVisual=function(type,title='NEXUS GUIDE',guideId=''){
  const src=GUIDE_IMAGES_V93[guideId];if(!src)return contextualVisualLegacy(type,title);
  const labels=GUIDE_META_V93[guideId]||['핵심 위치','확인 지점','이동·행동 기준'],points=GUIDE_POINTS_V93[guideId]||[[25,35],[55,55],[78,38]];
  return`<div class="game-shot guide-specific-shot" role="img" aria-label="${esc(title)} 인게임 화면 기반 예시"><img src="${src}" alt="${esc(title)} 인게임 예시 화면" loading="lazy" decoding="async"><div class="shot-badge">인게임 화면 · NEXUS 표시</div>${labels.map((label,i)=>`<div class="shot-callout" style="left:${points[i][0]}%;top:${points[i][1]}%"><i>${i+1}</i><span>${esc(label)}</span></div>`).join('')}<div class="shot-title">${esc(title)} · 공략 상황에 맞는 실제 게임 화면 위에 안내를 표시했어요.</div></div>`
};
