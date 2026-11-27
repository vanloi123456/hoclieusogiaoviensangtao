import { GoogleGenAI } from '@google/genai';

export interface TtsSynthesisRequest {
  text?: string;
  names?: string[] | string;
  region?: string;
  voiceId?: string;
  voiceName?: string;
  gender?: string;
  tone?: string;
  speed?: string;
  stylePrompt?: string;
}

export interface TtsSynthesisSuccess {
  ok: true;
  audioBase64: string;
  mimeType: string;
  audioDataUrl: string;
  voiceName: string;
  provider: 'gemini' | 'upstream' | 'cloud-vi-tts';
}

export interface TtsSynthesisError {
  ok: false;
  status: number;
  error: string;
  detail?: string;
}

export type TtsSynthesisResult = TtsSynthesisSuccess | TtsSynthesisError;

type GeminiVoice = 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';

interface VoicePreset {
  prebuiltVoice: GeminiVoice;
  gender: 'female' | 'male';
  personaStyle: string;
}

const SUPPORTED_GEMINI_VOICES = new Set<GeminiVoice>([
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Zephyr',
]);

const LEGACY_VOICE_MAP: Record<string, GeminiVoice> = {
  Aoede: 'Kore',
  Leda: 'Zephyr',
};

const VOICE_PRESETS: Record<string, VoicePreset> = {
  // Vòng quay kiến thức
  nu_mai: {
    prebuiltVoice: 'Kore',
    gender: 'female',
    personaStyle:
      'Warm, gentle, clear Southern Vietnamese (Saigon) female teacher voice, affectionate classroom tone, crisp pronunciation',
  },
  nu_thao: {
    prebuiltVoice: 'Zephyr',
    gender: 'female',
    personaStyle:
      'Bright, cheerful, energetic Southern Vietnamese (Saigon) young female host voice with lively educational enthusiasm',
  },
  nu_lan: {
    prebuiltVoice: 'Kore',
    gender: 'female',
    personaStyle:
      'Calm, articulate, measured-pace Southern Vietnamese female educator voice enunciating every word and number clearly',
  },
  nu_ngoc: {
    prebuiltVoice: 'Zephyr',
    gender: 'female',
    personaStyle:
      'Sweet, encouraging, supportive Southern Vietnamese female mentor voice with warm Saigon intonation',
  },
  nam_minh: {
    prebuiltVoice: 'Puck',
    gender: 'male',
    personaStyle:
      'Warm, friendly, engaging Southern Vietnamese (Saigon) male teacher voice with encouraging classroom warmth',
  },
  nam_hung: {
    prebuiltVoice: 'Charon',
    gender: 'male',
    personaStyle:
      'Deep, calm, steady Southern Vietnamese male narrator and teacher voice with clear classroom rhythm',
  },
  nam_tuan: {
    prebuiltVoice: 'Fenrir',
    gender: 'male',
    personaStyle:
      'Lively, upbeat, enthusiastic Southern Vietnamese male game-show teacher voice with exciting quiz energy',
  },
  nam_khoa: {
    prebuiltVoice: 'Puck',
    gender: 'male',
    personaStyle:
      'Gentle, patient, reassuring Southern Vietnamese male tutor voice with supportive classroom delivery',
  },

  // Trò chơi lật mảnh ghép
  female_gentle: {
    prebuiltVoice: 'Kore',
    gender: 'female',
    personaStyle:
      'Warm, gentle, patient Southern Vietnamese (Saigon) female teacher voice, clear articulation for elementary students',
  },
  female_bright: {
    prebuiltVoice: 'Zephyr',
    gender: 'female',
    personaStyle:
      'Bright, sparkling, cheerful Southern Vietnamese female teacher voice, lively and encouraging',
  },
  male_warm: {
    prebuiltVoice: 'Puck',
    gender: 'male',
    personaStyle:
      'Friendly, warm, approachable Southern Vietnamese male teacher voice, upbeat and clear',
  },
  male_deep: {
    prebuiltVoice: 'Charon',
    gender: 'male',
    personaStyle:
      'Calm, deep, steady, reassuring Southern Vietnamese male teacher voice with clear pronunciation',
  },

  // Từ ngữ biết bay / Legacy Southern voices
  nu_co_giao: {
    prebuiltVoice: 'Kore',
    gender: 'female',
    personaStyle:
      'Authentic Ho Chi Minh City / Southern Vietnamese female teacher (giọng nữ miền Nam Sài Gòn), warm, gentle, articulate',
  },
  nu_nang_dong: {
    prebuiltVoice: 'Zephyr',
    gender: 'female',
    personaStyle:
      'Authentic Southern Vietnamese young female teacher (giọng nữ miền Nam trẻ trung), bright, energetic, lively',
  },
  nu_mien_tay: {
    prebuiltVoice: 'Kore',
    gender: 'female',
    personaStyle:
      'Authentic Mekong Delta / Southwestern Vietnamese female speaker (giọng nữ miền Tây Nam Bộ), sweet, soft, melodious',
  },
  nam_thay_giao: {
    prebuiltVoice: 'Puck',
    gender: 'male',
    personaStyle:
      'Authentic Ho Chi Minh City / Southern Vietnamese male teacher (giọng nam miền Nam Sài Gòn), friendly, cheerful, approachable',
  },
  nam_tram_am: {
    prebuiltVoice: 'Charon',
    gender: 'male',
    personaStyle:
      'Authentic Southern Vietnamese male teacher (giọng nam miền Nam trầm ấm), calm, deep, clear, reassuring',
  },
  nam_soi_noi: {
    prebuiltVoice: 'Fenrir',
    gender: 'male',
    personaStyle:
      'Authentic Mekong Delta / Southern Vietnamese lively male game host (giọng nam miền Tây sôi nổi), expressive, warm, energetic',
  },
};

const GEMINI_KEY_ENV_NAMES = [
  'GEMINI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GEMINI_API_KEY',
  'GEMINI_KEY',
  'GENAI_API_KEY',
  'API_KEY',
  'VITE_GEMINI_API_KEY',
  'NEXT_PUBLIC_GEMINI_API_KEY',
] as const;

const PLACEHOLDER_KEYS = new Set([
  'MY_GEMINI_API_KEY',
  'YOUR_GEMINI_API_KEY',
  'YOUR_API_KEY',
  'GEMINI_API_KEY',
  'REPLACE_ME',
  'UNDEFINED',
  'NULL',
]);

let cachedClient: GoogleGenAI | null = null;
let cachedKey: string | undefined = undefined;

export function normalizeEnvSecret(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let val = raw.trim();
  if (
    (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
    (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
  ) {
    val = val.slice(1, -1).trim();
  }
  if (!val || PLACEHOLDER_KEYS.has(val.toUpperCase())) {
    return '';
  }
  return val;
}

export function resolveGeminiApiKey(): string {
  for (const name of GEMINI_KEY_ENV_NAMES) {
    const candidate = normalizeEnvSecret(process.env[name]);
    if (candidate) {
      return candidate;
    }
  }
  return '';
}

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return null;
  }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedKey = apiKey;
    cachedClient = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  }
  return cachedClient;
}

export function resolveUpstreamTtsEndpoint(req: any, pathSuffix: string): string | null {
  const candidates = [
    process.env.TTS_UPSTREAM_URL,
    process.env.AI_BACKEND_URL,
    process.env.BACKEND_API_URL,
    process.env.APP_URL,
    process.env.VITE_API_ORIGIN,
  ];
  const currentHost = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '')
    .trim()
    .toLowerCase();

  for (const raw of candidates) {
    const cleaned = normalizeEnvSecret(raw).replace(/\/+$/, '');
    if (!cleaned || cleaned === 'MY_APP_URL' || !/^https?:\/\//i.test(cleaned)) {
      continue;
    }
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (currentHost && parsed.host.toLowerCase() === currentHost) {
        continue;
      }
      return `${parsed.origin}${pathSuffix}`;
    } catch {
      continue;
    }
  }
  return null;
}

export async function parseJsonBody(req: any): Promise<Record<string, any>> {
  if (req?.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req?.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(req?.body)) {
    try {
      return JSON.parse(req.body.toString('utf8'));
    } catch {
      return {};
    }
  }
  return await new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let resolved = false;
    const done = (val: Record<string, any>) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };
    if (typeof req?.on !== 'function') {
      done({});
      return;
    }
    req.on('data', (chunk: any) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        done(raw ? JSON.parse(raw) : {});
      } catch {
        done({});
      }
    });
    req.on('error', () => done({}));
  });
}

export function setTtsCorsHeaders(res: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function isBadRequestError(err: any): boolean {
  const status = Number(err?.status ?? err?.cause?.status ?? 0);
  if (status === 400) return true;
  const msg = String(err?.message || '').toUpperCase();
  return msg.includes('400') || msg.includes('INVALID_ARGUMENT');
}

function formatNamesSpeechText(namesInput: string[] | string | undefined): string {
  if (Array.isArray(namesInput)) {
    const cleaned = namesInput.map((n) => String(n || '').trim()).filter(Boolean);
    if (cleaned.length === 0) return '';
    if (cleaned.length === 1) return `Chúc mừng bạn ${cleaned[0]}`;
    if (cleaned.length <= 6) return `Chúc mừng các bạn: ${cleaned.join(', ')}`;
    return `Chúc mừng các bạn: ${cleaned.slice(0, 6).join(', ')} và ${cleaned.length - 6} bạn khác`;
  }
  if (typeof namesInput === 'string' && namesInput.trim()) {
    return `Chúc mừng bạn ${namesInput.trim()}`;
  }
  return '';
}

function resolveSpeechParams(body: TtsSynthesisRequest): {
  text: string;
  prebuiltVoice: GeminiVoice;
  styleInstruction: string;
} {
  const rawText = typeof body.text === 'string' ? body.text.trim() : '';
  const namesText = formatNamesSpeechText(body.names);
  const text = (rawText || namesText).replace(/\s+/g, ' ').trim().slice(0, 900);

  const requestedVoiceName = typeof body.voiceName === 'string' ? body.voiceName.trim() : '';
  const mappedLegacy = LEGACY_VOICE_MAP[requestedVoiceName] || requestedVoiceName;
  const voiceId = typeof body.voiceId === 'string' ? body.voiceId.trim() : '';
  const preset = voiceId ? VOICE_PRESETS[voiceId] : undefined;

  const isMale =
    body.gender === 'male' ||
    preset?.gender === 'male' ||
    voiceId.startsWith('nam_') ||
    voiceId.startsWith('male_');

  let prebuiltVoice: GeminiVoice = isMale ? 'Puck' : 'Kore';
  if (preset) {
    prebuiltVoice = preset.prebuiltVoice;
  } else if (SUPPORTED_GEMINI_VOICES.has(mappedLegacy as GeminiVoice)) {
    prebuiltVoice = mappedLegacy as GeminiVoice;
  }

  const region = typeof body.region === 'string' ? body.region.trim().toLowerCase() : 'southern';
  let regionLabel = 'natural Southern Vietnamese (tiếng Việt giọng miền Nam Việt Nam)';
  if (region === 'northern') {
    regionLabel = 'standard Northern Vietnamese (tiếng Việt giọng chuẩn Hà Nội miền Bắc)';
  } else if (region === 'central') {
    regionLabel = 'natural Central Vietnamese (tiếng Việt giọng miền Trung nhẹ nhàng, rõ ràng)';
  }

  let toneDesc = 'clear, expressive, friendly classroom reading tone';
  switch (body.tone) {
    case 'correct':
      toneDesc = 'bright, joyful, enthusiastic, praising classroom tone celebrating a correct answer';
      break;
    case 'wrong':
      toneDesc = 'gentle, patient, warm, encouraging classroom tone motivating students to try again';
      break;
    case 'question':
      toneDesc = 'clear, expressive, steady classroom reading tone so every word is heard distinctly';
      break;
    case 'sample':
      toneDesc = 'natural, friendly, welcoming classroom introduction tone';
      break;
    case 'cheerful_kids':
      toneDesc = 'cheerful, playful, bright primary-school classroom voice';
      break;
    case 'clear_formal':
      toneDesc = 'clear, articulate, confident academic narrator tone';
      break;
    case 'friendly_teacher':
      toneDesc = 'warm, friendly, engaging Vietnamese teacher tone';
      break;
  }

  let speedDesc = '';
  if (body.speed === 'slow') {
    speedDesc = ' Speak at a slightly slower, deliberate pace so students can listen easily.';
  } else if (body.speed === 'fast') {
    speedDesc = ' Speak at a slightly brisk, energetic pace.';
  }

  const customStyle = typeof body.stylePrompt === 'string' ? body.stylePrompt.trim() : '';
  let styleInstruction = customStyle;
  if (!styleInstruction) {
    const persona = preset?.personaStyle ? `${preset.personaStyle}. ` : '';
    const genderLabel = isMale ? 'male speaker' : 'female speaker';
    styleInstruction = `Speak in ${regionLabel} as a ${genderLabel}. ${persona}Deliver with a ${toneDesc}.${speedDesc}`;
  }

  return { text, prebuiltVoice, styleInstruction };
}

function parsePcmSampleRate(rawMimeType?: string): number {
  const match = String(rawMimeType || '').match(/rate=(\d{4,6})/i);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed >= 8000 && parsed <= 96000) {
      return parsed;
    }
  }
  return 24000;
}

function buildWavFromPcm(pcmBytes: Buffer, sampleRate = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBytes.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBytes.length, 40);
  return Buffer.concat([header, pcmBytes]);
}

function isLikelyAudioBuffer(buf: Buffer): boolean {
  if (buf.length < 128) return false;
  // WAV RIFF
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF') return true;
  // ID3 MP3
  if (buf.subarray(0, 3).toString('ascii') === 'ID3') return true;
  // MPEG frame sync (11 bits set)
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  // Ogg / FLAC
  const head4 = buf.subarray(0, 4).toString('ascii');
  if (head4 === 'OggS' || head4 === 'fLaC') return true;
  // Reject HTML / JSON error pages masquerading as 200
  const prefix = buf.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
  if (prefix.startsWith('<') || prefix.startsWith('{') || prefix.startsWith('[')) {
    return false;
  }
  return false;
}

function ensurePlayableAudio(base64Data: string, rawMimeType?: string): {
  audioBase64: string;
  mimeType: string;
} {
  const buf = Buffer.from(base64Data, 'base64');
  const mimeLower = (rawMimeType || '').toLowerCase();

  // Already a valid WAV RIFF file
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF') {
    return { audioBase64: base64Data, mimeType: 'audio/wav' };
  }

  // MP3 (ID3 tag or frame sync)
  if (
    mimeLower.includes('mpeg') ||
    mimeLower.includes('mp3') ||
    (buf.length >= 3 && buf.subarray(0, 3).toString('ascii') === 'ID3') ||
    (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
  ) {
    return { audioBase64: base64Data, mimeType: 'audio/mpeg' };
  }

  // Raw PCM (audio/l16 or headerless audio from Gemini) -> wrap in RIFF WAV header
  if (mimeLower.includes('l16') || mimeLower.includes('pcm') || mimeLower.includes('wav') || !mimeLower) {
    const wavBuf = buildWavFromPcm(buf, parsePcmSampleRate(rawMimeType));
    return { audioBase64: wavBuf.toString('base64'), mimeType: 'audio/wav' };
  }

  return { audioBase64: base64Data, mimeType: rawMimeType || 'audio/wav' };
}

function splitVietnameseChunks(text: string, maxLen = 175): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const parts = clean.split(/(?<=[.!?;:,])\s+/);
  const chunks: string[] = [];
  let cur = '';

  for (const part of parts) {
    if ((cur + ' ' + part).trim().length <= maxLen) {
      cur = (cur + ' ' + part).trim();
    } else {
      if (cur) chunks.push(cur);
      if (part.length <= maxLen) {
        cur = part;
      } else {
        const words = part.split(/\s+/);
        cur = '';
        for (const w of words) {
          if ((cur + ' ' + w).trim().length <= maxLen) {
            cur = (cur + ' ' + w).trim();
          } else {
            if (cur) chunks.push(cur);
            cur = w.slice(0, maxLen);
          }
        }
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function fetchCloudChunkWithMirrors(chunk: string, ttsspeed: string): Promise<Buffer | null> {
  const q = encodeURIComponent(chunk);
  const candidates = [
    `https://translate.google.com/translate_tts?ie=UTF-8&q=${q}&tl=vi&client=tw-ob&ttsspeed=${ttsspeed}`,
    `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${q}&tl=vi&client=gtx&ttsspeed=${ttsspeed}`,
    `https://translate.google.com/translate_tts?ie=UTF-8&q=${q}&tl=vi&client=gtx&ttsspeed=${ttsspeed}`,
    `https://translate.google.com.vn/translate_tts?ie=UTF-8&q=${q}&tl=vi&client=tw-ob&ttsspeed=${ttsspeed}`,
  ];

  for (const url of candidates) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2400);
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
          Accept: 'audio/mpeg, audio/*;q=0.9, */*;q=0.5',
        },
        signal: controller.signal,
      });
      if (!resp.ok) continue;
      const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
      if (
        contentType &&
        !contentType.includes('audio') &&
        !contentType.includes('octet-stream')
      ) {
        continue;
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (!isLikelyAudioBuffer(buf)) continue;
      return buf;
    } catch {
      // Try next mirror
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return null;
}

async function synthesizeViaCloudVietnameseTts(
  text: string,
  speed?: string
): Promise<{ audioBase64: string; mimeType: string } | null> {
  const chunks = splitVietnameseChunks(text, 175).slice(0, 8);
  if (chunks.length === 0) return null;

  const ttsspeed = speed === 'slow' ? '0.85' : speed === 'fast' ? '1.15' : '1';

  try {
    const audioBuffers = await Promise.all(
      chunks.map((chunk) => fetchCloudChunkWithMirrors(chunk, ttsspeed))
    );

    if (audioBuffers.some((b) => !b)) {
      return null;
    }

    const validBuffers = audioBuffers as Buffer[];
    const merged = Buffer.concat(validBuffers);
    if (merged.length < 128) return null;
    return {
      audioBase64: merged.toString('base64'),
      mimeType: 'audio/mpeg',
    };
  } catch (err) {
    console.warn('Cloud Vietnamese TTS fallback error:', err);
    return null;
  }
}

async function synthesizeViaGemini(
  text: string,
  prebuiltVoice: GeminiVoice,
  styleInstruction: string,
  timeoutMs = 6000
): Promise<{ audioBase64: string; mimeType: string } | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  const runGenerate = async (model: string, withStyle: boolean) => {
    const part = withStyle
      ? { text, speechMetadata: { style: styleInstruction } }
      : { text };
    return await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [part] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: prebuiltVoice },
          },
        },
      },
    });
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const geminiPromise = (async () => {
      try {
        return await runGenerate('gemini-3.8-flash-lite-tts', true);
      } catch (firstErr: any) {
        if (isBadRequestError(firstErr)) {
          return await runGenerate('gemini-3.8-flash-lite-tts', false);
        }
        throw firstErr;
      }
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Gemini TTS timeout')), timeoutMs);
    });

    const response: any = await Promise.race([geminiPromise, timeoutPromise]);
    const parts = response?.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find((p: any) => p?.inlineData?.data);
    const inlineData = audioPart?.inlineData;
    if (!inlineData?.data) {
      return null;
    }
    return ensurePlayableAudio(String(inlineData.data), inlineData.mimeType);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const ttsMemoryCache = new Map<string, { value: TtsSynthesisSuccess; cachedAt: number }>();
const TTS_CACHE_TTL_MS = 30 * 60 * 1000;
const TTS_CACHE_MAX_ITEMS = 80;

function getCachedTts(key: string): TtsSynthesisSuccess | null {
  const entry = ttsMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTS_CACHE_TTL_MS) {
    ttsMemoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedTts(key: string, value: TtsSynthesisSuccess): void {
  if (ttsMemoryCache.size >= TTS_CACHE_MAX_ITEMS) {
    const firstKey = ttsMemoryCache.keys().next().value;
    if (firstKey) ttsMemoryCache.delete(firstKey);
  }
  ttsMemoryCache.set(key, { value, cachedAt: Date.now() });
}

export async function handleVietnameseTts(
  req: any,
  body: TtsSynthesisRequest,
  upstreamPath = '/api/tts'
): Promise<TtsSynthesisResult> {
  const { text, prebuiltVoice, styleInstruction } = resolveSpeechParams(body);

  if (!text) {
    return {
      ok: false,
      status: 400,
      error: 'Vui lòng nhập nội dung Tiếng Việt để tạo giọng đọc AI.',
    };
  }

  const cacheKey = [
    text,
    prebuiltVoice,
    body.voiceId || '',
    body.region || '',
    body.gender || '',
    body.tone || '',
    body.speed || '',
  ].join('::');
  const cached = getCachedTts(cacheKey);
  if (cached) {
    return cached;
  }

  let geminiFailureDetail = '';

  // 1. Primary: Gemini AI TTS (when GEMINI_API_KEY is configured)
  try {
    const geminiAudio = await synthesizeViaGemini(text, prebuiltVoice, styleInstruction);
    if (geminiAudio) {
      const okRes: TtsSynthesisSuccess = {
        ok: true,
        audioBase64: geminiAudio.audioBase64,
        mimeType: geminiAudio.mimeType,
        audioDataUrl: `data:${geminiAudio.mimeType};base64,${geminiAudio.audioBase64}`,
        voiceName: prebuiltVoice,
        provider: 'gemini',
      };
      setCachedTts(cacheKey, okRes);
      return okRes;
    }
  } catch (err: any) {
    geminiFailureDetail = err instanceof Error ? err.message : String(err);
    console.warn('Gemini TTS primary attempt failed, trying fallback:', geminiFailureDetail);
  }

  // 2. Secondary: Explicit upstream TTS backend proxy if configured
  if (!getGeminiClient()) {
    const upstreamEndpoint = resolveUpstreamTtsEndpoint(req, upstreamPath);
    if (upstreamEndpoint) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);
        const upstreamRes = await fetch(upstreamEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const upstreamData: any = await upstreamRes.json().catch(() => null);
        if (upstreamRes.ok && upstreamData?.audioBase64) {
          const mime = upstreamData.mimeType || 'audio/wav';
          const okRes: TtsSynthesisSuccess = {
            ok: true,
            audioBase64: upstreamData.audioBase64,
            mimeType: mime,
            audioDataUrl:
              upstreamData.audioDataUrl || `data:${mime};base64,${upstreamData.audioBase64}`,
            voiceName: upstreamData.voiceName || prebuiltVoice,
            provider: 'upstream',
          };
          setCachedTts(cacheKey, okRes);
          return okRes;
        }
      } catch (proxyErr) {
        console.warn('Upstream TTS proxy error:', proxyErr);
      }
    }
  }

  // 3. Universal Cloud Vietnamese TTS Fallback (works on Vercel without env key & across all browsers/devices)
  const fallbackAudio = await synthesizeViaCloudVietnameseTts(text, body.speed);
  if (fallbackAudio) {
    const okRes: TtsSynthesisSuccess = {
      ok: true,
      audioBase64: fallbackAudio.audioBase64,
      mimeType: fallbackAudio.mimeType,
      audioDataUrl: `data:${fallbackAudio.mimeType};base64,${fallbackAudio.audioBase64}`,
      voiceName: prebuiltVoice,
      provider: 'cloud-vi-tts',
    };
    setCachedTts(cacheKey, okRes);
    return okRes;
  }

  return {
    ok: false,
    status: 503,
    error:
      'Không thể tạo giọng đọc AI Tiếng Việt lúc này. Vui lòng kiểm tra kết nối mạng hoặc cấu hình GEMINI_API_KEY trên máy chủ rồi thử lại.',
    detail: geminiFailureDetail || undefined,
  };
}
