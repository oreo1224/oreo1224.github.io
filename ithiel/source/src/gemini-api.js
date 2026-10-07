const base = 'https://generativelanguage.googleapis.com/v1beta';

export async function geminiRequest(path, key, body, signal) {
  if (!key) throw new Error('右上の設定からAPIキーを入力してください');
  const response = await fetch(`${base}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-goog-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  return data;
}

export async function synthesize({ key, model, text, voice, style }) {
  const data = await geminiRequest('interactions', key, {
    model, input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }],
    response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice }] }
  });
  const audio = data.steps?.filter(step => step.type === 'model_output').flatMap(step => step.content || []).filter(part => part.type === 'audio').at(-1);
  if (!audio?.data) throw new Error('音声データを受け取れませんでした');
  return audio.data;
}
