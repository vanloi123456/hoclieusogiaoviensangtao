import { GoogleGenAI } from '@google/genai';

const SUPPORTED_TTS_VOICES = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
const LEGACY_VOICE_MAP: Record<string, string> = {
  Aoede: 'Kore',
  Leda: 'Zephyr',
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

function normalizeEnvSecret(raw: unknown): string {
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

function resolveGeminiApiKey(): string {
  for (const name of GEMINI_KEY_ENV_NAMES) {
    const candidate = normalizeEnvSecret(process.env[name]);
    if (candidate) {
      return candidate;
    }
  }
  return '';
}

function resolveUpstreamTtsEndpoint(req: any, pathSuffix: string): string | null {
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

function isBadRequestError(err: any): boolean {
  const status = Number(err?.status ?? err?.cause?.status ?? 0);
  if (status === 400) return true;
  const msg = String(err?.message || '').toUpperCase();
  return msg.includes('400') || msg.includes('INVALID_ARGUMENT');
}

function getGeminiClient(): GoogleGenAI | null {
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

async function parseJsonBody(req: any): Promise<Record<string, any>> {
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

function setCorsHeaders(res: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Phương thức không được hỗ trợ. Vui lòng dùng POST.',
    });
  }

  try {
    const body = await parseJsonBody(req);
    const rawText = typeof body.text === 'string' ? body.text.trim() : '';
    const rawVoice = typeof body.voiceName === 'string' ? body.voiceName.trim() : 'Kore';
    const rawStyle = typeof body.stylePrompt === 'string' ? body.stylePrompt.trim() : '';

    if (!rawText) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập nội dung Tiếng Việt để tạo giọng đọc AI.',
      });
    }

    if (rawText.length > 600) {
      return res.status(400).json({
        success: false,
        message: 'Nội dung cần đọc không được vượt quá 600 ký tự.',
      });
    }

    const ai = getGeminiClient();
    if (!ai) {
      const upstreamEndpoint = resolveUpstreamTtsEndpoint(req, '/api/gemini/tts');
      if (upstreamEndpoint) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 25000);
          const upstreamRes = await fetch(upstreamEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: rawText, voiceName: rawVoice, stylePrompt: rawStyle }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          const upstreamData = await upstreamRes.json().catch(() => null);
          if (upstreamData && typeof upstreamData === 'object') {
            return res.status(upstreamRes.status).json(upstreamData);
          }
        } catch (proxyErr) {
          console.error('Vercel /api/gemini/tts upstream proxy error:', proxyErr);
        }
      }

      return res.status(500).json({
        success: false,
        message:
          'Máy chủ Vercel chưa được cấu hình GEMINI_API_KEY để tạo giọng đọc AI. Vui lòng vào Vercel > Project Settings > Environment Variables, thêm biến GEMINI_API_KEY (cho Production & Preview) rồi Redeploy.',
      });
    }

    const mappedVoice = LEGACY_VOICE_MAP[rawVoice] || rawVoice;
    const resolvedVoice = SUPPORTED_TTS_VOICES.has(mappedVoice) ? mappedVoice : 'Kore';
    const styleInstruction =
      rawStyle || 'Đọc bằng giọng Tiếng Việt tự nhiên, phát âm chuẩn, truyền cảm và rõ ràng.';

    const buildPart = (withStyle: boolean) =>
      withStyle
        ? {
            text: rawText,
            speechMetadata: { style: styleInstruction },
          }
        : {
            text: rawText,
          };

    let response: any;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [buildPart(true)],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: resolvedVoice,
              },
            },
          },
        },
      });
    } catch (firstErr: any) {
      if (isBadRequestError(firstErr)) {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [buildPart(false)],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: resolvedVoice,
                },
              },
            },
          },
        });
      } else {
        throw firstErr;
      }
    }

    const parts = response?.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find((p: any) => p?.inlineData?.data);
    const inlineData = audioPart?.inlineData;

    if (!inlineData?.data) {
      return res.status(502).json({
        success: false,
        message: 'Gemini AI không trả về dữ liệu âm thanh. Vui lòng thử lại.',
      });
    }

    return res.status(200).json({
      success: true,
      audioBase64: inlineData.data,
      mimeType: inlineData.mimeType || 'audio/wav',
      voiceName: resolvedVoice,
      model: 'gemini-3.8-flash-lite-tts',
    });
  } catch (err: any) {
    console.error('Vercel /api/gemini/tts error:', err);
    const status =
      typeof err?.status === 'number' && err.status >= 400 && err.status < 600
        ? err.status
        : 502;
    const upstreamMsg = err?.message ? String(err.message) : 'Lỗi kết nối Gemini TTS';
    let userMessage = 'Không thể tạo giọng đọc AI Tiếng Việt lúc này. Vui lòng thử lại sau.';
    if (status === 429) {
      userMessage = 'Hệ thống tạo giọng AI đang quá tải tạm thời. Vui lòng đợi vài giây rồi thử lại.';
    } else if (status === 401 || status === 403 || upstreamMsg.toUpperCase().includes('API_KEY_INVALID')) {
      userMessage =
        'Khóa GEMINI_API_KEY trên máy chủ không hợp lệ hoặc thiếu quyền. Vui lòng kiểm tra lại Environment Variables trên Vercel rồi Redeploy.';
    } else if (status === 400) {
      userMessage = 'Yêu cầu tạo giọng đọc không hợp lệ. Vui lòng kiểm tra lại câu Tiếng Việt.';
    }
    return res.status(status).json({
      success: false,
      message: userMessage,
      detail: upstreamMsg,
    });
  }
}
