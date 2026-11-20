// Public notices checked against the procuring agency when absent from the date feed.
const verified = [{
  day: '2026-11-20', unit: '3.92.34', org: '國立宜蘭大學', job: 'A11511060301',
  title: '環境工程學系「高靈敏螢光分子檢測平台1台」',
  type: '公開取得電子報價單', category: '財物類 482',
  deadline: '2026-11-27 13:30', budget: '750000',
  filename: 'verified-71392762-01', items: '', dept: '',
  official: 'https://web.pcc.gov.tw/tps/QueryTender/query/searchTenderDetail?pkPmsMain=NzEzOTI3NjI=',
  fromOfficial: true
}];

export function reconcileNotices(rows, days) {
  const combined = rows.slice();
  let added = 0;
  for (const notice of verified) {
    if (!days.includes(notice.day)) continue;
    const sameDay = rows.filter(r => r.job === notice.job && r.day === notice.day &&
      (r.unit ? r.unit === notice.unit : r.org === notice.org));
    if (!sameDay.length) {
      combined.push(notice);
      added++;
    } else if (sameDay.length === 1) {
      const row = sameDay[0];
      // Fill blanks only on the matching original invitation. Amendments and closures stand alone.
      if (row.title === notice.title && !/更正|撤|停|決標|流標|廢標|補充|延期|重招/.test(row.type) &&
          row.type.includes(notice.type)) {
        combined[combined.indexOf(row)] = {
          ...row, official: row.official || notice.official, deadline: row.deadline || notice.deadline,
          budget: row.budget || notice.budget, category: row.category || notice.category
        };
      }
    }
  }
  return {rows: combined, added};
}

export function publicDateUrl(day) {
  const [year, month, date] = day.split('-').map(Number);
  const url = new URL('https://www.taiwanbuying.com.tw/Query_Dateaction.ASP');
  url.search = new URLSearchParams({yy: String(year - 1911), mm: String(month), dd: String(date)});
  return url.href;
}
