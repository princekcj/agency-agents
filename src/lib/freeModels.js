export const OPENROUTER_FREE_MODELS_URL = 'https://openrouter.ai/collections/free-models';

export const FREE_MODELS = [
  { id: 'openrouter/free', label: 'OpenRouter Auto (free)' },
  { id: 'nvidia/nemotron-3-ultra:free', label: 'NVIDIA Nemotron 3 Ultra' },
  { id: 'inclusionai/ling-3.0-flash:free', label: 'Ling 3.0 Flash' },
  { id: 'poolside/laguna-s-2.1:free', label: 'Poolside Laguna S 2.1' },
  { id: 'nvidia/nemotron-3-super:free', label: 'NVIDIA Nemotron 3 Super' },
  { id: 'cohere/north-mini-code:free', label: 'Cohere North Mini Code' },
  { id: 'poolside/laguna-xs-2.1:free', label: 'Poolside Laguna XS 2.1' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'NVIDIA Nemotron 3 Nano 30B' },
  { id: 'nvidia/nemotron-3-nano-omni:free', label: 'NVIDIA Nemotron 3 Nano Omni' },
  { id: 'nvidia/nemotron-nano-9b-v2:free', label: 'NVIDIA Nemotron Nano 9B V2' },
  { id: 'google/gemma-4-26b-a4b:free', label: 'Google Gemma 4 26B' },
  { id: 'openai/gpt-oss-20b:free', label: 'OpenAI GPT OSS 20B' },
];

export function isFreeModel(model) {
  return model === 'openrouter/free' || String(model || '').endsWith(':free');
}

export function normalizeFreeModel(model) {
  return isFreeModel(model) ? model : FREE_MODELS[0].id;
}
