import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRepo,loadRepo} from '../src/github.js';
test('repository parser accepts home URLs and rejects alternate hosts, paths and credentials',()=>{
  assert.equal(parseRepo(' https://github.com/clawdbotatg/clawd-vesting.git/ ').fullName,'clawdbotatg/clawd-vesting');
  assert.equal(parseRepo('clawdbotatg/liquidity-vesting').name,'liquidity-vesting');
  for(const url of ['https://github.com.evil.test/a/b','https://u:p@github.com/a/b','http://github.com/a/b','https://github.com/a/b/tree/main','a/..','a/../b','https://github.com:444/a/b']) assert.throws(()=>parseRepo(url));
});
test('README pinned to canonical repo and newest returned SHA with Unicode intact',async()=>{
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});
    if(url.endsWith('/old'))return Response.json({full_name:'clawdbotatg/new',description:'desc',default_branch:'main',topics:[]});
    if(url.includes('/commits'))return Response.json([{sha:'deadbeef',commit:{message:'fix tea ☕\nmore text'}}]);
    return new Response('# A notebook\nWarm tea ☕ and a slow new day.');
  };
  const repo=await loadRepo('clawdbotatg/old',{fetchImpl});
  assert.equal(repo.fullName,'clawdbotatg/new');
  assert.equal(repo.revision,'deadbeef');
  assert.ok(calls[1].url.includes('/new/commits'));
  assert.ok(calls[2].url.endsWith('/readme?ref=deadbeef'));
  assert.ok(repo.readme.includes('☕'));
  assert.equal(repo.commits[0].message,'fix tea ☕');
});
test('rate limited metadata fails clearly and does not invent context',async()=>{
  await assert.rejects(loadRepo('clawdbotatg/test',{fetchImpl:async()=>new Response('',{status:403})}),/limited/);
});
test('missing README is reported while real metadata and commits remain available',async()=>{
  const repo=await loadRepo('clawdbotatg/test',{fetchImpl:async url=>{
    if(url.includes('/readme'))return new Response('',{status:404});
    if(url.includes('/commits'))return Response.json([]);
    return Response.json({description:'Real metadata',default_branch:'main'});
  }});
  assert.equal(repo.description,'Real metadata');
  assert.equal(repo.readme,'');
  assert.equal(repo.warnings.length,1);
  assert.ok(repo.warnings[0].includes('README unavailable'));
});
test('canceling stops load rather than producing a partial pack',async()=>{
  const controller=new AbortController();
  const fetchImpl=async url=>{
    if(url.includes('/commits')){controller.abort();throw new DOMException('Aborted','AbortError');}
    return Response.json({default_branch:'main'});
  };
  await assert.rejects(loadRepo('clawdbotatg/test',{fetchImpl,signal:controller.signal}),/Aborted/);
});
