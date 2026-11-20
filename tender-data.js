// Normalize OpenFun notices and tabular exports into the same case list.
const text = value => String(value ?? '').trim();
const flat = value => text(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
export const pcc = 'https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic';
export const api = 'https://pcc-api.openfun.app/api/';
export const tierLabels = {priority:'優先看', review:'待看明細', unclear:'其他待判', excluded:'明確無關'};

export function taipeiDay(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
}

export function dayOffset(day, offset) {
  const value = new Date(day + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

// Preserve date-only deadlines; a source that omits the time cannot establish
// whether bidding is still open on the deadline day.
export function dateText(value) {
  const s = text(value).normalize('NFKC').replace(/^民國\s*/, '');
  const m = s.match(/^(\d{2,4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?:日)?(?:[T\s]+(\d{1,2}):(\d{2}))?/)
    || s.match(/^(\d{4}|\d{3})(\d{2})(\d{2})$/);
  if (!m) return '';
  const year = Number(m[1]) + (m[1].length < 4 ? 1911 : 0);
  const day = [year, m[2].padStart(2,'0'), m[3].padStart(2,'0')].join('-');
  const test = new Date(day + 'T12:00:00Z');
  if (!Number.isFinite(test.getTime()) || test.toISOString().slice(0,10) !== day) return '';
  if (m[4] === undefined) return day;
  if (+m[4] >= 24 || +m[5] >= 60) return '';
  return day + ' ' + m[4].padStart(2,'0') + ':' + m[5];
}

export function officialUrl(value) {
  try {
    const url = new URL(text(value));
    if (url.hostname !== 'web.pcc.gov.tw' || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return '';
    url.protocol = 'https:';
    return url.href;
  } catch { return ''; }
}

function field(detail, names) {
  for (const [key, value] of Object.entries(detail)) {
    if (names.includes(key.trim().split(/[:：]/).at(-1)) && value != null && text(value)) return text(value);
  }
  return '';
}

export function normalize(record) {
  const brief = record.brief || {}, detail = record.detail || {};
  const pk = text(detail.pkPmsMain);
  return {
    title:text(brief.title), org:text(record.unit_name), unit:text(record.unit_id), job:text(record.job_number),
    day:dateText(record.date).slice(0,10), type:text(brief.type || detail.type),
    category:text(brief.category || field(detail, ['標的分類','採購性質'])),
    filename:text(record.filename), deadline:dateText(field(detail, ['截止投標','截止投標時間','截止收件時間','截止收件日期','截止投標日期'])),
    budget:field(detail, ['預算金額']) || text(record.budget_amount),
    dept:field(detail, ['單位名稱']) || text(record.dept_name),
    items:field(detail, ['採購標的之名稱及數量','採購標的之名稱或數量','標的名稱及數量','標的摘要','採購標的摘要']),
    official:officialUrl(detail.url) || (pk ? 'https://web.pcc.gov.tw/tps/QueryTender/query/searchTenderDetail?pkPmsMain=' + encodeURIComponent(pk) : '')
  };
}

function role(type) {
  if (/決標|流標|廢標|撤銷|撤回|取消招標|停止招標|暫停招標|已截止|已結案/.test(type)) return 'closed';
  if (/公開閱覽|公開徵求廠商提供參考|採購預告|招標前|財物出租|財物變賣|拒絕往來/.test(type)) return 'other';
  if (/招標|公開取得|報價單|公開評選|資格審查|邀標|競圖|更正公告|補充公告|延期公告/.test(type)) return 'opening';
  return 'other';
}

const products = [
  ['核酸定量／PCR', /(?:^|[^a-z])(?:dd|[dq]|rt[- ]?q?)?pcr(?:[^a-z]|$)|聚合[酶酵]素?連鎖|聚合酶鏈式|核酸定量|定量核酸|微滴式數位/iu],
  ['電泳／蛋白分析', /電泳|西方(?:墨點|轉漬|轉印)|蛋白(?:質)?轉(?:漬|印)|化學(?:冷光|發光)影像|western\s*blot|chemidoc|gel\s*doc/iu],
  ['顯微影像', /顯微鏡|共[軛聚]焦|共焦顯微|活細胞.{0,8}(?:成像|影像)|顯微影像|axiocam|microscop/iu],
  ['細胞分析與分選', /流[式氏]細胞|流式分析儀|細胞.{0,5}(?:分選|分選儀|分選機|計數器)|flow\s*cytomet|cell\s*sort/iu],
  ['移液與液體處理', /移液|分注|分液工作站|液體(?:處理|操作)工作站|自動(?:化)?液體處理|吸管尖|吸(?:頭|嘴).{0,5}移液|pipett|grip\s*tips?/iu],
  ['層析／分離分析', /層析儀|層析系統|層析(?:管柱|樹脂)|色譜|蛋白(?:質)?純化|(?:^|[^a-z])(?:u?hplc|fplc|lc[-–/]?ms|gc[-–/]?ms)(?:[^a-z]|$)/iu],
  ['厭氧培養', /(?:厭氧|低氧).{0,6}(?:操作台|工作站|培養系統|培養箱)/u],
  ['品牌或產品系列', /bio[-\s]?rad|zeiss|cytek|shimadzu|nichiryo|nanocellect|don\s*whitley|(?:^|[^a-z])integra(?:[^a-z]|$)|蔡司|島津|viaflo|assist\s*plus/iu]
];
const possible = /實驗室|試劑|檢驗(?:科|用|儀器|設備|耗材)|醫事檢驗|實驗.{0,5}(?:耗材|儀器|設備)|研究(?:儀器|用設備)|醫療(?:儀器|設備)|生物科技|生物技術|分子生物|細胞|螢光|蛋白|核酸|檢測儀|影像分析|光譜|分光|光度計|病理科/u;
const researchBuyer = /大學|學院|醫院|衛生|疾病管制|研究|試驗|實驗|檢驗|防疫|畜產|種苗/u;
const genericEquipment = /(?:儀器|設備|耗材|醫材|衛材|器材)(?:集中採購|採購|乙批|一批|等?[共計]?[一二三四五六七八九十\d]+[項組套類批]|$)/u;
const clinicalMicroscope = /(?:手術|開刀房|眼科).{0,12}顯微鏡|顯微鏡.{0,8}(?:手術|開刀房)/u;
const unrelated = /辦公(?:桌椅|家具|傢俱)|課桌椅|廚房餐具|團膳|午餐食材|膳食|伙食|便當|食用米|制服|球衣|運動服|軍服|防彈背心|影印紙|衛生紙|公務(?:汽車|機車|車輛|車租賃)|巡邏車|消防車|汽車輪胎|道路瀝青|道路標線|垃圾車|資源回收車|柴油採購|航空機票|禮券|紅包袋|路燈燈具|體育器材|籃球架|交通號誌|監視錄影系統|印表機碳粉|列車煞車|噴水推進器|(?:船舶|船艇|巡防艇|艦艇).{0,10}(?:塢修|大修)|教科(?:用)?書|營養午餐|冷氣機汰換|割草機|遊覽車租賃/u;

export function classify(row) {
  const label = [row.title, row.items].join(' ').normalize('NFKC');
  const matches = products.filter(([, pattern]) => pattern.test(label)).map(([name]) => name);
  if (clinicalMicroscope.test(label) && matches.every(name => name === '顯微影像' || name === '品牌或產品系列')) {
    return {tier:'review', why:'手術用顯微設備，請確認醫療產品線與服務授權', rank:1};
  }
  if (matches.length) return {tier:'priority', why:matches.join('、'), rank:0};
  if (/(?:[螢熒荧]光|fluorescen\w*).{0,14}(?:分子|量測|檢測|偵測|定量|平台|分析|光譜|儀器|detect|analy|spectr)|(?:分子|molecular)\s*(?:檢測|偵測|定量|檢驗|detection|assay|sensing)/iu.test(label)) {
    return {tier:'review', why:'分子檢測或螢光量測，請核對偵測原理與儀器規格', rank:1};
  }
  if (possible.test(label)) return {tier:'review', why:'可能包含實驗室品項，請查看分項或規格', rank:1};
  if (unrelated.test(label)) return {tier:'excluded', why:'標的用途明確，與實驗室產品線關聯低', rank:4};
  if (researchBuyer.test([row.org,row.dept].join(' ')) && genericEquipment.test(label.trim())) {
    return {tier:'review', why:'採購單位可能使用實驗室設備，案名未列具體品項', rank:2};
  }
  return {tier:'unclear', why:'案名沒有足夠線索，保留供查找', rank:3};
}

export function caseKey(row) {
  return JSON.stringify([row.unit || row.org, row.job || row.filename || [row.title, row.day].join('/')]);
}

export function versionKey(row) {
  return JSON.stringify([caseKey(row), row.day, row.filename || [row.type, row.title, row.deadline].join('/')]);
}

export function deadlineState(row, now) {
  if (row.mixed) return '狀態待確認';
  if (!row.deadline) return '期限待查';
  if (row.deadline.length === 10) {
    const today = taipeiDay(now);
    if (row.deadline === today) return '今日截止，時間待查';
    return row.deadline < today ? '已截止' : '未截止';
  }
  return Date.parse(row.deadline.replace(' ','T') + ':00+08:00') <= now.getTime() ? '已截止' : '未截止';
}

// Match by agency and case number. A same-day cancellation and invitation can
// belong to different lots, so neither is proof of the whole case's status.
export function casesFrom(notices, now = new Date()) {
  const groups = new Map();
  for (const row of notices) {
    if (!row.title || !row.day || role(row.type) === 'other') continue;
    const key = caseKey(row);
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(versionKey(row), row);
  }
  const cases = [];
  for (const [key, group] of groups) {
    const versions = [...group.values()].sort((a,b) => b.day.localeCompare(a.day) || Number(/更正|補充|延期/.test(b.type)) - Number(/更正|補充|延期/.test(a.type)) || b.filename.localeCompare(a.filename, 'en', {numeric:true}));
    const latestDay = versions[0].day;
    const latest = versions.filter(r => r.day === latestDay);
    const row = latest.find(r => role(r.type) === 'opening');
    if (!row) continue;
    if (/工程|勞務/.test(row.category) && !/財物/.test(row.category)) continue;
    const mixed = latest.some(r => role(r.type) === 'closed' || (r !== row && r.deadline && row.deadline && row.deadline !== r.deadline));
    const item = {...row, key, mixed, versions:versions.length};
    Object.assign(item, classify(item), {state:deadlineState(item, now)});
    cases.push(item);
  }
  return cases.sort((a,b) => a.rank-b.rank || (a.deadline || '9999').localeCompare(b.deadline || '9999') || b.day.localeCompare(a.day) || a.title.localeCompare(b.title,'zh-Hant'));
}

const columns = {
  title:['標案名稱','標案案名','標案標題','採購名稱','案名','案件名稱','品名','title'],
  org:['機關名稱','招標機關','機關','採購機關','採購單位','unit_name'],
  job:['標案案號','案號','採購案號','job_number'], unit:['機關代碼','unit_id'],
  type:['公告類型','公告種類','公告類別','狀態','招標方式','type'],
  category:['採購性質','標的分類','標案分類','採購類別','category'],
  day:['公告日期','招標日期','招標公告日期','公告日','date'],
  deadline:['截止投標','截止投標時間','截止投標日期','截止收件日期','截止日期','截標時間','投標截止','投標截止時間','deadline'],
  budget:['預算金額','預算','budget'], official:['官方公告','官方連結','來源網址','公告連結','連結','url'],
  items:['採購標的摘要','標的摘要','品項','items'], dept:['使用單位','單位名稱','dept']
};
const cleanHead = s => flat(s).replace(/[\s\uFEFF]/g,'').replace(/[（(](?:元|新臺幣|新台幣)[）)]/g,'');

function parseTable(input) {
  const csv = input.replace(/^\uFEFF/,'').trim(), header = csv.split(/\r?\n/)[0];
  const delim = header.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      if (quoted && csv[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || !cell) quoted = !quoted;
      else cell += ch;
    } else if (!quoted && ch === delim) { row.push(cell); cell = ''; }
    else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && csv[i+1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (quoted) throw Error('CSV 引號不完整，請重新匯出。');
  row.push(cell); rows.push(row);
  return rows;
}

export function importTable(input) {
  const [header = [], ...lines] = typeof input === 'string' ? parseTable(input) : input;
  const fields = header.map(cleanHead);
  const indexes = Object.fromEntries(Object.entries(columns).map(([key, names]) => [key, names.map(n => fields.indexOf(cleanHead(n))).find(i => i >= 0) ?? -1]));
  if ([indexes.title, indexes.org, indexes.day].includes(-1)) throw Error('清單需含「標案名稱、機關名稱、公告日期」三個表頭。');
  const rows = [];
  let invalid = 0;
  for (const values of lines) {
    if (!values.some(value => text(value))) continue;
    const item = Object.fromEntries(Object.entries(indexes).map(([k,i]) => [k, text(values[i])]));
    const day = dateText(item.day).slice(0,10);
    if (!item.title || !item.org || !day) { invalid++; continue; }
    rows.push({...item, day, type:item.type || '招標公告（匯入）', deadline:dateText(item.deadline), official:officialUrl(item.official), filename:''});
  }
  if (!rows.length) throw Error('沒有可辨識的公告資料，請檢查標案名稱、機關和日期。');
  return {rows, invalid};
}

export function csvFor(rows) {
  const fields = ['day','org','job','title','type','category','deadline','budget','why','official'];
  const escape = value => {
    let str = text(value);
    if (/^[=+@\-\t\r]/.test(str)) str = "'" + str;
    return '"' + str.replace(/"/g,'""') + '"';
  };
  const header = ['公告日期','機關名稱','標案案號','標案名稱','公告類型','標的分類','截止投標','預算金額','篩選依據','官方連結','相關程度'];
  return '\uFEFF' + [header, ...rows.map(row => [...fields.map(k => row[k]), tierLabels[row.tier]])].map(cells => cells.map(escape).join(',')).join('\r\n');
}
