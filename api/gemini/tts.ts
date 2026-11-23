import { GoogleGenAI } from '@google/genai';

const SUPPORTED_TTS_VOICES = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
const LEGACY_VOICE_MAP: Record<string, string> = {
  Aoede: 'Kore',
  Leda: 'Zephyr',
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
      return res.status(500).json({
        success: false,
        message: 'Máy chủ chưa được cấu hình GEMINI_API_KEY để tạo giọng đọc AI.',
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
      if (firstErr?.status === 400) {
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
    } else if (status === 401 || status === 403) {
      userMessage = 'Không thể xác thực dịch vụ tạo giọng đọc AI trên máy chủ.';
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
