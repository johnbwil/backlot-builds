// ══════════════════════════════════════════════════════════════════
// BackLot Builds — ADU Intent Engine
// Scans LA City building permits for active ADU intent signals
// Source: data.lacity.org (LA City Building & Safety - PUBLIC DATA)
// Free, legal, no auth required
// ══════════════════════════════════════════════════════════════════

const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'BackLotBuilds/1.0', 'Accept': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error('JSON parse failed: ' + body.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ADU-related permit work descriptions (case-insensitive matching)
const ADU_KEYWORDS = [
  'adu','accessory dwelling','accessory dwell','jadu','junior adu','granny flat','in-law','in law','casita','guest house','guesthouse','second unit',
  'garage conversion','converting garage','convert garage','convert detached garage','garage to dwelling',
  'detached unit','rear unit','backyard cottage','backyard dwelling',
];

const PLAN_CHECK_KEYWORDS = ['plan check','plan-check','plancheck','zoning review','design review'];
const CORRECTION_KEYWORDS = ['correction','plan correction','submittal correction','revisions required'];

function matchesAny(text, keywords) {
  if(!text) return false;
  const lc = text.toLowerCase();
  return keywords.some(k => lc.includes(k));
}

function daysSince(dateStr) {
  if(!dateStr) return 99999;
  const d = new Date(dateStr);
  if(isNaN(d.getTime())) return 99999;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// Score a single permit record against ADU intent rubric
function scorePermit(permit) {
  const status = (permit.status_desc || permit.status || '').toLowerCase();
  const workDesc = permit.use_desc || permit.work_desc || permit.permit_sub_type || '';
  const permitType = permit.permit_type || '';
  const issueDate = permit.issue_date || permit.status_date || permit.application_date;
  const isStalled = status.includes('expired') || status.includes('void') || status.includes('cancelled') || status.includes('withdrawn');
  const hasCorrection = matchesAny(workDesc + ' ' + status, CORRECTION_KEYWORDS);
  const contractor = permit.contractors_business_name || permit.contractor || '';
  const noContractor = !contractor || contractor.toLowerCase().includes('owner') || contractor.trim() === '';

  let score = 0;
  const signals = [];

  // Detect if this is an ADU-related permit
  const isAdu = matchesAny(workDesc, ADU_KEYWORDS) || matchesAny(permitType, ADU_KEYWORDS);
  const isPlanCheck = matchesAny(workDesc + ' ' + permitType, PLAN_CHECK_KEYWORDS);

  if(!isAdu && !isPlanCheck) return null; // Not ADU-related, skip

  const days = daysSince(issueDate);

  // Recency scoring
  if(days <= 30) {
    score += 100;
    signals.push({ type: 'recent_permit', label: 'Permit pulled <30 days ago', strength: 100 });
  } else if(days <= 90) {
    score += 80;
    signals.push({ type: 'recent_permit', label: 'Permit pulled <90 days ago', strength: 80 });
  } else if(days <= 180) {
    score += 50;
    signals.push({ type: 'recent_permit', label: 'Permit pulled <6 months ago', strength: 50 });
  } else if(days <= 365) {
    score += 25;
    signals.push({ type: 'permit_year', label: 'Permit pulled in past year', strength: 25 });
  }

  // Stalled = very high intent (they want to build but hit a snag — perfect time to call)
  if(isStalled) {
    score += 90;
    signals.push({ type: 'stalled_permit', label: 'Stalled/expired permit — owner may be stuck', strength: 90 });
  }

  // No contractor = DIY-curious, often need professional help
  if(noContractor && !isStalled) {
    score += 70;
    signals.push({ type: 'no_contractor', label: 'No contractor listed — may need build partner', strength: 70 });
  }

  // Correction = process pain
  if(hasCorrection) {
    score += 60;
    signals.push({ type: 'correction', label: 'Correction notice issued — owner stuck on revisions', strength: 60 });
  }

  // Plan check (early stage) = strong intent
  if(isPlanCheck && !isAdu) {
    score += 50;
    signals.push({ type: 'plan_check', label: 'Plan check in progress', strength: 50 });
  }

  return { permit, score, signals, days, status, workDesc, contractor };
}

// Build SoQL query for LA City permit dataset
// LA City building permits: yv23-pmwf is the resource ID for "Building and Safety Permit Information"
const LA_CITY_PERMITS_BASE = 'https://data.lacity.org/resource/nbyu-2ha9.json';

async function searchPermitsByAddress(address, city, zip) {
  // Try a few search strategies
  const cleaned = (address || '').toUpperCase().replace(/[,.]/g,'').trim();
  const streetMatch = cleaned.match(/^(\d+)\s+([\w\s]+?)(?:\s+(ST|AVE|BLVD|DR|RD|LN|PL|WAY|CT|CIR|TER)?)?$/i);

  if(!streetMatch) return [];

  const houseNum = streetMatch[1];
  const streetName = streetMatch[2].trim();

  // SoQL where clause - search for permits matching address number and street
  const whereClauses = [
    `address_start='${houseNum}' AND upper(street_name) like '${streetName.toUpperCase()}%'`,
    `address_start='${houseNum}'`,
  ];

  for(const where of whereClauses) {
    const params = new URLSearchParams({
      $where: where,
      $limit: '50',
      $order: 'issue_date DESC',
    });
    const url = LA_CITY_PERMITS_BASE + '?' + params.toString();
    try {
      const data = await get(url);
      if(Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch(e) {
      console.error('Permit search error:', e.message);
    }
  }
  return [];
}

// Bulk search by ZIP code (used for proactive scanning)
async function searchPermitsByZip(zip, daysBack = 180) {
  const since = new Date(Date.now() - daysBack * 24*60*60*1000).toISOString().split('T')[0];
  const params = new URLSearchParams({
    $where: `zip_code='${zip}' AND issue_date > '${since}'`,
    $limit: '500',
    $order: 'issue_date DESC',
  });
  const url = LA_CITY_PERMITS_BASE + '?' + params.toString();
  try {
    const data = await get(url);
    return Array.isArray(data) ? data : [];
  } catch(e) {
    console.error('ZIP permit search error:', e.message);
    return [];
  }
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if(event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const p = event.queryStringParameters || {};

  // Mode 1: scan permits for a specific address
  if(p.address) {
    try {
      const permits = await searchPermitsByAddress(p.address, p.city || '', p.zip || '');
      const scored = permits.map(scorePermit).filter(x => x !== null);
      scored.sort((a,b) => b.score - a.score);

      const topScore = scored.length > 0 ? scored[0].score : 0;
      const intentScore = Math.min(100, topScore);
      const allSignals = scored.flatMap(s => s.signals);

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true,
          address: p.address,
          intentScore,
          permitCount: permits.length,
          aduRelatedCount: scored.length,
          topPermit: scored[0] || null,
          allPermits: scored,
          signals: allSignals,
        })
      };
    } catch(err) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
    }
  }

  // Mode 2: scan permits for an entire ZIP (proactive lead discovery)
  if(p.zip) {
    try {
      const permits = await searchPermitsByZip(p.zip, parseInt(p.daysBack) || 180);
      const scored = permits.map(scorePermit).filter(x => x !== null && x.score >= 50);
      scored.sort((a,b) => b.score - a.score);

      // Group by address to get unique properties
      const byAddress = {};
      for(const s of scored) {
        const addr = (s.permit.address_start || '') + ' ' + (s.permit.street_name || '') + ' ' + (s.permit.street_suffix || '');
        const key = addr.trim();
        if(!byAddress[key]) {
          byAddress[key] = {
            address: key,
            city: 'Los Angeles',
            zip: p.zip,
            intentScore: s.score,
            permits: [s],
            signals: s.signals,
            topPermit: s,
          };
        } else {
          byAddress[key].permits.push(s);
          byAddress[key].signals = [...byAddress[key].signals, ...s.signals];
          if(s.score > byAddress[key].intentScore) {
            byAddress[key].intentScore = s.score;
            byAddress[key].topPermit = s;
          }
        }
      }

      const intentLeads = Object.values(byAddress)
        .map(lead => ({ ...lead, intentScore: Math.min(100, lead.intentScore) }))
        .sort((a,b) => b.intentScore - a.intentScore);

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true,
          zip: p.zip,
          totalPermitsScanned: permits.length,
          aduIntentLeads: intentLeads.length,
          leads: intentLeads,
        })
      };
    } catch(err) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
    }
  }

  return {
    statusCode: 400, headers,
    body: JSON.stringify({ ok: false, error: 'Provide either ?address=... or ?zip=... parameter' })
  };
};
