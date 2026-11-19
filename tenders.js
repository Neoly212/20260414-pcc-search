import {api, casesFrom, csvFor, dateText, dayOffset, importTable, normalize, officialUrl, taipeiDay, tierLabels, versionKey} from './tender-data.js?v=20261119-2';

const byId = id => document.getElementById(id);
const cacheKey = 'pcc-tenders-last-v1';
const perPage = 40;
let notices = [], filtered = [], tier = 'focus', limit = perPage;
let description = '', loaded = false, activeQuery = null, revision = 0, pastedTable = null, lastLiveAt = 0;
const detailState = new Map();

function node(tag, content, className) {
  const item = document.createElement(tag);
  if (content !== undefined) item.textContent = content;
  if (className) item.className = className;
  return item;
}
function link(caption, href) {
  const item = node('a', caption);
  item.href = href; item.target = '_blank'; item.rel = 'noopener';
  return item;
}
function status(message, warning = false) {
  byId('status').textContent = message;
  byId('status').classList.toggle('warn', warning);
}

async function jsonAt(endpoint, params, signal) {
  const url = new URL(endpoint, api);
  url.search = new URLSearchParams(params).toString();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, {once:true});
  const timeout = setTimeout(cancel, 14000);
  try {
    const response = await fetch(url, {signal:controller.signal, credentials:'omit'});
    if (!response.ok) throw Error('HTTP ' + response.status);
    const data = await response.json();
    if (!data || data.error || data.error_msg) throw Error('來源未提供資料');
    return data;
  } catch (error) {
    if (signal?.aborted) throw Error('已停止查詢');
    if (controller.signal.aborted) throw Error('來源逾時');
    if (error instanceof SyntaxError) throw Error('來源未回傳公告資料');
    if (error instanceof TypeError) throw Error('無法連線到資料來源');
    throw error;
  } finally {
    clearTimeout(timeout); signal?.removeEventListener('abort', cancel);
  }
}

function cache() {
  if (!loaded) return;
  try {
    const data = JSON.stringify({notices, description, savedAt:new Date().toISOString(), lastLiveAt});
    if (data.length < 1600000) localStorage.setItem(cacheKey, data);
  } catch { /* Storage is optional, including in private browsing. */ }
}
function replace(rows, source) {
  revision++; detailState.clear();
  notices = rows; description = source; loaded = true; limit = perPage;
  render(); cache();
}

byId('query').addEventListener('submit', async event => {
  event.preventDefault();
  if (activeQuery) return;
  const end = byId('day').value, span = Number(byId('span').value);
  if (!dateText(end) || end > taipeiDay()) { status('請選擇今天或之前的公告日期。', true); return; }
  const dates = Array.from({length:span}, (_,i) => dayOffset(end, -i));
  const controller = new AbortController();
  activeQuery = controller; revision++; detailState.clear();
  byId('fetch-btn').disabled = true; byId('cancel-btn').hidden = false;
  const fetched = [], checked = [], noRecords = [];
  let interruption = '', invalid = 0;
  try {
    for (const day of dates) {
      status('讀取 ' + day + ' 的公開公告（' + (checked.length + noRecords.length + 1) + '/' + span + '）…');
      const result = await jsonAt('listbydate', {date:day.replaceAll('-','')}, controller.signal);
      if (!Array.isArray(result.records)) {
        if (Object.keys(result).length === 0) { noRecords.push(day); continue; }
        throw Error('公告清單格式無法辨識');
      }
      if (!result.records.length) { noRecords.push(day); continue; }
      const rows = result.records.filter(r => r && typeof r === 'object').map(normalize).filter(r => r.day === day && r.title && r.type);
      invalid += result.records.length - rows.length;
      if (!rows.length) throw Error('來源未提供與選定日期相符的有效公告');
      checked.push(day); fetched.push(...rows);
    }
  } catch (error) {
    interruption = error.message;
  } finally {
    if (activeQuery === controller) {
      activeQuery = null; byId('fetch-btn').disabled = false; byId('cancel-btn').hidden = true;
      const missed = dates.filter(day => !checked.includes(day) && !noRecords.includes(day));
      const notes = [];
      if (noRecords.length) notes.push(noRecords.join('、') + ' 來源尚無公告可核實');
      if (missed.length) notes.push(missed.join('、') + ' 未讀取（' + interruption + '）');
      if (invalid) notes.push(invalid + ' 則缺少日期、案名或類型，未能判讀');
      const scope = checked.length ? 'OpenFun · ' + (checked.length === 1 ? checked[0] : checked.at(-1) + ' 至 ' + checked[0]) + ' · 已讀 ' + checked.length + '/' + span + ' 天，共 ' + fetched.length.toLocaleString() + ' 則各類公告' : '';
      if (checked.length) {
        lastLiveAt = span === 1 && end === taipeiDay() && !notes.length ? Date.now() : 0;
        replace(fetched, [scope, ...notes].join('。'));
        status(description + '。', !!notes.length);
      } else {
        status('本次未取得可核實的公告。' + notes.join('。') + '。可匯入招標清單。' + (loaded ? '下方仍顯示先前清單。' : ''), true);
      }
    }
  }
});
byId('cancel-btn').onclick = () => activeQuery?.abort();

async function readDetails(row) {
  if (!row.unit || !row.job || detailState.get(row.key)?.busy || activeQuery) return;
  const atRevision = revision;
  detailState.set(row.key, {busy:true}); render();
  try {
    const result = await jsonAt('tender', {unit_id:row.unit, job_number:row.job});
    if (atRevision !== revision) return;
    if (!Array.isArray(result.records) || !result.records.length) throw Error('無法取得歷次公告');
    const revisions = result.records.map(normalize);
    if (revisions.some(r => !r.day || !r.title || !r.type || r.unit !== row.unit || r.job !== row.job)) throw Error('來源未提供可核實的案件歷程');
    const merged = new Map(notices.map(r => [versionKey(r),r]));
    for (const r of revisions) merged.set(versionKey(r), r);
    notices = [...merged.values()];
    detailState.set(row.key, {message:'已讀取歷次公告。'});
    cache();
    if (!casesFrom(notices).some(item => item.key === row.key)) status('已依後續公告更新「' + row.title + '」，該案已移出財物招標清單。');
  } catch (error) {
    if (atRevision === revision) detailState.set(row.key, {message:error.message + '，可稍後重試。'});
  } finally { if (atRevision === revision) render(); }
}

function caseCard(row) {
  const card = node('article', undefined, 'case'), main = node('div', undefined, 'main-info'), meta = node('div', undefined, 'meta');
  const tags = node('div', undefined, 'tags');
  tags.append(node('span', tierLabels[row.tier], 'tag ' + row.tier));
  tags.append(node('span', /財物/.test(row.category) ? '財物' : '採購性質待查', 'tag'));
  main.append(tags, node('h3',row.title), node('p',[row.org, row.dept, row.job].filter(Boolean).join(' · ')), node('small',row.why));
  const links = node('div', undefined, 'case-links');
  if (row.official) links.append(link('官方公告 ↗', row.official));
  const state = detailState.get(row.key);
  if (row.unit && row.job) {
    const btn = node('button', state?.busy ? '讀取中…' : '查看最新公告資料');
    btn.type = 'button'; btn.disabled = !!state?.busy || !!activeQuery;
    btn.onclick = () => readDetails(row); links.append(btn);
  }
  if (!row.official && !row.unit && row.job) {
    const button = node('button','複製案號'); button.type = 'button';
    button.onclick = async () => {
      try { await navigator.clipboard.writeText(row.job); button.textContent = '已複製案號'; }
      catch { status('可複製此案號到官方查詢：' + row.job); }
    };
    links.append(button);
  }
  main.append(links);
  if (state?.message) main.append(node('small',state.message,'feedback'));
  meta.append(node('span','公告 ' + row.day));
  meta.append(node('strong',row.deadline ? '截止 ' + row.deadline : '截止時間待查'));
  if (row.state !== '未截止' && row.state !== '期限待查') meta.append(node('span',row.state));
  if (row.budget) {
    const digits = row.budget.replace(/[,，\s]/g,'').replace(/元$/,'');
    meta.append(node('span','預算 ' + (/^\d+$/.test(digits) ? 'NT$ ' + Number(digits).toLocaleString('en-US') : row.budget)));
  }
  meta.append(node('small',row.type + (row.versions > 1 ? ' · ' + row.versions + ' 則公告' : '')));
  card.append(main,meta); return card;
}

function render() {
  const term = byId('search').value.trim().toLowerCase().replaceAll('台','臺');
  const validity = byId('validity').value;
  const items = casesFrom(notices).filter(row => {
    if (validity === 'open' && row.state !== '未截止') return false;
    if (validity === 'possible' && row.state === '已截止') return false;
    return !term || [row.title,row.org,row.job,row.why,row.items].join(' ').toLowerCase().replaceAll('台','臺').includes(term);
  });
  const subset = (row, id) => id === 'focus' ? row.tier === 'priority' || row.tier === 'review' : row.tier === id;
  for (const btn of byId('tiers').querySelectorAll('button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.tier === tier));
    btn.querySelector('span').textContent = loaded ? String(items.filter(r => subset(r, btn.dataset.tier)).length) : '';
  }
  filtered = items.filter(row => subset(row,tier));
  const displayed = filtered.slice(0,limit), container = byId('rows');
  container.replaceChildren(...displayed.map(caseCard));
  if (!displayed.length) container.append(node('p', loaded ? '這份清單中沒有符合目前篩選的案件。' : '尚未載入公告。','empty'));
  byId('count').textContent = loaded ? description + ' ｜ 顯示 ' + displayed.length + ' / ' + filtered.length + ' 案' : '';
  byId('more-wrap').hidden = filtered.length <= limit;
  byId('export-btn').disabled = !filtered.length;
}

byId('tiers').onclick = event => {
  const button = event.target.closest('button[data-tier]');
  if (button) { tier = button.dataset.tier; limit = perPage; render(); }
};
for (const id of ['search','validity']) byId(id).addEventListener('input', () => { limit = perPage; render(); });
byId('more').onclick = () => { limit += perPage; render(); };
byId('export-btn').onclick = () => {
  const blob = new Blob([csvFor(filtered)], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), a = node('a');
  a.href = url; a.download = '招標追蹤-' + taipeiDay() + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

byId('paste').addEventListener('input', () => { pastedTable = null; });
byId('paste').addEventListener('paste', event => {
  const html = event.clipboardData?.getData('text/html');
  if (!html) return;
  // Read table text in an inert template; no remote HTML enters the page.
  const template = document.createElement('template'); template.innerHTML = html;
  for (const table of template.content.querySelectorAll('table')) {
    const rows = [...table.rows].map(tr => [...tr.cells].map(td => td.textContent.trim()));
    const start = rows.findIndex(cells => cells.some(value => /^(標案名稱|標案案名|採購名稱|案名)$/.test(value)));
    if (start < 0) continue;
    const values = rows.slice(start);
    const hasLink = values[0].some(v => /官方連結|官方公告|來源網址|公告連結/.test(v));
    if (!hasLink) {
      values[0].push('官方連結');
      [...table.rows].slice(start+1).forEach((tr,i) => values[i+1].push(
        [...tr.querySelectorAll('a[href]')].map(a => officialUrl(a.getAttribute('href'))).find(Boolean) || ''));
    }
    event.preventDefault(); pastedTable = values;
    byId('paste').value = values.map(line => line.join('\t')).join('\n'); return;
  }
});
byId('import-btn').onclick = () => importRows(pastedTable || byId('paste').value);
byId('file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let input;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) input = new TextDecoder('utf-16le').decode(bytes);
    else {
      try { input = new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
      catch { input = new TextDecoder('big5').decode(bytes); }
    }
    importRows(input);
  } catch { status('無法讀取檔案，可直接從試算表複製並貼上清單。',true); }
  event.target.value = '';
};
function importRows(input) {
  try {
    const {rows, invalid} = importTable(input);
    if (activeQuery) { activeQuery.abort(); activeQuery = null; byId('fetch-btn').disabled = false; byId('cancel-btn').hidden = true; }
    const days = rows.map(row => row.day).sort();
    const info = '匯入清單 · ' + days[0] + (days[0] === days.at(-1) ? '' : ' 至 ' + days.at(-1)) + ' · ' + rows.length + ' 則公告' + (invalid ? '，另有 ' + invalid + ' 列缺資料未匯入' : '');
    lastLiveAt = 0; replace(rows,info); status(info + '。僅涵蓋這份清單。',!!invalid);
  } catch (error) { status(error.message,true); }
}
byId('day').value = byId('day').max = taipeiDay();
try {
  const last = JSON.parse(localStorage.getItem(cacheKey) || 'null');
  if (last?.notices?.length && last.description && last.savedAt && last.notices.every(r => typeof r.title === 'string' && typeof r.filename === 'string')) {
    notices = last.notices.map(r => ({...r, official:officialUrl(r.official)})); description = last.description; loaded = true;
    lastLiveAt = Number(last.lastLiveAt) || 0;
    status('顯示此裝置上次的清單（' + taipeiDay(new Date(last.savedAt)) + ' 儲存）。可按「讀取公告」更新。');
  }
} catch { /* A missing or outdated saved view never prevents a fresh search. */ }
render();
const queryDay = new URLSearchParams(location.search).get('date');
if (queryDay && dateText(queryDay) === queryDay && queryDay <= taipeiDay()) {
  byId('day').value = queryDay;
  byId('query').requestSubmit();
} else if (!lastLiveAt || taipeiDay(new Date(lastLiveAt)) !== taipeiDay() || Date.now() - lastLiveAt > 20 * 60000) {
  byId('query').requestSubmit();
}
