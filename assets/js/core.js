
'use strict';
const BUILD_ID='NEXUS_ARCHIVE_V10_PERSONAL_STOCK_OS_FINAL_20260713';
const SUPABASE_URL='https://nfwkkbghelqhopgnguqp.supabase.co';
const SUPABASE_KEY='sb_publishable_bXSthGxRHDFYy9p3fb21WQ_su8STJKq';
const SUPABASE_CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const DISPLAY_NAME='진서';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const nf=new Intl.NumberFormat('ko-KR'),pad=v=>String(v).padStart(2,'0'),money=v=>`${nf.format(Math.round(Number(v)||0))}원`;
const localDateString=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayStr=localDateString();
function esc(v=''){return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function readLocal(k,f){try{const raw=localStorage.getItem(k);return raw===null?f:JSON.parse(raw)}catch(_){return f}}
function writeLocal(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.warn(e)}}
function createId(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function emptyFinanceProfile(){return{cash_balance:0,bank_balance:0,savings_balance:0,loan_balance:0,card_due_balance:0}}
function showToast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.classList.remove('show'),2600)}
const nexusScriptLoads=new Map();
function loadScriptOnce(src,id=''){if(id&&document.getElementById(id)&&window.Tesseract)return Promise.resolve();if(nexusScriptLoads.has(src))return nexusScriptLoads.get(src);const promise=new Promise((resolve,reject)=>{const script=document.createElement('script');if(id)script.id=id;script.src=src;script.async=true;script.onload=()=>resolve(script);script.onerror=()=>reject(new Error(`스크립트를 불러오지 못했습니다: ${src}`));document.head.appendChild(script)});nexusScriptLoads.set(src,promise);return promise.catch(error=>{nexusScriptLoads.delete(src);throw error})}
function runWhenIdle(fn,timeout=1200){if('requestIdleCallback'in window)return requestIdleCallback(()=>fn(),{timeout});return setTimeout(fn,16)}

const PLAYLISTS=[
{id:'0mahINXJXQo',name:'감성',title:'감성 플레이리스트',desc:'차분하게 기록하거나 정리할 때 어울리는 플리.'},
{id:'TgPofB-oUcw',name:'신남',title:'신나는 플레이리스트',desc:'작업 텐션을 올리고 싶을 때 듣는 에너지 플리.'},
{id:'L3fvGsxqpFc',name:'잔잔한 듯 신남',title:'잔잔한 듯 신나는 플리',desc:'과하지 않게 리듬을 유지하고 싶을 때.',start:4},
{id:'LD_gj7KLPX8',name:'여름 플리',title:'여름 플레이리스트',desc:'밝고 시원한 계절감이 필요한 순간.'},
{id:'5Meem1boM5A',name:'카페감성 플리',title:'카페감성 플레이리스트',desc:'집중과 휴식 사이의 카페 무드.'},
{id:'32FPRBy6gOU',name:'밤공기 플리',title:'밤공기 플레이리스트',desc:'늦은 시간 천천히 정리할 때 듣는 플리.'}
];
const INBODY_BASE={
 date:'2026-06-29',time:'13:47',height:180,age:21,sex:'남성',weight:84.0,smm:38.0,fatMass:17.5,bmi:25.9,bodyFatPercent:20.8,score:80,phaseAngle:6.5,smi:8.9,targetWeight:78.2,weightControl:-5.8,fatControl:-5.8,muscleControl:0.0,ecwRatio:0.373,icw:30.7,ecw:18.2,bmr:1806,whr:0.93,visceralFat:7,obesityDegree:118,boneMineral:3.52,bodyCellMass:44.0,
 segmental:{rightArm:{kg:4.08,pct:114.9},leftArm:{kg:4.03,pct:113.4},trunk:{kg:30.6,pct:108.1},rightLeg:{kg:10.36,pct:104.9},leftLeg:{kg:10.50,pct:106.3}},
 history:{dates:['2025-11-14','2026-01-13','2026-03-31','2026-05-11','2026-06-29'],weight:[92.6,94.8,90.8,87.8,84.0],smm:[38.2,39.8,39.4,38.9,38.0],fatMass:[25.6,25.5,22.0,19.4,17.5],bodyFatPercent:[27.7,26.9,24.2,22.1,20.8],ecwRatio:[0.373,0.370,0.372,0.376,0.373]}
};
const LEGACY_FIVEM=readLocal('nexus-fivem-dev-v84',readLocal('nexus-fivem-dev-v83',{resources:[],workNotes:'',lastInspection:null}));
const app={guideFilter:'all',guideBookmarks:readLocal('nexus-guide-bookmarks',[]),guideChecks:readLocal('nexus-guide-checks',{}),financeProfile:emptyFinanceProfile(),transactions:[],selectedMonth:(()=>{const d=new Date();d.setDate(1);d.setHours(0,0,0,0);return d})(),selectedDate:todayStr,sbClient:null,user:null,authReady:false,currentPage:'home',currentGuideId:null,pendingRoute:null,theme:readLocal('nexus-theme','light'),ocrWorker:null,ocrFiles:[],ocrObjectUrls:[],ocrResults:[],ocrPageRaw:[],ocrStats:{images:0,parsed:0,overlap:0,cancelled:0,existing:0,autoSaved:0},editingTxId:null,stockBrief:readLocal('nexus-stock-brief-v82',null),stockMessages:readLocal('nexus-stock-messages-v82',[]),stockBusy:false,ownedStocks:readLocal('nexus-owned-stocks-v82',[]),ownedStockTimer:null,fivemData:readLocal('nexus-fivem-dev-v90',{resources:LEGACY_FIVEM.resources||[],workNotes:LEGACY_FIVEM.workNotes||'',lastInspection:LEGACY_FIVEM.lastInspection||null,lastResmon:null,lastProfiler:null,lastZip:null}),pendingBackup:null,performanceSamples:readLocal('nexus-performance-samples-v92',[]),lastDiagnostics:null,importBatches:readLocal('nexus-import-batches-v92',[]),fitnessRecords:readLocal('nexus-fitness-records',[]),inbodyRecords:readLocal('nexus-inbody-records',[INBODY_BASE]),myProfile:readLocal('nexus-my-profile',{name:DISPLAY_NAME,height:180,currentWeight:84,targetWeight:78.2,memo:'',monthlyAssetGoal:0,monthlySpendingGoal:0}),playlistIndex:Number(readLocal('nexus-playlist-index',0))||0,miniOpen:Boolean(readLocal('nexus-mini-open',false)),miniMinimized:Boolean(readLocal('nexus-mini-minimized',false))};

