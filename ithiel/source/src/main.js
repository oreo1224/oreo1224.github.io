import './style.css';
import { mountVoiceLibrary } from './voice-library.js';
import { synthesize } from './gemini-api.js';

const voices = [
  ['Zephyr', 'Bright / 明るい'], ['Puck', 'Upbeat / 前向き'], ['Charon', 'Informative / 明瞭'], ['Kore', 'Firm / 芯のある声'], ['Fenrir', 'Excitable / 高揚感'], ['Leda', 'Youthful / 若々しい'],
  ['Orus', 'Firm / 芯のある声'], ['Aoede', 'Breezy / 軽やか'], ['Callirrhoe', 'Easy-going / 気楽'], ['Autonoe', 'Bright / 明るい'], ['Enceladus', 'Breathy / 息づかい'], ['Iapetus', 'Clear / クリア'],
  ['Umbriel', 'Easy-going / 気楽'], ['Algieba', 'Smooth / なめらか'], ['Despina', 'Smooth / なめらか'], ['Erinome', 'Clear / クリア'], ['Algenib', 'Gravelly / ざらつき'], ['Rasalgethi', 'Informative / 明瞭'],
  ['Laomedeia', 'Upbeat / 前向き'], ['Achernar', 'Soft / やわらかい'], ['Alnilam', 'Firm / 芯のある声'], ['Schedar', 'Even / 均整'], ['Gacrux', 'Mature / 落ち着き'], ['Pulcherrima', 'Forward / 前に出る'],
  ['Achird', 'Friendly / 親しみ'], ['Zubenelgenubi', 'Casual / カジュアル'], ['Vindemiatrix', 'Gentle / 優しい'], ['Sadachbia', 'Lively / 活発'], ['Sadaltager', 'Knowledgeable / 知的'], ['Sulafat', 'Warm / 温かい']
];
const samples = [
  'おはようございます。本日の予定をお知らせします。',
  'ただいま、会場の準備が整いました。どうぞお楽しみください。',
  '新しいアイデアって、試してみるまで分からないのが面白いよね。'
];
const saved = [];
const $ = (s) => document.querySelector(s);

document.querySelector('#app').innerHTML = `
  <main>
    <header><div class="brand"><span class="mark">⌁</span><div><strong>Vox Lab</strong><small>GEMINI TTS PLAYGROUND</small></div></div><div class="endpoint"><span></span><b id="endpointState">API endpoint 未設定</b><button class="icon" id="settings" aria-label="接続設定">⚙</button></div></header>
    <section class="intro"><p class="eyebrow">VOICE DIRECTION / 01</p><h1>声の印象を、<em>耳で決める。</em></h1><p>話者、演技指示、テンポを調整して、候補をその場で聞き比べ。</p></section>
    <section class="studio">
      <div class="panel script"><div class="section-title"><p>01 / SCRIPT</p><span id="count">0 / 800</span></div><textarea id="text" maxlength="800" placeholder="ここに読ませたい文章を入力…">${samples[0]}</textarea><div class="samples"><span>QUICK TEXT</span>${samples.map((x,i)=>`<button data-sample="${i}">${i + 1}</button>`).join('')}</div></div>
      <div class="panel voices"><div class="section-title"><p>02 / VOICE</p><span>PREBUILT</span></div><div class="voice-grid">${voices.map(([name,desc],i)=>`<button class="voice ${i === 3 ? 'selected' : ''}" data-voice="${name}"><b>${name}</b><small>${desc}</small><i></i></button>`).join('')}</div></div>
      <div class="panel direction"><div class="section-title"><p>03 / DIRECTION</p><button class="reset" id="reset">リセット</button></div><label>演技・ニュアンス<textarea id="direction" maxlength="240" placeholder="例：明るいテンションで、少しテンポよく">自然で聞き取りやすく。親しみを込めて話してください。</textarea></label><div class="ranges"><label>話す速さ <output id="speedOut">標準</output><input id="speed" type="range" min="0" max="4" value="2"></label><label>ピッチ <output id="pitchOut">標準</output><input id="pitch" type="range" min="0" max="4" value="2"></label></div></div>
      <div class="generate"><div><p>READY TO GENERATE</p><span id="status">テキストと声を選んで生成</span></div><button id="generate">音声を生成 <span>⌁</span></button></div>
    </section>
    <section class="results"><div class="results-head"><div><p class="eyebrow">TAKES</p><h2>生成したテイク</h2></div><button id="clear">履歴を消去</button></div><div id="empty" class="empty">まだテイクがありません。設定を変えて最初の一声を作ろう。</div><div id="takes" class="takes"></div></section>
  </main>
  <dialog id="dialog"><form method="dialog"><button class="close" value="cancel">×</button><p class="eyebrow">CONNECTION</p><h2>Gemini API設定</h2><p class="help">Geminiへ直接接続します。キーはこのページを開いている間だけ保持し、再読み込みすると消えます。空欄で保存するとキーを消去します。</p><label>Gemini APIキー<input id="apiKey" type="password" autocomplete="off" placeholder="APIキーを入力"></label><label>モデル<select id="model"><option value="gemini-3.8-flash-tts">Gemini 3.8 Flash TTS</option><option value="gemini-3.8-flash-lite-tts">Gemini 3.8 Flash-Lite TTS</option></select></label><button id="save" value="default">保存する</button></form></dialog>`;

let voice = 'Kore';
let voiceLabel = 'Kore';
let apiKey = '';
let model = localStorage.getItem('vox-model') || 'gemini-3.8-flash-tts';
const speedWords = ['とてもゆっくり','ゆっくり','標準','やや速く','速く'];
const pitchWords = ['かなり低く','少し低く','標準','少し高く','高く'];
function setup() {
  const selectedLabel = document.createElement('p');
  selectedLabel.className = 'selected-voice-label';
  selectedLabel.textContent = '選択中：Kore';
  document.querySelector('.voices .section-title').after(selectedLabel);
  const library = mountVoiceLibrary({ getKey: () => apiKey, onSelect: (id, name) => {
    voice = id; voiceLabel = name;
    selectedLabel.textContent = `選択中：${name}`;
    document.querySelectorAll('[data-voice]').forEach(x => x.classList.remove('selected'));
  } });
  $('#model').value = model; update();
  document.querySelectorAll('[data-voice]').forEach(b => b.onclick = () => { voice = b.dataset.voice; voiceLabel = voice; selectedLabel.textContent = `選択中：${voice}`; library.clearSelection(); document.querySelectorAll('[data-voice]').forEach(x=>x.classList.toggle('selected',x===b)); });
  document.querySelectorAll('[data-sample]').forEach(b => b.onclick = () => { $('#text').value=samples[b.dataset.sample]; update(); });
  ['text','direction','speed','pitch'].forEach(id => $('#'+id).addEventListener('input',update));
  $('#settings').onclick=()=>$('#dialog').showModal();
  $('#save').onclick=()=>{ apiKey=$('#apiKey').value.trim(); $('#apiKey').value=''; model=$('#model').value; localStorage.setItem('vox-model',model); update(); };
  $('#reset').onclick=()=>{ $('#direction').value='自然で聞き取りやすく。親しみを込めて話してください。'; $('#speed').value=2; $('#pitch').value=2; update(); };
  $('#generate').onclick=generate; $('#clear').onclick=()=>{ saved.length=0; renderTakes(); };
}
function update(){ const t=$('#text').value; $('#count').textContent=`${t.length} / 800`; $('#speedOut').textContent=speedWords[$('#speed').value]; $('#pitchOut').textContent=pitchWords[$('#pitch').value]; $('#endpointState').textContent=apiKey?'APIキー設定済み':'APIキー未設定'; }
function wavUrl(base64){ const bytes=Uint8Array.from(atob(base64), c=>c.charCodeAt(0)); return URL.createObjectURL(new Blob([bytes],{type:'audio/wav'})); }
async function generate(){ if(!$('#text').value.trim()) return; if(!apiKey){ $('#dialog').showModal(); return; } const btn=$('#generate'); btn.disabled=true; $('#status').textContent='Geminiが音声を生成中…'; try { const snapshot = {voice, voiceLabel, model, text:$('#text').value}; const style=[$('#direction').value, `speaking ${['very slowly','slowly','at a natural pace','fairly quickly','quickly'][$('#speed').value]}`, `${['very low','slightly low','natural','slightly high','high'][$('#pitch').value]} pitch`].filter(Boolean).join(', '); const audioBase64 = await synthesize({key:apiKey,...snapshot,style}); const audioUrl=wavUrl(audioBase64); saved.unshift({audioUrl,...snapshot,at:new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}),style}); renderTakes(); $('#status').textContent='テイクを追加しました'; } catch(e) { $('#status').textContent=`生成できませんでした：${e.message}`; } finally { btn.disabled=false; }}
function renderTakes(){ $('#empty').hidden=!!saved.length; $('#takes').innerHTML=saved.map((t,i)=>`<article class="take"><span class="num">${String(i+1).padStart(2,'0')}</span><div class="take-meta"><b>${escapeHtml(t.voiceLabel || t.voice)}</b><span>${t.at} · ${escapeHtml(t.text.slice(0,42))}${t.text.length>42?'…':''}</span></div><audio controls src="${t.audioUrl}"></audio><button class="download" data-dl="${i}" aria-label="ダウンロード">↓</button></article>`).join(''); document.querySelectorAll('[data-dl]').forEach(b=>b.onclick=()=>{const a=document.createElement('a');a.href=saved[b.dataset.dl].audioUrl;a.download=`vox-lab-${saved[b.dataset.dl].voice}.wav`;a.click();});}
function escapeHtml(value){return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
setup();
