// Runs TrOCR (handwriting-trained) off the main thread. Model weights come from the Hugging Face CDN on
// first use and are cached by the browser; images are processed here and never leave the device.
import { AutoProcessor, AutoTokenizer, LogitsProcessor, RawImage, VisionEncoderDecoderModel, type Tensor } from '@huggingface/transformers';

export const TROCR_MODEL = 'Xenova/trocr-small-handwritten';
export type WorkerLine = { data: Uint8ClampedArray; width: number; height: number };
export type WorkerRequest = { id: number; lines: WorkerLine[] };
export type WorkerMessage =
  | { id: number; type: 'loading'; progress: number }
  | { id: number; type: 'line'; index: number; total: number; text: string; confidence: number }
  | { id: number; type: 'done' }
  | { id: number; type: 'error'; message: string };

// Greedy decoding picks the arg-max token, so the max softmax probability at each step is the chosen
// token's probability. Their mean is a usable per-line confidence.
class ConfidenceTracker extends LogitsProcessor {
  probabilities: number[] = [];
  _call(_inputIds: bigint[][], logits: Tensor) {
    const values = logits.data as Float32Array, width = logits.dims.at(-1)!, row = values.subarray(values.length - width);
    let max = -Infinity; for (const v of row) if (v > max) max = v;
    let sum = 0; for (const v of row) sum += Math.exp(v - max);
    this.probabilities.push(1 / sum);
    return logits;
  }
}

type Loaded = { processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>; tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>; model: Awaited<ReturnType<typeof VisionEncoderDecoderModel.from_pretrained>> };
let loading: Promise<Loaded> | null = null;
const fileProgress = new Map<string, number>();

function load(report: (progress: number) => void): Promise<Loaded> {
  loading ??= (async () => {
    const progress_callback = (info: { status: string; file?: string; progress?: number }) => {
      if (info.status === 'progress' && info.file) {
        fileProgress.set(info.file, info.progress ?? 0);
        const values = [...fileProgress.values()];
        report(Math.round(values.reduce((a, b) => a + b, 0) / Math.max(values.length, 3)));
      }
    };
    const [processor, tokenizer, model] = await Promise.all([
      AutoProcessor.from_pretrained(TROCR_MODEL, { progress_callback }),
      AutoTokenizer.from_pretrained(TROCR_MODEL, { progress_callback }),
      VisionEncoderDecoderModel.from_pretrained(TROCR_MODEL, { dtype: 'q8', device: 'wasm', progress_callback }),
    ]);
    return { processor, tokenizer, model };
  })().catch(error => { loading = null; throw error; });
  return loading;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, lines } = event.data;
  const post = (message: WorkerMessage) => self.postMessage(message);
  try {
    const { processor, tokenizer, model } = await load(progress => post({ id, type: 'loading', progress }));
    for (const [index, line] of lines.entries()) {
      const { pixel_values } = await processor(new RawImage(line.data, line.width, line.height, 4));
      const tracker = new ConfidenceTracker();
      const output = await model.generate({ inputs: pixel_values, max_new_tokens: 64, logits_processor: [tracker] } as never) as Tensor;
      const text = tokenizer.batch_decode(output, { skip_special_tokens: true })[0]?.trim() ?? '';
      const p = tracker.probabilities, confidence = p.length ? Math.round(100 * p.reduce((a, b) => a + b, 0) / p.length) : 0;
      post({ id, type: 'line', index, total: lines.length, text, confidence });
    }
    post({ id, type: 'done' });
  } catch (error) {
    post({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
