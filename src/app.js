import {parseRepo,loadRepo,listClawdRepos} from './github.js';
import {DEFAULT_CLAWD_PROFILE,evidenceFor,makePrompts,recommendEvidence} from './prompts.js';
const $ = id=>document.getElementById(id);
let current = null, evidence = [], result = null, songResult = null, controller = null, generating = false;
$('profile').value = DEFAULT_CLAWD_PROFILE;

function status(message, error=false) { $('status').textContent=message; $('status').classList.toggle('error',error); }
function outputStatus(message, error=false) {
  const node = currentMode() === 'lyrics' ? $('lyrics-status') : $('output-status');
  node.textContent = message;
  node.classList.toggle('error', error);
}
function currentMode() {
  return document.querySelector('input[name="mode"]:checked')?.value || 'prompt';
}
function resetOutput() {
  result=null;
  songResult=null;
  $('prompt-outputs').hidden=true;
  $('lyrics-outputs').hidden=true;
  $('output-status').textContent='';
  $('lyrics-status').textContent='';
}
function setBusy(busy) { $('load-button').disabled=busy; $('load-button').textContent=busy?'Reading…':'Read repo ↗'; }
function cancelLoading() {controller?.abort();controller=null;setBusy(false);}
function syncModeChrome() {
  const lyricsMode = currentMode() === 'lyrics';
  $('profile-section').hidden = !lyricsMode;
  $('mode-help').textContent = lyricsMode
    ? 'Calls the server-side Gemini endpoint. GEMINI_API_KEY stays on the server.'
    : 'Builds a local prompt pack. No API key needed.';
  if (!generating) {
    $('generate-button').textContent = lyricsMode ? 'Generate lyrics ✦' : 'Make the prompt pack ✦';
  }
  $('generate-help').textContent = lyricsMode
    ? 'Produces a title, Styles prompt, and complete lyrics. Review before pasting into Suno.'
    : 'Creates prompts, not audio. Vocal tracks include a brief for a writing model to turn into finished lyrics.';
  updateGenerateEnabled();
}
function updateModeUi() {
  syncModeChrome();
  resetOutput();
}
function updateGenerateEnabled() {
  $('generate-button').disabled = !current || generating;
}
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
  $('empty-evidence').hidden=evidence.length>0; updateGenerateEnabled(); updateCount();
}
function selectedEvidence() {
  const selected=new Set([...$('evidence-list').querySelectorAll('input:checked')].map(x=>x.value));
  return evidence.filter(e=>selected.has(e.id));
}
function updateCount() {$('evidence-count').textContent=`${selectedEvidence().length} selected`;}
function musicalOptions() {
  return {
    ...Object.fromEntries(['vibe','bpm','voice','theme','direction'].map(id=>[id,$(id).value])),
    profile: $('profile').value
  };
}
function showPromptPack(pack) {
  result = pack;
  songResult = null;
  $('lyrics-outputs').hidden = true;
  $('song-title').textContent=`${pack.title} · ${pack.theme}`;
  $('styles-output').value=pack.style;$('brief-output').value=pack.songwriting;
  $('lyrics-workflow').textContent=pack.lyrics;$('style-count').textContent=`${pack.style.length} characters · Style template; musical results may vary.`;
  $('packet-output').textContent=JSON.stringify(pack.packet,null,2);
  outputStatus('Prompt pack ready. No data has been sent to Suno or a writing model.');
  $('prompt-outputs').hidden=false;
  $('prompt-outputs').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
function showSongPack(song) {
  songResult = song;
  result = null;
  $('prompt-outputs').hidden = true;
  $('lyrics-song-title').textContent = `${song.title} · ${song.repository || current.fullName}`;
  $('title-output').value = song.title;
  $('lyrics-styles-output').value = song.styles;
  $('lyrics-output').value = song.lyrics;
  outputStatus('Song pack ready. Review, copy Styles and Lyrics into Suno Custom mode.');
  $('lyrics-outputs').hidden = false;
  $('lyrics-outputs').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
function songPackText() {
  return `CLAWD BEAT LAB · SONG PACK
${$('title-output').value}
Repository: ${current?.url || ''}
Source: ${current?.source || ''}
Revision: ${current?.revision || 'n/a'}

SUNO STYLES
${$('lyrics-styles-output').value}

LYRICS
${$('lyrics-output').value}
`;
}
async function generateLyrics() {
  if (!current || generating) return;
  generating = true;
  updateGenerateEnabled();
  $('generate-button').textContent = 'Generating…';
  outputStatus('Generating lyrics with the server-side Gemini endpoint…');
  $('lyrics-outputs').hidden = false;
  $('prompt-outputs').hidden = true;
  try {
    const response = await fetch('/api/generate-lyrics', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        repo: {
          fullName: current.fullName,
          url: current.url,
          source: current.source,
          description: current.description || '',
          language: current.language || '',
          revision: current.revision || null,
          topics: current.topics || []
        },
        options: musicalOptions(),
        evidence: selectedEvidence().slice(0,10).map(item => ({
          type: item.kind,
          excerpt: item.text,
          url: item.url || current.url
        }))
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Generation failed (${response.status}).`);
    }
    if (!payload.title || !payload.styles || !payload.lyrics) {
      throw new Error('Server returned an incomplete song pack.');
    }
    showSongPack(payload);
  } catch (error) {
    songResult = null;
    $('lyrics-outputs').hidden = true;
    const message = error.message || 'Could not generate lyrics.';
    // lyrics-status lives inside the hidden song pack; surface errors in the always-visible source status too.
    status(message, true);
    outputStatus(message, true);
  } finally {
    generating = false;
    syncModeChrome();
  }
}

$('repo-form').addEventListener('submit',async event=>{
  event.preventDefault(); cancelLoading();
  const attempt=new AbortController();controller=attempt;resetOutput();updateGenerateEnabled();
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
for(const id of ['vibe','bpm','voice','theme','direction','profile']) $(id).addEventListener('input',()=>{
  if (id === 'bpm') $('bpm-value').textContent=`${$('bpm').value} BPM`;
  resetOutput();
});
document.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener('change', updateModeUi));
$('generate-button').addEventListener('click',()=>{
  if(!current || generating)return;
  if (currentMode() === 'lyrics') {
    generateLyrics();
    return;
  }
  showPromptPack(makePrompts(current, musicalOptions(), selectedEvidence()));
});
document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{
  const field=$(button.dataset.copy);
  try {await navigator.clipboard.writeText(field.value);outputStatus('Copied to clipboard.');}
  catch {field.focus();field.select();outputStatus('Text selected. Press Ctrl+C (or Cmd+C) to copy.');}
}));
$('download-button').addEventListener('click',()=>{
  if(!result)return;const url=URL.createObjectURL(new Blob([result.full],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`${current.name}-suno-prompt-pack.txt`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('download-song-button').addEventListener('click',()=>{
  if(!songResult && !$('lyrics-output').value)return;
  const url=URL.createObjectURL(new Blob([songPackText()],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`${current?.name || 'clawd'}-song-pack.txt`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
syncModeChrome();
