import {parseRepo,loadRepo,listClawdRepos} from './github.js';
import {evidenceFor,makePrompts,recommendEvidence} from './prompts.js';
const $ = id=>document.getElementById(id);
let current = null, evidence = [], result = null, controller = null;
function status(message, error=false) { $('status').textContent=message; $('status').classList.toggle('error',error); }
function resetOutput() { result=null; $('outputs').hidden=true; }
function setBusy(busy) { $('load-button').disabled=busy; $('load-button').textContent=busy?'Reading…':'Read repo ↗'; }
function cancelLoading() {controller?.abort();controller=null;setBusy(false);}
function setRepo(repo) {
  current=repo; evidence=evidenceFor(repo); resetOutput();
  $('repo-card').hidden=false; $('evidence-section').hidden=false;
  $('source-badge').textContent=repo.source==='demo'?'FICTIONAL DEMO · NOT A REAL CLAWD BUILD':repo.source==='manual'?'PASTED CONTEXT · NOT VERIFIED':'PUBLIC GITHUB · DEFAULT BRANCH';
  $('repo-link').textContent=repo.fullName; $('repo-link').href=repo.url;
  $('repo-description').textContent=repo.description;
  $('revision').textContent=repo.revision?`README revision: ${repo.revision.slice(0,12)} · Read ${new Date(repo.loadedAt).toLocaleString()}`:'No GitHub snapshot was fetched.';
  $('evidence-list').replaceChildren();
  let recommendedCount=0;
  evidence.forEach((item,index)=>{
    const row=document.createElement('div'); row.className='evidence-item';
    const checkbox=document.createElement('input'); checkbox.type='checkbox'; checkbox.id=`fact-${index}`;
    checkbox.value=item.id; checkbox.checked=recommendEvidence(item) && recommendedCount<7;
    if(checkbox.checked)recommendedCount++;
    const label=document.createElement('label'); label.htmlFor=checkbox.id;
    const kind=document.createElement('span'); kind.textContent=item.kind;
    label.append(kind,document.createTextNode(item.text));
    row.append(checkbox,label);
    if(item.url && /^https:\/\/github\.com\//.test(item.url)) {
      const link=document.createElement('a'); link.href=item.url; link.textContent='source ↗';link.target='_blank';link.rel='noopener noreferrer';label.append(link);
    }
    checkbox.addEventListener('change',()=>{updateCount();resetOutput();}); $('evidence-list').append(row);
  });
  $('empty-evidence').hidden=evidence.length>0; $('generate-button').disabled=false; updateCount();
}
function selectedEvidence() {
  const selected=new Set([...$('evidence-list').querySelectorAll('input:checked')].map(x=>x.value));
  return evidence.filter(e=>selected.has(e.id));
}
function updateCount() {$('evidence-count').textContent=`${selectedEvidence().length} selected`;}
$('repo-form').addEventListener('submit',async event=>{
  event.preventDefault(); cancelLoading();
  const attempt=new AbortController();controller=attempt;resetOutput();$('generate-button').disabled=true;
  // Clear the old evidence immediately so a failed request cannot generate a pack for the wrong repo.
  current=null;evidence=[];$('repo-card').hidden=true;$('evidence-section').hidden=true;
  setBusy(true);status('Reading the description, latest five commits, and README…');
  try {
    const repo=await loadRepo($('repo-url').value,{signal:attempt.signal});
    if(attempt.signal.aborted)return;setRepo(repo);
    status(repo.warnings.length?`Loaded with partial context. ${repo.warnings.join(' ')}`:'Repo loaded. Choose the details you want in the song.');
  } catch(error) {if(!attempt.signal.aborted)status(error.message || 'Could not read GitHub. Try pasted context.',true);}
  finally {if(controller===attempt){setBusy(false);controller=null;}}
});
$('browse-button').addEventListener('click',async()=>{
  $('browse-button').disabled=true;status('Loading Clawd’s recently updated public repos…');
  try {
    const repos=await listClawdRepos();$('catalog').replaceChildren(new Option('Choose a repo…',''));
    for(const repo of repos) $('catalog').append(new Option(repo.name,repo.full_name));
    $('catalog').hidden=false;$('catalog-label').hidden=false;status(`Listed ${repos.length} repos, up to the most recent 100. You can paste any other repo link.`);
  }catch(error){status(error.message,true);}finally{$('browse-button').disabled=false;}
});
$('catalog').addEventListener('change',()=>{if($('catalog').value){$('repo-url').value=$('catalog').value;$('repo-form').requestSubmit();}});
$('manual-button').addEventListener('click',()=>{
  try{
    const parsed=parseRepo($('manual-name').value),readme=$('manual-readme').value.trim();
    if(!readme)throw new Error('Paste a README or a few project details first.');
    cancelLoading();setRepo({...parsed,source:'manual',description:'',readme,commits:[],topics:[],language:'',warnings:[]});
    status('Pasted context loaded. Review the excerpts before generating.');
  }catch(error){status(error.message,true);}
});
$('demo-button').addEventListener('click',()=>{
  cancelLoading();setRepo({owner:'demo',name:'midnight-workbench',fullName:'demo/midnight-workbench',url:'https://github.com',
    source:'demo',description:'A fictional workshop notebook for collecting small build ideas.',
    readme:'# Midnight Workbench\nThis fictional example groups work notes into dated chapters.\n- A reading shelf keeps previous chapters easy to find.\n- A search box helps find notes by topic.\n- Exporting a chapter produces a plain text file for sharing.\n- A planned feature would add hand-drawn covers to each chapter.',commits:[],topics:['notebook'],warnings:[]});
  status('Fictional demo loaded. These details do not describe a real Clawd repository.');
});
for(const id of ['vibe','bpm','voice','theme','direction']) $(id).addEventListener('input',()=>{
  $('bpm-value').textContent=`${$('bpm').value} BPM`;resetOutput();
});
$('generate-button').addEventListener('click',()=>{
  if(!current)return;
  const options=Object.fromEntries(['vibe','bpm','voice','theme','direction'].map(id=>[id,$(id).value]));
  result=makePrompts(current,options,selectedEvidence());
  $('song-title').textContent=`${result.title} · ${result.theme}`;
  $('styles-output').value=result.style;$('brief-output').value=result.songwriting;
  $('lyrics-workflow').textContent=result.lyrics;$('style-count').textContent=`${result.style.length} characters · Style template; musical results may vary.`;
  $('packet-output').textContent=JSON.stringify(result.packet,null,2);
  $('output-status').textContent='Prompt pack ready. No data has been sent to Suno or a writing model.';
  $('outputs').hidden=false;$('outputs').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
});
document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{
  const field=$(button.dataset.copy);
  try {await navigator.clipboard.writeText(field.value);$('output-status').textContent='Copied to clipboard.';}
  catch {field.focus();field.select();$('output-status').textContent='Text selected. Press Ctrl+C (or Cmd+C) to copy.';}
}));
$('download-button').addEventListener('click',()=>{
  if(!result)return;const url=URL.createObjectURL(new Blob([result.full],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`${current.name}-suno-prompt-pack.txt`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
