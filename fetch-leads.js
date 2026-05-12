// ══════════════════════════════════════════════════════════════════
// BackLot Builds — Lead Fetcher (Netlify Serverless Function)
// Runs SERVER-SIDE so no CORS restrictions apply
// Queries LA County public parcel data and returns scored ADU leads
// ══════════════════════════════════════════════════════════════════

const https = require('https');

// Neighborhood rent + transit data by ZIP
const ZIP_DATA = {
  '91401':{city:'Van Nuys',medRent:2200,transit:72},
  '91402':{city:'Panorama City',medRent:2100,transit:68},
  '91405':{city:'Van Nuys',medRent:2150,transit:70},
  '91406':{city:'Van Nuys',medRent:2200,transit:65},
  '91411':{city:'Van Nuys',medRent:2250,transit:68},
  '91324':{city:'Northridge',medRent:2400,transit:55},
  '91325':{city:'Northridge',medRent:2350,transit:52},
  '91326':{city:'Porter Ranch',medRent:2750,transit:38},
  '91303':{city:'Canoga Park',medRent:2200,transit:60},
  '91304':{city:'Canoga Park',medRent:2100,transit:58},
  '91311':{city:'Chatsworth',medRent:2350,transit:42},
  '91306':{city:'Winnetka',medRent:2150,transit:55},
  '91307':{city:'West Hills',medRent:2550,transit:40},
  '91335':{city:'Reseda',medRent:2100,transit:62},
  '91343':{city:'North Hills',medRent:2000,transit:58},
  '91344':{city:'Granada Hills',medRent:2450,transit:48},
  '91345':{city:'Mission Hills',medRent:2050,transit:55},
  '91340':{city:'San Fernando',medRent:1950,transit:60},
  '91342':{city:'Sylmar',medRent:2050,transit:52},
  '91331':{city:'Arleta',medRent:2000,transit:56},
  '91352':{city:'Sun Valley',medRent:2150,transit:62},
  '91601':{city:'North Hollywood',medRent:2550,transit:82},
  '91602':{city:'North Hollywood',medRent:2650,transit:80},
  '91603':{city:'North Hollywood',medRent:2400,transit:76},
  '91605':{city:'North Hollywood',medRent:2300,transit:74},
  '91606':{city:'North Hollywood',medRent:2450,transit:78},
  '91607':{city:'Valley Village',medRent:2700,transit:80},
  '91423':{city:'Sherman Oaks',medRent:2750,transit:66},
  '91403':{city:'Sherman Oaks',medRent:2700,transit:63},
  '91436':{city:'Encino',medRent:2850,transit:52},
  '91316':{city:'Encino',medRent:2800,transit:50},
  '91356':{city:'Tarzana',medRent:2650,transit:48},
  '91364':{city:'Woodland Hills',medRent:2750,transit:46},
  '91367':{city:'Woodland Hills',medRent:2700,transit:44},
  '91302':{city:'Calabasas',medRent:2950,transit:30},
  '90016':{city:'West Adams',medRent:2850,transit:78},
  '90018':{city:'West Adams',medRent:2800,transit:76},
  '90008':{city:'Baldwin Hills',medRent:2750,transit:72},
  '90043':{city:'Hyde Park',medRent:2650,transit:70},
  '90056':{city:'Ladera Heights',medRent:2900,transit:62},
  '90019':{city:'Mid-City',medRent:2850,transit:74},
  '90026':{city:'Silver Lake',medRent:3200,transit:80},
  '90039':{city:'Atwater Village',medRent:2900,transit:72},
  '90041':{city:'Eagle Rock',medRent:2800,transit:70},
  '90042':{city:'Highland Park',medRent:2650,transit:72},
  '90027':{city:'Los Feliz',medRent:3300,transit:78},
  '90004':{city:'Koreatown',medRent:2700,transit:85},
  '90005':{city:'Koreatown',medRent:2650,transit:84},
  '90020':{city:'Hancock Park',medRent:3100,transit:74},
  '90025':{city:'West LA',medRent:3250,transit:68},
  '90064':{city:'West LA',medRent:3150,transit:66},
  '90066':{city:'Mar Vista',medRent:3050,transit:62},
  '90230':{city:'Culver City',medRent:3100,transit:72},
  '90232':{city:'Culver City',medRent:3150,transit:75},
  '90034':{city:'Palms',medRent:2950,transit:70},
  '90035':{city:'Beverlywood',medRent:3000,transit:72},
  '90036':{city:'Fairfax',medRent:3100,transit:78},
  '90291':{city:'Venice',medRent:3400,transit:75},
  '90401':{city:'Santa Monica',medRent:3600,transit:82},
  '90405':{city:'Santa Monica',medRent:3400,transit:78},
  '90266':{city:'Manhattan Beach',medRent:3500,transit:58},
  '90277':{city:'Redondo Beach',medRent:2900,transit:58},
  '90250':{city:'Hawthorne',medRent:2500,transit:65},
  '90301':{city:'Inglewood',medRent:2400,transit:72},
  '91205':{city:'Glendale',medRent:2800,transit:70},
  '91206':{city:'Glendale',medRent:2850,transit:68},
  '91501':{city:'Burbank',medRent:2700,transit:65},
  '91504':{city:'Burbank',medRent:2650,transit:62},
  '91103':{city:'Pasadena',medRent:2700,transit:62},
  '91106':{city:'Pasadena',medRent:2750,transit:62},
  '90012':{city:'Downtown LA',medRent:2700,transit:92},
  '90015':{city:'Downtown LA',medRent:2700,transit:91},
  '90017':{city:'Downtown LA',medRent:2600,transit:92},
  '90021':{city:'Arts District',medRent:2800,transit:88},
};

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'BackLotBuilds/1.0', 'Accept': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error('JSON parse failed: ' + body.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function aduScore(lead) {
  let s = 0;
  const lot = lead.lotSqft || 5500;
  if(lot >= 9000) s+=20; else if(lot >= 7500) s+=17; else if(lot >= 6000) s+=13;
  else if(lot >= 5000) s+=9; else if(lot >= 4000) s+=5;
  const eq = lead.equity || 0;
  if(eq >= 700000) s+=20; else if(eq >= 500000) s+=17; else if(eq >= 350000) s+=13;
  else if(eq >= 200000) s+=8; else if(eq >= 100000) s+=4;
  const yrs = lead.yearsOwned || 0;
  if(yrs >= 30) s+=15; else if(yrs >= 20) s+=12; else if(yrs >= 15) s+=9;
  else if(yrs >= 10) s+=6; else if(yrs >= 5) s+=3;
  const rent = lead.neighborhoodRent || 2000;
  if(rent >= 3000) s+=15; else if(rent >= 2700) s+=12; else if(rent >= 2400) s+=9;
  else if(rent >= 2100) s+=6; else if(rent >= 1800) s+=3;
  s += 8; // R1 baseline zoning
  const tr = lead.transitScore || 55;
  if(tr >= 85) s+=10; else if(tr >= 70) s+=8; else if(tr >= 55) s+=6;
  else if(tr >= 40) s+=4; else s+=2;
  const hv = lead.homeValue || 0;
  if(hv >= 600000 && hv <= 1400000) s+=5; else if(hv >= 450000) s+=3;
  return Math.min(100, s);
}

function recommendADU(lot) {
  if(lot >= 8000) return '2BR New Construction';
  if(lot >= 7000) return 'Detached 1BD/1BA';
  if(lot >= 5500) return 'Detached Studio';
  if(lot >= 4500) return 'Garage Conversion';
  return 'Junior ADU (JADU)';
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

  const p         = event.queryStringParameters || {};
  const minEquity = parseInt(p.minEquity) || 300000;
  const minYears  = parseInt(p.minYears)  || 15;
  const count     = Math.min(parseInt(p.count) || 100, 500);
  const zips      = (p.zips || '91401,91601,91602').split(',').map(z => z.trim()).filter(Boolean);

  if(!zips.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:'No ZIPs provided' }) };
  }

  const currentYear  = new Date().getFullYear();
  const minLandVal   = Math.round(minEquity * 0.22);
  const SODA         = 'https://data.lacounty.gov/resource/9trm-uz8i.json';

  let allRecords = [];
  const batches  = [];
  for(let i = 0; i < zips.length; i += 6) batches.push(zips.slice(i, i + 6));

  // Try SODA API first (runs server-side — no CORS restriction)
  for(const batch of batches) {
    if(allRecords.length >= count * 3) break;
    const zipIn = batch.map(z => "'" + z + "'").join(',');
    const where = encodeURIComponent(
      "(usecode='0100' OR usecode='0101' OR usecode='0102')" +
      " AND situszip IN(" + zipIn + ")" +
      " AND roll_landv >= " + minLandVal
    );
    const url = SODA +
      '?$where=' + where +
      '&$limit=300' +
      '&$order=roll_landv+DESC' +
      '&$select=ain,situsaddre,situscity,situszip,usecode,roll_landv,roll_impva,sqftmain1,yearbuilt1,effectivey';

    try {
      const data = await get(url);
      if(Array.isArray(data)) {
        allRecords = allRecords.concat(data.map(r => ({ ...r, _bzip: batch[0] })));
        console.log(`Batch ${batch.join(',')}: ${data.length} records`);
      } else {
        console.warn('Unexpected SODA response:', JSON.stringify(data).slice(0, 200));
      }
    } catch(e) {
      console.error('SODA error:', e.message);
    }
  }

  // Score and filter
  const leads    = [];
  const usedAINs = new Set();

  for(const r of allRecords) {
    if(leads.length >= count) break;

    const ain   = r.ain || (r.situsaddre + r.situszip);
    if(usedAINs.has(ain)) continue;
    usedAINs.add(ain);

    const landVal = parseFloat(r.roll_landv) || 0;
    const impVal  = parseFloat(r.roll_impva) || 0;
    if(landVal < 30000) continue;

    const homeVal = Math.round((landVal + impVal) * 1.18);
    if(homeVal < 280000) continue;

    const sqft       = parseFloat(r.sqftmain1) || 1400;
    const lotSqft    = Math.round(Math.max(4000, sqft * 3.6 + 800));
    const built      = parseInt(r.yearbuilt1) || 1965;
    const effYear    = parseInt(r.effectivey) || (built + 5);
    const yearsOwned = Math.max(1, currentYear - effYear);
    if(yearsOwned < minYears) continue;

    const zip  = (r.situszip || r._bzip || '').toString().trim().slice(0, 5);
    const zd   = ZIP_DATA[zip] || { city: (r.situscity||'Los Angeles').replace(/\s+CA\s*$/i,''), medRent: 2200, transit: 60 };
    const city = (r.situscity || zd.city || 'Los Angeles').replace(/\s+CA\s*$/i,'').trim();
    const addr = (r.situsaddre || '').toString().trim();
    if(!addr) continue;

    const purchaseEst  = homeVal * (0.40 + Math.min(yearsOwned, 30) / 30 * 0.40);
    const remainingMtg = Math.max(0, purchaseEst * 0.78 * Math.max(0, 1 - yearsOwned / 30));
    const equity       = Math.round(homeVal - remainingMtg);
    if(equity < minEquity) continue;

    const aduType   = recommendADU(lotSqft);
    const aduSqft   = aduType.includes('2BR') ? 700 : aduType.includes('1BD') ? 580 : aduType.includes('Studio') ? 460 : 390;
    const estRent   = aduType.includes('2BR') ? Math.round(zd.medRent * 0.92)
                    : aduType.includes('1BD') ? Math.round(zd.medRent * 0.78)
                    : aduType.includes('Studio') ? Math.round(zd.medRent * 0.65)
                    : Math.round(zd.medRent * 0.60);
    const buildCost = Math.round(aduSqft * (285 + Math.floor(Math.random() * 8) * 10));
    const grossYield = ((estRent * 12 / (buildCost + 25000)) * 100).toFixed(1);

    const lead = {
      ain: r.ain || '',
      name: 'Property Owner',
      address: addr.replace(/,.*$/, '').trim(),
      city, zip,
      homeValue:  homeVal,
      mortgage:   Math.round(remainingMtg),
      equity,
      hhIncome:   55000 + Math.floor(Math.random() * 45000),
      yearsOwned,
      lotSqft,
      backyardSqft: Math.round(lotSqft * 0.40),
      neighborhoodRent: zd.medRent,
      transitScore:     zd.transit,
      recentPermits: 0,
      zoning: 'R1',
      aduType, aduSqft, estRent, buildCost,
      valueAdded: aduType.includes('2BR') ? 270000 : aduType.includes('1BD') ? 200000 : 170000,
      propertyNote: 'Built ' + built + '. Lot ' + lotSqft.toLocaleString() + ' sqft. AIN: ' + (r.ain || '—') + '.',
      locationNote: city + ' — est. rent $' + zd.medRent.toLocaleString() + '/mo. Transit: ' + zd.transit + '.',
      feasibilityNote: grossYield + '% gross yield' + (lotSqft >= 7000 ? ' · Large lot ADU feasible' : '') + (yearsOwned >= 20 ? ' · Long-term owner' : ''),
      proposed:  false,
      addedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      _source:   'LA County Assessor (SODA API)',
    };

    lead.score = aduScore(lead);
    lead.tier  = lead.score >= 75 ? 'A' : lead.score >= 55 ? 'B' : 'C';
    leads.push(lead);
  }

  leads.sort((a, b) => b.score - a.score);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok:      true,
      count:   leads.length,
      queried: allRecords.length,
      leads,
    }),
  };
};
