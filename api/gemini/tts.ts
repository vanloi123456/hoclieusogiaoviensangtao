import {
  handleVietnameseTts,
  parseJsonBody,
  setTtsCorsHeaders,
  type TtsSynthesisRequest,
} from '../_lib/ttsEngine.js';

export default async function handler(req: any, res: any) {
  setTtsCorsHeaders(res);

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
    const body = (await parseJsonBody(req)) as TtsSynthesisRequest;
    const result = await handleVietnameseTts(req, body, '/api/gemini/tts');

    if (result.ok === false) {
      return res.status(result.status).json({
        success: false,
        message: result.error,
        error: result.error,
        detail: result.detail,
      });
    }

    return res.status(200).json({
      success: true,
      audioBase64: result.audioBase64,
      mimeType: result.mimeType,
      audioDataUrl: result.audioDataUrl,
      voiceName: result.voiceName,
      model: result.provider === 'gemini' ? 'gemini-3.8-flash-lite-tts' : result.provider,
    });
  } catch (err: any) {
    console.error('Vercel /api/gemini/tts error:', err);
    return res.status(500).json({
      success: false,
      message: 'Không thể tạo giọng đọc AI Tiếng Việt lúc này. Vui lòng thử lại sau.',
    });
  }
}
