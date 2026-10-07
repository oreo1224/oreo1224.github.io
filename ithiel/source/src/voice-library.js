import { geminiRequest } from './gemini-api.js';

export function mountVoiceLibrary({ getKey, onSelect }) {
  const root = document.createElement('section');
  root.className = 'voice-library';
  root.innerHTML = `
    <details>
      <summary>拡張Voice Libraryから探す</summary>
      <form class="library-filters">
        <label>言語コード<input name="language_code" value="ja-JP" placeholder="例：ja-JP / 空欄で全言語"></label>
        <label>声の高さ<select name="pitch"><option value="">すべて</option value="low">低い</option><option value="medium">中間</option><option value="high">高い</option></select></label>
        <label>声の印象<select name="gender"><option value="">すべて</option><option value="female">女性的</option><option value="male">男性的</option><option value="neutral">中性的</option></select></label>
        <label>種類<select name="type"><option value="prebuilt">公式ライブラリ</option><option value="">すべて（保存済みカスタム含む）</option><option value="prompted">Voice design</option><option value="replicated">Voice replication</option></select></label>
        <label class="library-keyword">キーワード<input name="search" placeholder="例：warm / narrator"></label>
        <button type="submit">声を検索</button>
      </form>
      <p class="library-message" role="status">検索すると音声カタログを取得します。見つけた声を選び、本文の「音声を生成」で試聴できます。</p>
      <div class="library-results"></div>
      <button class="library-more" type="button" hidden>さらに読み込む</button>
    </details>`;
  document.querySelector('.voices').append(root);
  const form = root.querySelector('form');
  const message = root.querySelector('.library-message');
  const results = root.querySelector('.library-results');
  const more = root.querySelector('.library-more');
  let token = '', filters = {}, count = 0, controller;
  async function load(append = false) {
    const key = getKey();
    if (!key) { message.textContent = '右上の設定でGemini APIキーを入力してください。'; return; }
    controller?.abort();
    controller = new AbortController();
    const current = controller;
    if (!append) { filters = Object.fromEntries(new FormData(form)); token = ''; count = 0; results.replaceChildren(); }
    const query = new URLSearchParams({ page_size: '50' });
    Object.entries(filters).forEach(([name, value]) => { if (value) query.set(name, value.trim()); });
    if (append && token) query.set('page_token', token);
    form.querySelector('button').disabled = true; more.disabled = true;
    message.textContent = '音声カタログを取得中…';
    try {
      const data = await geminiRequest(`voices?${query}`, key, undefined, current.signal);
      if (!Array.isArray(data.voices)) throw new Error('音声カタログの形式が不正です');
      for (const item of data.voices) {
        if (!item.id) continue;
        const card = document.createElement('button');
        card.type = 'button'; card.className = 'voice catalog-voice';
        const title = document.createElement('b'); title.textContent = item.display_name || item.id;
        const description = document.createElement('small'); description.textContent = item.description || '';
        const metadata = document.createElement('small'); metadata.textContent = [item.language_code, item.accent, item.gender, item.pitch].filter(Boolean).join(' · ');
        card.append(title, description, metadata);
        card.onclick = () => {
          root.querySelectorAll('.catalog-voice').forEach(x => x.classList.toggle('selected', x === card));
          onSelect(item.id, item.display_name || item.id);
        };
        results.append(card); count++;
      }
      token = data.next_page_token || '';
      more.hidden = !token;
      message.textContent = count ? `${count}件を表示。声を選んで本文を生成してください。` : '該当する声がありません。言語コードや絞り込み条件を変えてみてください。';
    } catch (error) {
      if (error.name !== 'AbortError') message.textContent = `取得できませんでした：${error.message}`;
    } finally {
      if (current === controller) { form.querySelector('button').disabled = false; more.disabled = false; }
    }
  }
  form.onsubmit = event => { event.preventDefault(); load(); };
  more.onclick = () => load(true);
  return { clearSelection() { root.querySelectorAll('.catalog-voice').forEach(x => x.classList.remove('selected')); } };
}
