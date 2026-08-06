const Whisper = (() => {
  const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

  let transcriber = null;
  let currentModel = null;
  let onMsg = () => {};

  const message = (info) => {
    try { onMsg(info); } catch (e) {}
  };

  async function loadTranscriber(model) {
    if (transcriber && currentModel === model) return transcriber;
    message({ stage: 'model' });
    const mod = await import(TRANSFORMERS_URL);
    mod.env.allowLocalModels = false;
    mod.env.useBrowserCache = true;
    mod.env.useFuseCache = false;
    transcriber = await mod.pipeline('automatic-speech-recognition', model, {
      progress_callback: p => {
        if (p.status === 'progress' && p.file) {
          message({ stage: 'model', pct: 33 + Math.round((p.progress || 0) / 2) });
        }
      }
    });
    currentModel = model;
    return transcriber;
  }

  function resample16k(src, fromRate) {
    if (fromRate === 16000) {
      return src;
    }
    const ratio = 16000 / fromRate;
    const out = new Float32Array(Math.max(1, Math.floor(src.length * ratio)));
    for (let i = 0; i < out.length; i++) {
      const pos = i / ratio;
      const i0 = Math.floor(pos);
      const f = pos - i0;
      const a = src[i0] !== undefined ? src[i0] : 0;
      const b = src[i0 + 1] !== undefined ? src[i0 + 1] : a;
      out[i] = a * (1 - f) + b * f;
    }
    return out;
  }

  function downmix(buffer) {
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const data = new Float32Array(length);
    if (channels === 1) return buffer.getChannelData(0);
    for (let c = 0; c < channels; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        data[i] += channel[i] / channels;
      }
    }
    return data;
  }

  function srtTime(sec) {
    sec = Math.max(0, sec || 0);
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
    const ms = String(Math.round((sec % 1) * 1000)).padStart(3, '0');
    return h + ':' + m + ':' + s + ',' + ms;
  }

  async function transcribe(file, model, language, onProgress) {
    if (onProgress) onMsg = onProgress;
    message({ stage: 'start', pct: 2 });
    const decoded = await decodeToPcm16k(file);
    const pipe = await loadTranscriber(model);
    message({ stage: 'transcribe', pct: 34 });
    const output = await pipe(decoded.data, {
      language: language || 'en',
      task: 'transcribe',
      chunk_length_s: 10,
      stride_length_s: 1
    });
    message({ stage: 'done', pct: 100 });
    const chunks = output.chunks || [];
    return {
      text: (output.text || '').trim(),
      chunks: chunks,
      srt: chunksToSrt(chunks),
      audioDurationSec: decoded.durationSec
    };
  }

  function chunksToSrt(chunks) {
    if (!chunks || !chunks.length) return '';
    return chunks.map((c, i) => {
      const ts = c.timestamp || [0, 0];
      return (i + 1) + '\n' + srtTime(ts[0]) + ' --> ' + srtTime(ts[1]) + '\n' + (c.text || '').trim() + '\n';
    }).join('\n');
  }

  async function decodeToPcm16k(file) {
    const { data, sampleRate } = await decodeAudio(file);
    return { data: data, durationSec: Math.round(data.length / 16000) };
  }

  async function decodeAudio(file) {
    message({ stage: 'decode' });
    const arrayBuffer = await file.arrayBuffer();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const runningCtx = ctx.state === 'suspended' ? ctx.resume().then(() => ctx) : Promise.resolve(ctx);
    const activeCtx = await runningCtx;
    try {
      const buffer = await activeCtx.decodeAudioData(arrayBuffer);
      const mono = downmix(buffer);
      await activeCtx.close();
      return { data: resample16k(mono, buffer.sampleRate), sampleRate: buffer.sampleRate };
    } catch (e) {
      try { await activeCtx.close(); } catch (_) {}
      throw e;
    }
  }

  return {
    transcribe,
    chunksToSrt,
    models: { tiny: 'Xenova/whisper-tiny', base: 'Xenova/whisper-base' }
  };
})();