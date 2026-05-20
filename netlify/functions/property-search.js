// ══════════════════════════════════════════════════════════════════
// BackLot Builds — Property Search v2
// LA County Assessor Parcel data — CORRECTED field schema
// Queries by SitusHouseNo + SitusStreet (most reliable), pulls REAL
// assessed values (Roll_LandValue, Roll_ImpValue) for accurate equity.
// ══════════════════════════════════════════════════════════════════

const https = require('https');

const PARCEL_URL = 'https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0/query';

const ZIP_DATA = {
  '91401':{city:'Van Nuys',medRent:2200,transit:72},'91402':{city:'Panorama City',medRent:2100,transit:68},
  '91405':{city:'Van Nuys',medRent:2150,transit:70},'91406':{city:'Van Nuys',medRent:2200,transit:65},
  '91411':{city:'Van Nuys',medRent:2250,transit:68},'91324':{city:'Northridge',medRent:2400,transit:55},
  '91325':{city:'Northridge',medRent:2350,transit:52},'91326':{city:'Porter Ranch',medRent:2750,transit:38},
  '91303':{city:'Canoga Park',medRent:2200,transit:60},'91304':{city:'Canoga Park',medRent:2100,transit:58},
  '91311':{city:'Chatsworth',medRent:2350,transit:42},'91306':{city:'Winnetka',medRent:2150,transit:55},
  '91307':{city:'West Hills',medRent:2550,transit:40},'91335':{city:'Reseda',medRent:2100,transit:62},
  '91343':{city:'North Hills',medRent:2000,transit:58},'91344':{city:'Granada Hills',medRent:2450,transit:48},
  '91345':{city:'Mission Hills',medRent:2050,transit:55},'91340':{city:'San Fernando',medRent:1950,transit:60},
  '91342':{city:'Sylmar',medRent:2050,transit:52},'91331':{city:'Arleta',medRent:2000,transit:56},
  '91352':{city:'Sun Valley',medRent:2150,transit:62},'91601':{city:'North Hollywood',medRent:2550,transit:82},
  '91602':{city:'North Hollywood',medRent:2650,transit:80},'91605':{city:'North Hollywood',medRent:2300,transit:74},
  '91606':{city:'North Hollywood',medRent:2450,transit:78},'91607':{city:'Valley Village',medRent:2700,transit:80},
  '91604':{city:'Studio City',medRent:2900,transit:70},'91423':{city:'Sherman Oaks',medRent:2750,transit:66},
  '91403':{city:'Sherman Oaks',medRent:2700,transit:63},'91436':{city:'Encino',medRent:2850,transit:52},
  '91316':{city:'Encino',medRent:2800,transit:50},'91356':{city:'Tarzana',medRent:2650,transit:48},
  '91364':{city:'Woodland Hills',medRent:2750,transit:46},'91367':{city:'Woodland Hills',medRent:2700,transit:44},
  '91302':{city:'Calabasas',medRent:2950,transit:30},'90016':{city:'West Adams',medRent:2850,transit:78},
  '90018':{city:'West Adams',medRent:2800,transit:76},'90008':{city:'Baldwin Hills',medRent:2750,transit:72},
  '90043':{city:'Hyde Park',medRent:2650,transit:70},'90019':{city:'Mid-City',medRent:2850,transit:74},
  '90026':{city:'Silver Lake',medRent:3200,transit:80},'90039':{city:'Atwater Village',medRent:2900,transit:72},
  '90041':{city:'Eagle Rock',medRent:2800,transit:70},'90042':{city:'Highland Park',medRent:2650,transit:72},
  '90027':{city:'Los Feliz',medRent:3300,transit:78},'90004':{city:'Koreatown',medRent:2700,transit:85},
  '90005':{city:'Koreatown',medRent:2650,transit:84},'90020':{city:'Hancock Park',medRent:3100,transit:74},
  '90025':{city:'West LA',medRent:3250,transit:68},'90064':{city:'West LA',medRent:3150,transit:66},
  '90066':{city:'Mar Vista',medRent:3050,transit:62},'90230':{city:'Culver City',medRent:3100,transit:72},
  '90232':{city:'Culver City',medRent:3150,transit:75},'90034':{city:'Palms',medRent:2950,transit:70},
  '90035':{city:'Beverlywood',medRent:3000,transit:72},'90036':{city:'Fairfax',medRent:3100,transit:78},
  '90291':{city:'Venice',medRent:3400,transit:75},'91205':{city:'Glendale',medRent:2800,transit:70},
  '91206':{city:'Glendale',medRent:2850,transit:68},'91201':{city:'Glendale',medRent:2750,transit:72},
  '91501':{city:'Burbank',medRent:2700,transit:65},'91504':{city:'Burbank',medRent:2650,transit:62},
  '90042':{city:'Highland Park',medRent:2650,transit:72},
};

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'BackLotBuilds/1.0', 'Accept': 'application/json' } }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error('JSON parse failed: HTTP ' + res.statusCode + ' — ' + body.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Parse address into house number + street name + zip
function parseAddress(input) {
  let s = input.trim().toUpperCase();
  s = s.replace(/,?\s*(USA|US)$/i, '').trim();
  const zipMatch = s.match(/\b(9\d{4})\b/);
  const zip = zipMatch ? zipMatch[1] : '';
  if(zip) s = s.replace(zip, '').trim();
  s = s.replace(/,?\s*CA\.?\s*$/i, '').trim();
  s = s.replace(/,\s*$/, '').trim();

  // Strip city after comma if present
  const commaParts = s.split(',');
  let streetPart = commaParts[0].trim();

  // Extract leading house number
  const houseMatch = streetPart.match(/^(\d+)\s+(.+)$/);
  let houseNo = '', streetName = streetPart;
  if(houseMatch) {
    houseNo = houseMatch[1];
    streetName = houseMatch[2].trim();
  }

  // Remove common direction prefix into its own consideration but keep in street for matching
  // Normalize street suffixes (ST/STREET, AVE/AVENUE, etc) — strip them for looser matching
  streetName = streetName
    .replace(/\b(STREET)\b/g, 'ST')
    .replace(/\b(AVENUE)\b/g, 'AVE')
    .replace(/\b(BOULEVARD)\b/g, 'BLVD')
    .replace(/\b(DRIVE)\b/g, 'DR')
    .replace(/\b(ROAD)\b/g, 'RD')
    .replace(/\b(PLACE)\b/g, 'PL')
    .replace(/\b(LANE)\b/g, 'LN')
    .replace(/\b(COURT)\b/g, 'CT')
    .replace(/\b(TERRACE)\b/g, 'TER')
    .replace(/\b(CIRCLE)\b/g, 'CIR');

  return { houseNo, streetName: streetName.trim(), zip, raw: input };
}

function esc(s) { return (s||'').replace(/'/g, "''"); }

async function findParcel(parsed) {
  const outFields = [
    'AIN','SitusHouseNo','SitusDirection','SitusStreet','SitusUnit','SitusFullAddress','SitusCity','SitusZIP',
    'UseCode','UseType','UseDescription','YearBuilt1','EffectiveYear1','Units1','Bedrooms1','Bathrooms1','SQFTmain1',
    'SQFTmain2','Units2','DesignType2','SQFTmain3','Units3','DesignType3',
    'Roll_LandValue','Roll_ImpValue','Roll_HomeOwnersExemp','Roll_LandBaseYear','Roll_ImpBaseYear',
    'SQFTlot1','LotArea','Shape.STArea()','TaxRateCity'
  ].join(',');

  // Strategy 1: house number + street name starts-with (most reliable)
  const queries = [];
  if(parsed.houseNo && parsed.streetName) {
    // Extract just the core street name (first significant word) for fuzzy matching
    const streetCore = parsed.streetName.split(/\s+/).filter(w => w.length > 1)[0] || parsed.streetName;
    queries.push(`SitusHouseNo='${esc(parsed.houseNo)}' AND UPPER(SitusStreet) LIKE '%${esc(streetCore)}%'`);
    queries.push(`SitusHouseNo='${esc(parsed.houseNo)}' AND UPPER(SitusFullAddress) LIKE '%${esc(parsed.streetName)}%'`);
    if(parsed.zip) {
      queries.push(`SitusHouseNo='${esc(parsed.houseNo)}' AND SitusZIP LIKE '${esc(parsed.zip)}%'`);
    }
  }
  // Strategy 2: full address LIKE
  if(parsed.houseNo) {
    queries.push(`UPPER(SitusFullAddress) LIKE '${esc(parsed.houseNo)} %${esc(parsed.streetName.split(/\s+/)[0])}%'`);
  }

  for(const where of queries) {
    const params = new URLSearchParams({
      where, outFields, returnGeometry: 'false', resultRecordCount: '10', f: 'json',
    });
    const url = PARCEL_URL + '?' + params.toString();
    console.log('Trying WHERE:', where);
    try {
      const data = await get(url);
      if(data.error) { console.warn('Query error:', JSON.stringify(data.error).slice(0,200)); continue; }
      const features = data.features || [];
      console.log('  →', features.length, 'results');
      if(features.length > 0) {
        // Prefer single-family residential
        const sfr = features.find(f => ['0100','0101','0102','0103','010C','010D'].includes(f.attributes.UseCode));
        return { record: (sfr || features[0]).attributes, matchedWhere: where };
      }
    } catch(e) {
      console.error('Fetch error:', e.message);
    }
  }
  return null;
}

function recommendADU(lot) {
  if(lot >= 8000) return '2BR New Construction';
  if(lot >= 7000) return 'Detached 1BD/1BA';
  if(lot >= 5500) return 'Detached Studio';
  if(lot >= 4500) return 'Garage Conversion';
  return 'Junior ADU (JADU)';
}

function aduScore(lead) {
  let s = 0;
  const b = lead.backyardSqft || 2000;
  if(b >= 3500) s += 25; else if(b >= 2500) s += 22; else if(b >= 1800) s += 18; else if(b >= 1200) s += 12; else if(b >= 800) s += 5;
  const lot = lead.lotSqft || 5500;
  if(lot >= 9000) s += 10; else if(lot >= 7500) s += 8; else if(lot >= 6000) s += 5; else if(lot >= 5000) s += 3;
  const eq = lead.equity || 0;
  if(eq >= 700000) s += 20; else if(eq >= 500000) s += 17; else if(eq >= 350000) s += 13; else if(eq >= 200000) s += 8; else if(eq >= 100000) s += 4;
  const yrs = lead.yearsOwned || 0;
  if(yrs >= 30) s += 15; else if(yrs >= 20) s += 12; else if(yrs >= 15) s += 9; else if(yrs >= 10) s += 6; else if(yrs >= 5) s += 3;
  const rent = lead.neighborhoodRent || 2000;
  if(rent >= 3000) s += 15; else if(rent >= 2700) s += 12; else if(rent >= 2400) s += 9; else if(rent >= 2100) s += 6; else if(rent >= 1800) s += 3;
  s += 8;
  const tr = lead.transitScore || 55;
  if(tr >= 85) s += 10; else if(tr >= 70) s += 8; else if(tr >= 55) s += 6; else if(tr >= 40) s += 4; else s += 2;
  const hv = lead.homeValue || 0;
  if(hv >= 600000 && hv <= 1400000) s += 5; else if(hv >= 450000) s += 3;
  return Math.min(100, s);
}

exports.handler = async function(event) {
  const headers = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json' };
  if(event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };

  const p = event.queryStringParameters || {};
  const inputAddress = (p.address || '').trim();
  if(!inputAddress || inputAddress.length < 5) {
    return { statusCode:400, headers, body: JSON.stringify({ ok:false, message:'Address required' }) };
  }

  const parsed = parseAddress(inputAddress);
  console.log('Parsed:', JSON.stringify(parsed));

  let found;
  try {
    found = await findParcel(parsed);
  } catch(err) {
    return { statusCode:200, headers, body: JSON.stringify({ ok:false, message:'Search error: ' + err.message }) };
  }

  if(!found) {
    return { statusCode:200, headers, body: JSON.stringify({
      ok:false,
      message:'Address not found in LA County Assessor records. Note: this database covers LA COUNTY only — addresses in other counties (Orange, Ventura, etc.) won\'t appear. Also try without unit/apt number.',
      parsed,
    })};
  }

  const r = found.record;
  const currentYear = new Date().getFullYear();
  const built = parseInt(r.YearBuilt1) || 0;
  const effYear = parseInt(r.EffectiveYear1) || built || currentYear - 20;
  const yearsOwned = Math.max(1, currentYear - (parseInt(r.Roll_LandBaseYear) || effYear));
  const sqft = parseInt(r.SQFTmain1) || 1400;

  // REAL lot size. Prefer the assessor's explicit lot field; the parcel
  // layer's Shape.STArea() is already in square FEET (State Plane), so do
  // NOT apply a m²→ft² conversion (that was inflating lots ~10.76×).
  let lotSqft = 0;
  if(r.SQFTlot1 && parseFloat(r.SQFTlot1) > 0) {
    lotSqft = Math.round(parseFloat(r.SQFTlot1));
  } else if(r.LotArea && parseFloat(r.LotArea) > 0) {
    lotSqft = Math.round(parseFloat(r.LotArea));
  } else if(r['Shape.STArea()']) {
    lotSqft = Math.round(parseFloat(r['Shape.STArea()'])); // already sq ft
  }
  if(!lotSqft || lotSqft < 800 || lotSqft > 100000) {
    // Last-resort FAR estimate only when no real lot figure is available.
    const far = sqft < 1200 ? 0.28 : sqft < 1800 ? 0.32 : sqft < 2400 ? 0.36 : 0.40;
    lotSqft = Math.round(sqft / far);
  }

  const zip = (r.SitusZIP || parsed.zip || '').toString().trim().slice(0,5);
  const zd = ZIP_DATA[zip] || { city: r.SitusCity || 'Los Angeles', medRent: 2200, transit: 60 };
  const city = (r.SitusCity || zd.city || 'Los Angeles').trim();

  // Build full address from components
  const addrParts = [r.SitusHouseNo, r.SitusDirection, r.SitusStreet].filter(Boolean).join(' ').trim();
  const address = (r.SitusFullAddress || addrParts || parsed.raw).trim();

  // REAL assessed value (land + improvements)
  const landVal = parseInt(r.Roll_LandValue) || 0;
  const impVal = parseInt(r.Roll_ImpValue) || 0;
  const assessedValue = landVal + impVal;

  // Market value estimate: assessed value is often below market due to Prop 13
  // Apply a market multiplier based on how old the base year is
  const baseYear = parseInt(r.Roll_LandBaseYear) || effYear;
  const yearsSinceAssessment = Math.max(0, currentYear - baseYear);
  const prop13Multiplier = Math.min(3.5, 1 + yearsSinceAssessment * 0.05); // ~5%/yr appreciation cap
  const homeVal = assessedValue > 0 ? Math.round(assessedValue * prop13Multiplier) : Math.round(zd.medRent * 380);

  // Equity: market value minus estimated remaining mortgage
  // Homeowner exemption presence suggests owner-occupied
  const hasHomeownerExemp = (parseInt(r.Roll_HomeOwnersExemp) || 0) > 0;
  const purchaseEst = assessedValue > 0 ? assessedValue : homeVal * 0.6;
  const estMortgageRemaining = Math.max(0, purchaseEst * 0.7 * Math.max(0, 1 - yearsOwned / 30));
  const equity = Math.round(homeVal - estMortgageRemaining);

  // Backyard calc
  const frontYard = lotSqft * 0.25, driveway = lotSqft * 0.08, sideYards = lotSqft * 0.10;
  const poolLikely = homeVal > 900000 && yearsOwned < 35 ? 1 : 0;
  const poolEst = poolLikely * 650;
  const availableBackyard = Math.max(0, lotSqft - sqft - frontYard - driveway - sideYards - poolEst);

  // Existing ADU detection
  const sqft2 = parseInt(r.SQFTmain2) || 0;
  const units1 = parseInt(r.Units1) || 1;
  const units2 = parseInt(r.Units2) || 0;
  const hasExistingADU = (sqft2 > 200) || (units1 + units2 > 1);

  const aduType = recommendADU(lotSqft);
  const aduSqft = aduType.includes('2BR') ? 700 : aduType.includes('1BD') ? 580 : aduType.includes('Studio') ? 460 : 390;
  const estRent = aduType.includes('2BR') ? Math.round(zd.medRent * 0.92) : aduType.includes('1BD') ? Math.round(zd.medRent * 0.78) : aduType.includes('Studio') ? Math.round(zd.medRent * 0.65) : Math.round(zd.medRent * 0.60);

  const property = {
    ain: r.AIN || '',
    address: address.replace(/\s+/g, ' ').trim(),
    city, zip,
    homeValue: homeVal,
    assessedValue,
    landValue: landVal,
    improvementValue: impVal,
    mortgage: Math.round(estMortgageRemaining),
    equity,
    yearsOwned,
    ownerOccupied: hasHomeownerExemp,
    lotSqft,
    backyardSqft: Math.round(availableBackyard),
    neighborhoodRent: zd.medRent,
    transitScore: zd.transit,
    aduType, aduSqft, estRent,
    buildCost: Math.round(aduSqft * 295),
    valueAdded: aduType.includes('2BR') ? 270000 : aduType.includes('1BD') ? 200000 : 170000,
    hasExistingADU,
    poolLikely: poolLikely === 1,
    bedrooms: parseInt(r.Bedrooms1) || null,
    bathrooms: parseInt(r.Bathrooms1) || null,
    homeSqft: sqft,
    yearBuilt: built,
    useType: r.UseType || r.UseDescription || '',
    propertyNote: 'Built ' + (built||'—') + ' · ' + (r.Bedrooms1||'?') + 'BR/' + (r.Bathrooms1||'?') + 'BA · ' +
      sqft.toLocaleString() + ' sqft home on ' + lotSqft.toLocaleString() + ' sqft lot · ~' +
      Math.round(availableBackyard).toLocaleString() + ' sqft available backyard' +
      (poolLikely ? ' (possible pool deducted)' : '') +
      (hasHomeownerExemp ? ' · Owner-occupied' : ' · May be non-owner-occupied') +
      (assessedValue > 0 ? ' · Assessed $' + assessedValue.toLocaleString() + ' (base yr ' + baseYear + ')' : '') +
      (hasExistingADU ? '. ⚠ Records suggest existing second unit — verify.' : '') + '.',
  };

  property.score = aduScore(property);
  property.tier = property.score >= 75 ? 'A' : property.score >= 55 ? 'B' : 'C';
  if(hasExistingADU) { property.score = Math.min(property.score, 35); property.tier = 'C'; }

  return { statusCode:200, headers, body: JSON.stringify({ ok:true, property, matchedWhere: found.matchedWhere }) };
};
