const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 7788;
const ROOT = __dirname;

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'application/javascript',
  '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.webp':'image/webp', '.json':'application/json',
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' });
  res.end(body);
}

// 公共：保存图片 → codemaker run → 返回文本
function runCodemaker({ imgList, prompt, model, tag }, callback) {
  const modelArg = model || 'netease-codemaker/claude-sonnet-4-5-20250929';
  const imgPaths = [];
  try {
    imgList.forEach((img, i) => {
      const imgPath = path.join(os.tmpdir(), `__ux_${tag}_${i}.jpg`);
      fs.writeFileSync(imgPath, Buffer.from(img.base64, 'base64'));
      imgPaths.push(imgPath);
    });
  } catch(e) { callback(new Error('图片保存失败: ' + e.message)); return; }

  const args = ['run', '-m', modelArg];
  imgPaths.forEach(p => { args.push('-f'); args.push(p); });
  args.push('--format', 'json');
  console.log(`[${tag}] codemaker run -m ${modelArg} -f [${imgPaths.length} imgs]`);

  const child = spawn('codemaker', args, { timeout: 180000, stdio: ['pipe','pipe','pipe'] });
  child.stdin.write(prompt);
  child.stdin.end();

  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('close', (code) => {
    imgPaths.forEach(p => { try { fs.unlinkSync(p); } catch(_){} });
    if (code !== 0 && !stdout) {
      callback(new Error('codemaker 执行失败 (exit ' + code + '): ' + stderr.substring(0, 200)));
      return;
    }
    let text = '', errorMsg = '';
    for (const line of stdout.split('\n')) {
      const l = line.trim(); if (!l) continue;
      try {
        const ev = JSON.parse(l);
        if (ev.type === 'text' && ev.part?.text) text += ev.part.text;
        else if (ev.type === 'error') errorMsg = JSON.stringify(ev.error || ev);
      } catch(_) {}
    }
    if (errorMsg && !text) { callback(new Error('AI 返回错误: ' + errorMsg.substring(0, 200))); return; }
    if (!text) text = stdout;
    text = text.replace(/^```[a-z]*\n?/gim, '').replace(/```\s*$/gim, '').trim();
    console.log(`[${tag}] done, length=${text.length}, preview=${text.substring(0,150)}`);
    callback(null, text);
  });
}

// 解析请求 body
function parseBody(req, cb) {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    try { cb(null, JSON.parse(Buffer.concat(chunks).toString())); }
    catch(e) { cb(new Error('Invalid JSON')); }
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  // GET /health
  if (req.method === 'GET' && urlPath === '/health') {
    sendJSON(res, 200, { ok: true }); return;
  }

  // POST /extract — 逐图识别可交互文案列表
  // 请求体: { images: [{base64, name}], model }
  // 返回:   { results: [{screenIdx, screenName, texts: [{id, text, type}]}] }
  if (req.method === 'POST' && urlPath === '/extract') {
    parseBody(req, (err, body) => {
      if (err) { sendJSON(res, 400, { error: err.message }); return; }
      const { images, model } = body;
      if (!images?.length) { sendJSON(res, 400, { error: 'Missing images' }); return; }

      const results = [];
      let idx = 0;

      function processNext() {
        if (idx >= images.length) {
          sendJSON(res, 200, { results });
          return;
        }
        const img = images[idx];
        const screenIdx = idx;
        const screenName = img.name || `界面${screenIdx + 1}`;
        idx++;

        const prompt = `这是一张游戏界面截图（界面名：${screenName}）。

请识别图中所有可见文字，返回每段文字的内容、位置和是否为可交互元素。

返回 JSON 数组，不要包含任何其他文字：
[
  {
    "id": "1",
    "text": "文字内容",
    "type": "button/title/label/value/desc/icon",
    "interactive": true,
    "x": 0.1,
    "y": 0.05,
    "w": 0.3,
    "h": 0.06
  }
]

字段说明：
- type: button=按钮, title=标题, label=标签/页签, value=数值, desc=说明文字, icon=图标文字
- interactive: true=可点击的交互元素（按钮/标签页/导航/入口），false=纯展示内容（标题/数值/说明）
- 对于无文字的图标按钮（×/←/→等），用位置+功能描述，如"右上角×关闭图标"
- 坐标精确到小数点后2位，覆盖所有可见文字

无文字返回 []，只返回 JSON。`;

        runCodemaker({ imgList: [img], prompt, model, tag: `extract_${screenIdx}` }, (err, text) => {
          if (err) {
            console.error(`[extract] screen ${screenIdx} error:`, err.message);
            results.push({ screenIdx, screenName, texts: [], error: err.message });
          } else {
            let texts = [];
            try {
              const match = text.match(/\[[\s\S]*\]/);
              if (match) texts = JSON.parse(match[0]);
            } catch(_) {}
            results.push({ screenIdx, screenName, texts });
          }
          processNext();
        });
      }

      processNext();
    });
    return;
  }

  // POST /analyze — 完整审计（单界面 + 可选跨界面）
  // 请求体: { images, prompt, model }
  if (req.method === 'POST' && urlPath === '/analyze') {
    parseBody(req, (err, body) => {
      if (err) { sendJSON(res, 400, { error: err.message }); return; }
      const { images, imageBase64, mime, prompt, model } = body;
      const imgList = images || (imageBase64 ? [{ base64: imageBase64, name: '' }] : []);
      if (!imgList.length || !prompt) { sendJSON(res, 400, { error: 'Missing images or prompt' }); return; }

      runCodemaker({ imgList, prompt, model, tag: 'analyze' }, (err, text) => {
        if (err) { sendJSON(res, 500, { error: err.message }); return; }
        sendJSON(res, 200, { text });
      });
    });
    return;
  }

  // GET 静态文件
  if (req.method === 'GET') {
    const filePath = path.join(ROOT, urlPath === '/' ? '/ux-writing-audit.html' : urlPath);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext]||'application/octet-stream', 'Access-Control-Allow-Origin':'*' });
      res.end(data);
    });
    return;
  }

  res.writeHead(405); res.end('Method not allowed');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ UX Writing 审计服务器已启动`);
  console.log(`📌 http://127.0.0.1:${PORT}/ux-writing-audit.html`);
  console.log(`按 Ctrl+C 停止`);
});
