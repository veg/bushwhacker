// BUSHWHACKER // Dedicated WebAssembly Worker (Off-Main-Thread MDL Engine)
import init, { WasmBushwhacker } from './pkg/bushwhacker.js';

let engine = null;
let ready = false;
let cachedFastaText = '';
let cachedCohortKey = '';

async function ensureInitialized() {
  if (ready && engine) return;
  await init();
  engine = new WasmBushwhacker();
  ready = true;
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  const { id, type } = msg;
  try {
    if (type === 'init') {
      await ensureInitialized();
      self.postMessage({ id, type: 'ready' });
      return;
    }

    await ensureInitialized();

    if (type === 'set_cohort') {
      cachedFastaText = String(msg.fastaText || '');
      cachedCohortKey = String(msg.cohortKey || '');
      self.postMessage({ id, type: 'cohort_cached', cohortKey: cachedCohortKey, bytes: cachedFastaText.length });
      return;
    }

    if (type === 'infer_alignment' || type === 'infer_fasta') {
      const t0 = performance.now();
      const mode = String(msg.dataMode || 'auto');
      if (typeof msg.fastaText === 'string' && msg.fastaText.length > 0) {
        cachedFastaText = msg.fastaText;
        if (msg.cohortKey) cachedCohortKey = String(msg.cohortKey);
      }
      const inputText = (typeof msg.fastaText === 'string' && msg.fastaText.length > 0)
        ? msg.fastaText
        : cachedFastaText;
      const startNwk = String(msg.startingNewick || '');
      let jsonStr;
      if (typeof engine.infer_alignment_with_options === 'function') {
        jsonStr = engine.infer_alignment_with_options(
          inputText,
          mode,
          Boolean(msg.codingAware),
          Boolean(msg.detectShunts),
          Number(msg.minShuntSites || 4),
          Boolean(msg.noMultPen),
          Boolean(msg.empiricalAlpha),
          startNwk
        );
      } else if (typeof engine.infer_alignment === 'function') {
        jsonStr = engine.infer_alignment(
          inputText,
          mode,
          Boolean(msg.codingAware),
          Boolean(msg.detectShunts),
          Number(msg.minShuntSites || 4)
        );
      } else {
        jsonStr = engine.infer_fasta(
          inputText,
          Boolean(msg.codingAware),
          Boolean(msg.detectShunts),
          Number(msg.minShuntSites || 4)
        );
      }
      const wallMs = performance.now() - t0;
      self.postMessage({ id, type: 'infer_result', jsonStr, wallMs });
      return;
    }

    if (type === 'compress_bwz') {
      const inputText = (typeof msg.fastaText === 'string' && msg.fastaText.length > 0)
        ? msg.fastaText
        : cachedFastaText;
      const bytes = engine.compress_bwz(
        inputText,
        String(msg.resultJson || '')
      );
      self.postMessage({ id, type: 'compress_bwz_result', bytes }, [bytes.buffer]);
      return;
    }

    if (type === 'decompress_bwz') {
      const u8 = msg.bytes instanceof Uint8Array ? msg.bytes : new Uint8Array(msg.bytes);
      const jsonStr = engine.decompress_bwz(u8);
      self.postMessage({ id, type: 'decompress_bwz_result', jsonStr });
      return;
    }

    throw new Error(`Unknown worker command: ${type}`);
  } catch (err) {
    const errMsg = (err && err.message) ? err.message : String(err);
    self.postMessage({ id, type: 'error', error: errMsg });
  }
};
