import {handleGenerateLyricsRequest} from '../server/generate-lyrics.mjs';

export const config = {
  maxDuration: 60
};

export default {
  async fetch(request) {
    return handleGenerateLyricsRequest(request, {
      env: process.env,
      fetchImpl: globalThis.fetch.bind(globalThis)
    });
  }
};
