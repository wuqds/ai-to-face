const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const SAVED_DIR = path.resolve(process.env.SAVED_PHOTOS_DIR || path.join(ROOT_DIR, 'saved-photos'));
const RECORDS_FILE = path.join(SAVED_DIR, 'records.ndjson');
const HIGH_SCORE_THRESHOLD = 70;
const MAX_BODY_SIZE = 20 * 1024 * 1024;

const ARK_API_KEY = process.env.ARK_API_KEY || '';
const ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const ARK_MODEL = 'doubao-seed-2-0-mini-260215';
const AI_ANALYZE_TIMEOUT_MS = 30000;

const AI_SCORING_PROMPT = `你是一位专业的人像美学分析师。请仔细观察这张人脸照片，从以下五个维度进行评分（每个维度0-99分整数）：

1. symmetry（对称美）：面部左右对称程度，五官位置的左右对称性
2. harmony（协调美）：五官比例是否协调，是否符合黄金比例，面部整体和谐感
3. refinement（精致美）：五官的精致程度，皮肤质感，面部线条的清晰流畅度
4. aura（气质美）：整体气质、神态、眼神中传达的气质与美感
5. charm（魅力值）：整体吸引力、感染力，给人留下的第一印象

请同时给出：
- total（综合评分，0-99分整数，基于五维加权综合评估）
- complement（一段50-100字的个性化真诚赞美，要客观真实，基于照片中实际可见的特征来夸奖，不要泛泛而谈，要具体到眼神、笑容、面部轮廓等细节）

评分标准：
- 90-99：极少数人能达到的顶级水平
- 80-89：明显出众，具有显著美感优势
- 65-79：高于平均水平，有明显的美感亮点
- 50-64：处于大众平均水平，有自己独特的美
- 35-49：有提升空间，但也有独特的个性美
- 0-34：评分较低，但美是多元的

请严格按照以下JSON格式回复，不要添加任何其他文字：
{"symmetry":85,"harmony":82,"refinement":78,"aura":80,"charm":83,"total":82,"complement":"你的眼睛如同..."}`;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp'
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function setApiHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  setApiHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function scoreToRank(score) {
  if (score >= 95) return { letter: 'SSS', label: '绝世神颜' };
  if (score >= 88) return { letter: 'SS', label: '极光天颜' };
  if (score >= 78) return { letter: 'S', label: '璀璨仙颜' };
  if (score >= 68) return { letter: 'A', label: '雅致美颜' };
  if (score >= 55) return { letter: 'B', label: '清秀之姿' };
  if (score >= 40) return { letter: 'C', label: '凡尘之姿' };
  return { letter: 'D', label: '璞玉待琢' };
}

function parseImageDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) {
    const error = new Error('Invalid image data URL');
    error.statusCode = 400;
    throw error;
  }

  const mimeType = match[1].toLowerCase();
  const extMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  const ext = extMap[mimeType];
  if (!ext) {
    const error = new Error('Unsupported image type');
    error.statusCode = 400;
    throw error;
  }

  return {
    buffer: Buffer.from(match[2], 'base64'),
    ext,
    mimeType
  };
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    req.on('data', chunk => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        const error = new Error('Request body too large');
        error.statusCode = 413;
        fail(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        settled = true;
        resolve(JSON.parse(raw));
      } catch (error) {
        error.statusCode = 400;
        reject(error);
      }
    });

    req.on('error', fail);
  });
}

async function saveHighScorePhoto(payload) {
  const total = Number(payload?.scores?.total);
  if (!payload?.imageDataUrl || !Number.isFinite(total)) {
    const error = new Error('Missing imageDataUrl or scores.total');
    error.statusCode = 400;
    throw error;
  }

  if (total <= HIGH_SCORE_THRESHOLD) {
    const error = new Error(`Only photos above ${HIGH_SCORE_THRESHOLD} are stored`);
    error.statusCode = 400;
    throw error;
  }

  const { buffer, ext, mimeType } = parseImageDataUrl(payload.imageDataUrl);
  const id = randomUUID();
  const savedAt = new Date().toISOString();
  const rank = scoreToRank(total);
  const fileName = `${savedAt.replace(/[:.]/g, '-')}-${rank.letter}-${total}-${id}.${ext}`;

  await fsp.mkdir(SAVED_DIR, { recursive: true });
  await fsp.writeFile(path.join(SAVED_DIR, fileName), buffer);

  const record = {
    id,
    savedAt,
    threshold: HIGH_SCORE_THRESHOLD,
    source: payload.source || 'upload',
    originalName: payload.fileName || '',
    storedFile: fileName,
    mimeType,
    score: total,
    rank,
    scores: payload.scores
  };

  await fsp.appendFile(RECORDS_FILE, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

async function serveFrontend(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const rawPath = decodeURIComponent(requestUrl.pathname);
  const relativePath = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(FRONTEND_DIR, relativePath));

  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stats = await fsp.stat(filePath);
    const finalPath = stats.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    res.writeHead(200, { 'Content-Type': getMimeType(finalPath) });
    fs.createReadStream(finalPath).pipe(res);
  } catch {
    if (path.extname(relativePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const fallback = path.join(FRONTEND_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(fallback).pipe(res);
  }
}

function parseAiResponse(text) {
  try {
    const obj = JSON.parse(text);
    return validateAiScores(obj);
  } catch {}

  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try { return validateAiScores(JSON.parse(fenceMatch[1])); } catch {}
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return validateAiScores(JSON.parse(braceMatch[0])); } catch {}
  }

  throw new Error('无法解析AI响应中的评分数据');
}

function validateAiScores(obj) {
  const dims = ['symmetry', 'harmony', 'refinement', 'aura', 'charm', 'total'];
  const result = {};
  for (const key of dims) {
    const val = Number(obj[key]);
    if (!Number.isFinite(val) || val < 0 || val > 99) {
      throw new Error(`AI返回的${key}分数无效: ${obj[key]}`);
    }
    result[key] = Math.round(val);
  }
  result.complement = String(obj.complement || obj.compliment || '').trim();
  return result;
}

function callDoubaoVisionApi(imageDataUrl) {
  return new Promise((resolve, reject) => {
    if (!ARK_API_KEY) {
      const err = new Error('ARK_API_KEY not configured');
      err.statusCode = 503;
      return reject(err);
    }

    const requestBody = JSON.stringify({
      model: ARK_MODEL,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: imageDataUrl },
            { type: 'input_text', text: AI_SCORING_PROMPT }
          ]
        }
      ]
    });

    const url = new URL(ARK_API_URL);
    const req = require('https').request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ARK_API_KEY}`,
        'Content-Length': Buffer.byteLength(requestBody, 'utf8')
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const parsed = JSON.parse(raw);
          if (res.statusCode !== 200) {
            const errMsg = parsed?.error?.message || parsed?.message || `API returned ${res.statusCode}`;
            const err = new Error(errMsg);
            err.statusCode = 502;
            return reject(err);
          }
          let outputText = null;
          if (Array.isArray(parsed.output)) {
            for (const item of parsed.output) {
              if (Array.isArray(item.content)) {
                const textItem = item.content.find(c => c.type === 'output_text' && c.text);
                if (textItem) { outputText = textItem.text; break; }
              }
            }
          } else if (typeof parsed.output === 'string') {
            outputText = parsed.output;
          }
          if (!outputText) {
            const err = new Error('Empty response from AI model');
            err.statusCode = 502;
            return reject(err);
          }
          resolve(parseAiResponse(outputText));
        } catch (err) {
          err.statusCode = err.statusCode || 502;
          reject(err);
        }
      });
    });

    req.setTimeout(AI_ANALYZE_TIMEOUT_MS, () => {
      req.destroy();
      const err = new Error('AI analysis timed out');
      err.statusCode = 504;
      reject(err);
    });

    req.on('error', (err) => {
      err.statusCode = err.statusCode || 502;
      reject(err);
    });

    req.write(requestBody);
    req.end();
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    if (req.url.startsWith('/api/')) {
      if (req.method === 'OPTIONS') {
        setApiHeaders(res);
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'GET' && req.url === '/api/health') {
        sendJson(res, 200, {
          ok: true,
          threshold: HIGH_SCORE_THRESHOLD
        });
        return;
      }

      if (req.method === 'POST' && req.url === '/api/high-score-photos') {
        try {
          const payload = await readJsonBody(req);
          const record = await saveHighScorePhoto(payload);
          sendJson(res, 201, {
            ok: true,
            id: record.id,
            storedFile: record.storedFile,
            savedAt: record.savedAt
          });
        } catch (error) {
          sendJson(res, error.statusCode || 500, {
            ok: false,
            error: error.message || 'Internal Server Error'
          });
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/api/ai-analyze') {
        try {
          const payload = await readJsonBody(req);
          if (!payload?.imageDataUrl) {
            return sendJson(res, 400, { ok: false, error: 'Missing imageDataUrl' });
          }
          const aiResult = await callDoubaoVisionApi(payload.imageDataUrl);
          sendJson(res, 200, {
            ok: true,
            scores: {
              symmetry: aiResult.symmetry,
              harmony: aiResult.harmony,
              refinement: aiResult.refinement,
              aura: aiResult.aura,
              charm: aiResult.charm,
              total: aiResult.total
            },
            complement: aiResult.complement
          });
        } catch (error) {
          console.error('AI analyze error:', error.message);
          sendJson(res, error.statusCode || 500, {
            ok: false,
            error: error.message || 'AI analysis failed'
          });
        }
        return;
      }

      sendJson(res, 404, { ok: false, error: 'Not Found' });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    try {
      await serveFrontend(req, res);
    } catch (error) {
      res.writeHead(500);
      res.end(error.message || 'Internal Server Error');
    }
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Aurora Face server listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = {
  HIGH_SCORE_THRESHOLD,
  createServer,
  saveHighScorePhoto
};
