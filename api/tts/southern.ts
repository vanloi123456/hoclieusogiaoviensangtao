import {
  handleVietnameseTts,
  parseJsonBody,
  setTtsCorsHeaders,
  type TtsSynthesisRequest,
} from '../_lib/ttsEngine.ts';

export default async function handler(req: any, res: any) {
  setTtsCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = (await parseJsonBody(req)) as TtsSynthesisRequest;
    const result = await handleVietnameseTts(req, body, '/api/tts/southern');

    if (result.ok === false) {
      return res.status(result.status).json({
        success: false,
        error: result.error,
        message: result.error,
        detail: result.detail,
      });
    }

    return res.status(200).json({
      success: true,
      audioBase64: result.audioBase64,
      mimeType: result.mimeType,
      audioDataUrl: result.audioDataUrl,
      voiceName: result.voiceName,
      provider: result.provider,
    });
  } catch (err: unknown) {
    console.error('Vercel /api/tts/southern error:', err);
    return res.status(500).json({
      success: false,
      error: 'Không thể tạo giọng đọc AI Tiếng Việt lúc này. Vui lòng thử lại.',
    });
  }
}
