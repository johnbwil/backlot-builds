// ══════════════════════════════════════════════════════════════════
// BackLot Builds — ADU Intent Engine v2
// LA City Building Permits dataset: pi9x-tg5x (Issued 2020-Present)
// PUBLIC data, no auth required, daily updates
// ══════════════════════════════════════════════════════════════════

const https = require('https');
const LA_PERMITS_API = 'https://data.lacity.org/resource/pi9x-tg5x.json';

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'BackLotBuilds/1.0', 'Accept': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error('JSON parse failed: HTTP ' + res.statusCode + ' — ' + body.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function daysSince(dateStr) {
  if(!dateStr) return 99999;
  const d = new Date(dateStr);
  if(isNaN(d.getTime())) return 99999;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function isAduRelated(p) {
  const useDesc = (p.use_desc || '').toLowerCase();
  const workDesc = (p.work_desc || '').toLowerCase();

  if(useDesc.includes('accessory dwelling') || useDesc.includes('adu')) return { match: true, kind: 'adu_native' };
  if(p.adu_changed && p.adu_changed !== '0' && p.adu_changed !== 0) return { match: true, kind: 'adu_changed' };
  if(p.junior_adu && p.junior_adu !== '0' && p.junior_adu !== 0) return { match: true, kind: 'jadu_flag' };

  const aduKw = ['adu','accessory dwelling','jadu','junior adu','granny flat','in-law','casita','guest house','guesthouse','second unit','garage conversion','convert garage','garage to dwelling','backyard cottage'];
  for(const kw of aduKw) {
    if(workDesc.includes(kw)) return { match: true, kind: 'work_desc_match', keyword: kw };
  }
  return { match: false };
}

function scorePermit(p) {
  const adu = isAduRelated(p);
  if(!adu.match) return null;

  const status = (p.status_desc || '').toLowerCase();
  const issueDate = p.issue_date || p.submitted_date || p.status_date;
  const days = daysSince(issueDate);
  const workDesc = (p.work_desc || '').toLowerCase();

  let score = 0;
  const signals = [];

  // Skip finaled permits unless very recent
  if((status.includes('finaled') || status.includes('cofo')) && days > 30) return null;

  // Recency scoring
  if(days <= 30) { score += 100; signals.push({ type:'recent_permit', label:'Permit pulled <30 days ago', strength:100 }); }
  else if(days <= 90) { score += 80; signals.push({ type:'recent_permit', label:'Permit pulled <90 days ago', strength:80 }); }
  else if(days <= 180) { score += 55; signals.push({ type:'recent_permit', label:'Permit pulled <6 months ago', strength:55 }); }
  else if(days <= 365) { score += 30; signals.push({ type:'permit_year', label:'Permit pulled within last year', strength:30 }); }

  // Stage signals
  if(status.includes('plan check') || status.includes('submitted') || status.includes('intake')) {
    score += 50; signals.push({ type:'plan_check', label:'In plan check — early stage', strength:50 });
  }
  if(status.includes('issued') && !status.includes('finaled')) {
    score += 60; signals.push({ type:'issued_active', label:'Permit issued, build in progress', strength:60 });
  }
  if(status.includes('expired') || status.includes('void') || status.includes('cancelled') || status.includes('withdrawn')) {
    score += 90; signals.push({ type:'stalled_permit', label:'⚠ Stalled/expired — owner stuck', strength:90 });
  }
  if((status.includes('finaled') || status.includes('cofo')) && days <= 30) {
    score += 15; signals.push({ type:'just_completed', label:'Just completed ADU — repeat potential', strength:15 });
  }

  // Type signals
  if(adu.kind === 'adu_native') signals.push({ type:'verified_adu', label:'Verified ADU permit', strength:0 });
  if(workDesc.includes('jadu') || workDesc.includes('junior')) signals.push({ type:'jadu', label:'Junior ADU project', strength:0 });
  if(workDesc.includes('garage') && (workDesc.includes('convert') || workDesc.includes('conversion'))) {
    score += 10; signals.push({ type:'garage_conversion', label:'Garage conversion', strength:10 });
  }

  return {
    permit_nbr: p.permit_nbr,
    address: p.primary_address, zip: p.zip_code,
    use_desc: p.use_desc, work_desc: p.work_desc,
    status: p.status_desc,
    issue_date: p.issue_date, submitted_date: p.submitted_date,
    valuation: p.valuation, square_footage: p.square_footage,
    zone: p.zone, apn: p.apn,
    lat: p.lat, lon: p.lon,
    days,
    score: Math.min(100, score),
    signals, detection: adu,
  };
}

async function searchByZip(zip, daysBack = 365) {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];
  const where = `zip_code='${zip}' AND issue_date > '${since}'`;
  const params = new URLSearchParams({
    $where: where,
    $select: 'permit_nbr,primary_address,zip_code,use_desc,permit_type,permit_sub_type,work_desc,submitted_date,issue_date,status_desc,status_date,valuation,square_footage,zone,apn,lat,lon,adu_changed,junior_adu',
    $limit: '2000',
    $order: 'issue_date DESC',
  });
  const url = LA_PERMITS_API + '?' + params.toString();
  console.log('Querying:', url);
  const data = await get(url);
  return Array.isArray(data) ? data : [];
}

async function searchByAddress(address, zip) {
  if(!address) return [];
  const clean = address.toUpperCase().replace(/[,.]/g,'').trim();
  let where = `upper(primary_address) like '${clean}%'`;
  if(zip) where = `zip_code='${zip}' AND ` + where;
  const params = new URLSearchParams({ $where: where, $limit: '50', $order: 'issue_date DESC' });
  try { return await get(LA_PERMITS_API + '?' + params.toString()); }
  catch(e) { console.error('Address search error:', e.message); return []; }
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if(event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const p = event.queryStringParameters || {};

  try {
    if(p.address) {
      const permits = await searchByAddress(p.address, p.zip);
      const scored = permits.map(scorePermit).filter(x => x !== null);
      scored.sort((a,b) => b.score - a.score);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true, mode:'address', address: p.address,
          intentScore: scored[0]?.score || 0,
          permitCount: permits.length, aduRelatedCount: scored.length,
          topPermit: scored[0] || null, allPermits: scored,
          signals: scored.flatMap(s => s.signals),
        })
      };
    }

    if(p.zip) {
      const zip = p.zip;
      const daysBack = parseInt(p.daysBack) || 365;
      const allPermits = await searchByZip(zip, daysBack);
      const aduPermits = allPermits.map(scorePermit).filter(x => x !== null);
      console.log(`ZIP ${zip}: ${allPermits.length} total, ${aduPermits.length} ADU-related`);

      const byAddress = {};
      for(const s of aduPermits) {
        const key = (s.address || 'UNKNOWN').trim();
        if(!byAddress[key]) {
          byAddress[key] = {
            address: key, city: 'Los Angeles', zip: s.zip,
            apn: s.apn, lat: s.lat, lon: s.lon,
            intentScore: s.score,
            permits: [s], signals: [...s.signals],
            topPermit: s, valuation: s.valuation,
          };
        } else {
          byAddress[key].permits.push(s);
          byAddress[key].signals.push(...s.signals);
          if(s.score > byAddress[key].intentScore) {
            byAddress[key].intentScore = s.score;
            byAddress[key].topPermit = s;
          }
        }
      }

      // Dedupe signals per address
      for(const addr of Object.values(byAddress)) {
        const seen = new Map();
        for(const sig of addr.signals) {
          const existing = seen.get(sig.type);
          if(!existing || (sig.strength || 0) > (existing.strength || 0)) seen.set(sig.type, sig);
        }
        addr.signals = Array.from(seen.values());
      }

      const intentLeads = Object.values(byAddress)
        .map(lead => ({ ...lead, intentScore: Math.min(100, lead.intentScore) }))
        .sort((a,b) => b.intentScore - a.intentScore);

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true, mode:'zip', zip,
          totalPermitsScanned: allPermits.length,
          aduIntentLeads: intentLeads.length,
          leads: intentLeads,
        })
      };
    }

    return { statusCode:400, headers, body: JSON.stringify({ ok:false, error:'Provide ?address=... or ?zip=...' }) };
  } catch(err) {
    console.error('Handler error:', err);
    return { statusCode:500, headers, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
