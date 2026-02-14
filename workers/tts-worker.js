/**
 * DailyDealFeed TTS Worker
 * Uses Cloudflare Workers AI with Deepgram Aura-1 for high-quality text-to-speech
 * 
 * Deploy: wrangler deploy
 * Cost: $0.015 per 1k characters (~$0.30 for 100 videos)
 */

export default {
  async fetch(request, env) {
    // Handle CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST required' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const { text, speaker = 'luna', format = 'mp3' } = await request.json();

      if (!text) {
        return new Response(JSON.stringify({ error: 'text required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Available speakers: angus, asteria, arcas, orion, orpheus, athena, luna, zeus, perseus, helios
      const validSpeakers = ['angus', 'asteria', 'arcas', 'orion', 'orpheus', 'athena', 'luna', 'zeus', 'perseus', 'helios'];
      const selectedSpeaker = validSpeakers.includes(speaker) ? speaker : 'luna';

      // Call Deepgram Aura-1 via Workers AI
      const audioResponse = await env.AI.run('@cf/deepgram/aura-1', {
        text: text,
        speaker: selectedSpeaker,
      }, {
        returnRawResponse: true,
      });

      // Return audio directly
      if (format === 'base64') {
        const buffer = await audioResponse.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return new Response(JSON.stringify({ audio: base64, speaker: selectedSpeaker }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Return raw MP3
      return new Response(audioResponse.body, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
        },
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
