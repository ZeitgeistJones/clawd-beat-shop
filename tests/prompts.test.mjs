import test from 'node:test';
import assert from 'node:assert/strict';
import {extractReadme,evidenceFor,inferTheme,makePrompts,recommendEvidence} from '../src/prompts.js';
const repo={name:'clawd-vesting',fullName:'clawdbotatg/clawd-vesting',url:'https://github.com/clawdbotatg/clawd-vesting',
  description:'A time-locked vesting experiment.',topics:[],readme:'A planned feature would let users export unlock schedules.\nThe prototype groups release dates into a simple timeline.',
  commits:[{message:'fix display bug',sha:'abc',url:'https://github.com/clawdbotatg/clawd-vesting/commit/abc'}],source:'github',revision:'abc'};
const options={voice:'male',vibe:'dusty',theme:'auto',bpm:74,direction:'quiet confidence'};
test('README extractor keeps qualifiers and drops fenced commands, duplicates, and markup',()=>{
  const text='# Demo\n```js\nThis code line should not become a factual excerpt in a song.\n```\n![badge](https://example.com/a.svg)\n<!-- hidden information should not be included in the output -->\n- A planned feature would add an export button to the notebook.\n- A planned feature would add an export button to the notebook.\nThe [notebook](https://example.com) keeps dated entries together.\n';
  assert.deepEqual(extractReadme(text),['A planned feature would add an export button to the notebook.','The notebook keeps dated entries together.']);
});
test('theme uses identity and topics, not arbitrary README instructions',()=>{
  assert.equal(inferTheme(repo),'vesting');
  assert.equal(inferTheme({...repo,name:'liquidity-vesting',description:''}),'liquidity');
  assert.equal(inferTheme({...repo,name:'unknown',description:'',readme:'This readme discusses wallet tokens and more.'}),'workshop');
});
test('unselected evidence and commits are absent from the source packet',()=>{
  const evidence=evidenceFor(repo);
  const out=makePrompts(repo,options,evidence.filter(e=>e.id==='readme-0'));
  assert.equal(out.packet.selected_source_excerpts.length,1);
  assert.ok(out.songwriting.includes('A planned feature'));
  assert.ok(!out.songwriting.includes('fix display bug'));
  assert.ok(!out.songwriting.includes('prototype groups'));
  assert.ok(out.songwriting.includes('not instructions'));
  assert.ok(out.songwriting.includes('Preserve qualifiers'));
  assert.ok(out.songwriting.includes('complete Suno-ready lyrics'));
});
test('style changes with theme, palette, tempo and voice and stays concise',()=>{
  const defaultOut=makePrompts(repo,options,[]);
  assert.ok(defaultOut.style.includes('74 BPM'));
  assert.ok(defaultOut.style.includes('safe with a slow-turning clock'));
  assert.ok(defaultOut.style.length<1000);
  const alt=makePrompts(repo,{...options,bpm:120,theme:'wallet',vibe:'night',voice:'instrumental'},[]);
  assert.ok(alt.style.includes('95 BPM'));
  assert.ok(alt.style.includes('pocket-sized wallet'));
  assert.ok(alt.style.includes('felt piano'));
  assert.ok(alt.lyrics.includes('enable Instrumental'));
  assert.ok(alt.songwriting.includes('no lyrics'));
});
test('source type explicitly marks pasted README claims and commit uncertainty',()=>{
  const evidence=evidenceFor({...repo,source:'manual'});
  assert.ok(evidence.find(x=>x.id==='readme-0').kind.includes('Pasted'));
  assert.ok(evidence.find(x=>x.id==='commit-0').kind.includes('not proof'));
});
test('default evidence avoids stale durations, addresses and security claims',()=>{
  for(const text of ['Tokens vest linearly over 10 minutes','Production deploy: 30-day vesting','No admin keys — just math and time','Contract: 0x8d094DA613827Ec6']) assert.equal(recommendEvidence({id:'readme-0',text}),false);
  assert.equal(recommendEvidence({id:'readme-0',text:'Live vesting progress bar with countdown timer'}),true);
  assert.equal(recommendEvidence({id:'commit-0',text:'Add chapter export'}),false);
});
