import { GoogleGenAI } from '@google/genai';

interface ServerVoiceConfig {
  prebuiltVoice: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';
  personaStyle: string;
}

const SOUTHERN_VOICE_MAP: Record<string, ServerVoiceConfig> = {
  nu_co_giao: {
    prebuiltVoice: 'Kore',
    personaStyle:
      'Authentic Ho Chi Minh City / Southern Vietnamese female teacher (giọng nữ miền Nam Sài Gòn), warm, gentle, articulate, affectionate classroom tone',
  },
  nu_nang_dong: {
    prebuiltVoice: 'Zephyr',
    personaStyle:
      'Authentic Southern Vietnamese young female teacher (giọng nữ miền Nam trẻ trung), bright, energetic, lively, sparkling classroom enthusiasm',
  },
  nu_mien_tay: {
    prebuiltVoice: 'Kore',
    personaStyle:
      'Authentic Mekong Delta / Southwestern Vietnamese female speaker (giọng nữ miền Tây Nam Bộ), sweet, soft, melodious, warm storytelling rhythm',
  },
  nam_thay_giao: {
    prebuiltVoice: 'Puck',
    personaStyle:
      'Authentic Ho Chi Minh City / Southern Vietnamese male teacher (giọng nam miền Nam Sài Gòn), friendly, cheerful, approachable, upbeat classroom tone',
  },
  nam_tram_am: {
    prebuiltVoice: 'Charon',
    personaStyle:
      'Authentic Southern Vietnamese male teacher (giọng nam miền Nam trầm ấm), calm, deep, clear, reassuring and articulate classroom delivery',
  },
  nam_soi_noi: {
    prebuiltVoice: 'Fenrir',
    personaStyle:
      'Authentic Mekong Delta / Southern Vietnamese lively male game host (giọng nam miền Tây sôi nổi), expressive, playful, warm and energetic',
  },
};

let cachedClient: GoogleGenAI | null = null;
let cachedKey: string | undefined = undefined;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = (await parseJsonBody(req)) as {
      text?: string;
      voiceId?: string;
      gender?: 'female' | 'male';
      tone?: 'correct' | 'wrong' | 'question' | 'sample';
    };

    const cleanText = typeof body.text === 'string' ? body.text.trim().slice(0, 360) : '';
    if (!cleanText) {
      return res.status(400).json({ error: 'Vui lòng nhập nội dung cần tạo giọng đọc AI.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error:
          'Chưa cấu hình khóa Gemini API trên máy chủ Vercel (GEMINI_API_KEY). Vui lòng kiểm tra Settings > Environment Variables.',
      });
    }

    const fallbackId = body.gender === 'male' ? 'nam_thay_giao' : 'nu_co_giao';
    const voiceCfg =
      (body.voiceId && SOUTHERN_VOICE_MAP[body.voiceId]) || SOUTHERN_VOICE_MAP[fallbackId];

    let emotionDesc =
      'bright, joyful, enthusiastic, praising classroom tone celebrating a correct answer';
    if (body.tone === 'wrong') {
      emotionDesc =
        'gentle, patient, warm, encouraging classroom tone motivating students to try again';
    } else if (body.tone === 'question') {
      emotionDesc =
        'clear, expressive, steady classroom reading tone so students at the back of the room hear every word distinctly';
    } else if (body.tone === 'sample') {
      emotionDesc = 'natural, friendly, welcoming classroom introduction tone';
    }

    const styleInstruction = `Speak in natural Southern Vietnamese (tiếng Việt giọng miền Nam Việt Nam). ${voiceCfg.personaStyle}. Deliver with a ${emotionDesc}.`;

    let response: any;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: styleInstruction,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceCfg.prebuiltVoice },
            },
          },
        },
      });
    } catch (firstErr: any) {
      if (firstErr?.status === 400) {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [{ text: cleanText }],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceCfg.prebuiltVoice },
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
        error: 'Không nhận được dữ liệu âm thanh từ mô hình giọng đọc AI.',
      });
    }

    return res.status(200).json({
      audioBase64: inlineData.data,
      mimeType: inlineData.mimeType || 'audio/wav',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status =
      typeof err === 'object' && err !== null && 'status' in err
        ? Number((err as { status?: unknown }).status)
        : 500;
    console.error('Vercel /api/tts error:', status, msg);
    if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({
        error:
          'Đã vượt giới hạn gọi giọng đọc AI tạm thời. Vui lòng đợi một chút rồi thử lại.',
      });
    }
    if (status === 403 || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
      return res.status(403).json({
        error:
          'Khóa API không hợp lệ hoặc thiếu quyền. Vui lòng kiểm tra biến môi trường GEMINI_API_KEY.',
      });
    }
    return res.status(500).json({
      error: 'Không thể tạo giọng đọc AI lúc này. Vui lòng thử lại.',
    });
  }
}
