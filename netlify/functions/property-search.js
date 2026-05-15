// ══════════════════════════════════════════════════════════════════
// BackLot Builds — Property Search Function
// Looks up a single address in LA County and returns full ADU analysis
// ══════════════════════════════════════════════════════════════════

const https = require('https');

// ZIP data — same as fetch-leads.js (subset shown for brevity, but full LA coverage)
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
        try {
          resolve(JSON.parse(body));
        } catch(e) {
          reject(new Error('JSON parse failed. Status ' + res.statusCode + '. Body: ' + body.slice(0, 300)));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Parse address into components
function parseAddress(input) {
  const cleaned = input.trim().replace(/,?\s*(usa|us)$/i, '').replace(/\s+ca\s+/i, ', CA ');
  // Try to extract ZIP
  const zipMatch = cleaned.match(/\b(9\d{4})\b/);
  const zip = zipMatch ? zipMatch[1] : '';
  // Strip ZIP
  let stripped = zip ? cleaned.replace(zip, '').replace(/,?\s*CA\s*/i, '').trim() : cleaned;
  stripped = stripped.replace(/,\s*$/, '').trim();
  // Try splitting at last comma for city
  const lastComma = stripped.lastIndexOf(',');
  let street = stripped, city = '';
  if(lastComma > 0) {
    street = stripped.slice(0, lastComma).trim();
    city = stripped.slice(lastComma + 1).trim();
  }
  return { street: street.toUpperCase(), city: city.toUpperCase(), zip };
}

function aduScore(lead) {
  let s = 0;
  const backyard = lead.backyardSqft || 2000;
  if(backyard >= 3500) s += 25;
  else if(backyard >= 2500) s += 22;
  else if(backyard >= 1800) s += 18;
  else if(backyard >= 1200) s += 12;
  else if(backyard >= 800) s += 5;
  else s = 0;
  const lot = lead.lotSqft || 5500;
  if(lot >= 9000) s += 10; else if(lot >= 7500) s += 8; else if(lot >= 6000) s += 5; else if(lot >= 5000) s += 3;
  const eq = lead.equity || 0;
  if(eq >= 700000) s += 20; else if(eq >= 500000) s += 17; else if(eq >= 350000) s += 13;
  else if(eq >= 200000) s += 8; else if(eq >= 100000) s += 4;
  const yrs = lead.yearsOwned || 0;
  if(yrs >= 30) s += 15; else if(yrs >= 20) s += 12; else if(yrs >= 15) s += 9;
  else if(yrs >= 10) s += 6; else if(yrs >= 5) s += 3;
  const rent = lead.neighborhoodRent || 2000;
  if(rent >= 3000) s += 15; else if(rent >= 2700) s += 12; else if(rent >= 2400) s += 9;
  else if(rent >= 2100) s += 6; else if(rent >= 1800) s += 3;
  s += 8;
  const tr = lead.transitScore || 55;
  if(tr >= 85) s += 10; else if(tr >= 70) s += 8; else if(tr >= 55) s += 6;
  else if(tr >= 40) s += 4; else s += 2;
  const hv = lead.homeValue || 0;
  if(hv >= 600000 && hv <= 1400000) s += 5; else if(hv >= 450000) s += 3;
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

  const p = event.queryStringParameters || {};
  const inputAddress = (p.address || '').trim();
  if(!inputAddress || inputAddress.length < 6) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, message: 'Address required' }) };
  }

  const parsed = parseAddress(inputAddress);
  console.log('Parsed:', parsed);

  const PARCEL_URL = 'https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0/query';

  // Try multiple WHERE clauses to find the property
  const queries = [];
  if(parsed.zip && parsed.street) {
    // Most specific: street + ZIP
    queries.push("SitusZIP='" + parsed.zip + "' AND SitusFullAddress LIKE '" + parsed.street.replace(/'/g, "''") + "%'");
  }
  if(parsed.street && parsed.city) {
    // Street + city fallback
    queries.push("UPPER(SitusCity)='" + parsed.city.replace(/'/g, "''") + "' AND SitusFullAddress LIKE '" + parsed.street.replace(/'/g, "''") + "%'");
  }
  if(parsed.street) {
    // Street only (broadest)
    queries.push("SitusFullAddress LIKE '" + parsed.street.replace(/'/g, "''") + "%'");
  }

  let record = null;
  let lastError = null;

  for(const where of queries) {
    const params = new URLSearchParams({
      where: where,
      outFields: 'AIN,SitusFullAddress,SitusCity,SitusZIP,UseCode,UseType,YearBuilt1,EffectiveYear1,Units1,Bedrooms1,Bathrooms1,SQFTmain1,SQFTmain2,Units2,DesignType2,SQFTmain3,Units3,TaxRateCity',
      returnGeometry: 'false',
      resultRecordCount: '5',
      f: 'json',
    });
    const url = PARCEL_URL + '?' + params.toString();
    console.log('Querying:', where);

    try {
      const data = await get(url);
      if(data.error) {
        lastError = data.error.message || JSON.stringify(data.error);
        console.warn('Query error:', lastError);
        continue;
      }
      const features = data.features || [];
      console.log('Got', features.length, 'features');

      if(features.length > 0) {
        // Find the best match — prefer single-family residential
        const sfrCodes = ['0100','0101','0102','0103','010C','010D'];
        const sfrMatch = features.find(f => sfrCodes.includes(f.attributes.UseCode));
        record = sfrMatch ? sfrMatch.attributes : features[0].attributes;
        break;
      }
    } catch(e) {
      lastError = e.message;
      console.error('Fetch error:', e.message);
    }
  }

  if(!record) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: false,
        message: lastError ? ('Search failed: ' + lastError) : 'Address not found in LA County records. Try a different format or check the address.',
      }),
    };
  }

  // Build property analysis
  const currentYear = new Date().getFullYear();
  const built = parseInt(record.YearBuilt1) || 0;
  const effYear = parseInt(record.EffectiveYear1) || built || currentYear - 20;
  const yearsOwned = Math.max(1, currentYear - effYear);
  const sqft = parseInt(record.SQFTmain1) || 1400;
  const farRatio = sqft < 1200 ? 0.28 : sqft < 1800 ? 0.32 : sqft < 2400 ? 0.36 : 0.40;
  const lotSqft = Math.round(sqft / farRatio);

  const zip = (record.SitusZIP || parsed.zip || '').toString().trim().slice(0, 5);
  const zd = ZIP_DATA[zip] || { city: record.SitusCity || 'Los Angeles', medRent: 2200, transit: 60 };
  const city = (record.SitusCity || record.TaxRateCity || zd.city || 'Los Angeles').replace(/\s+CA\s*$/i, '').trim();
  const address = (record.SitusFullAddress || '').toString().trim();

  // Estimate home value
  const baseValue = zd.medRent * 380;
  const sqftFactor = Math.max(0.7, Math.min(1.5, sqft / 1400));
  const homeVal = Math.round(baseValue * sqftFactor);
  const poolLikely = homeVal > 900000 && yearsOwned < 35 ? 1 : 0;

  // Calculate backyard
  const homeFootprint = sqft;
  const frontYardEst = lotSqft * 0.25;
  const drivewayEst = lotSqft * 0.08;
  const sideYardsEst = lotSqft * 0.10;
  const poolEst = poolLikely * 650;
  const availableBackyard = Math.max(0, lotSqft - homeFootprint - frontYardEst - drivewayEst - sideYardsEst - poolEst);

  // Equity model
  const purchaseEst = homeVal * (0.40 + Math.min(yearsOwned, 30) / 30 * 0.40);
  const remainingMtg = Math.max(0, purchaseEst * 0.78 * Math.max(0, 1 - yearsOwned / 30));
  const equity = Math.round(homeVal - remainingMtg);

  // Detect existing ADU
  const sqft2 = parseInt(record.SQFTmain2) || 0;
  const units1 = parseInt(record.Units1) || 1;
  const units2 = parseInt(record.Units2) || 0;
  const hasExistingADU = (sqft2 > 200) || (units1 + units2 > 1);

  const aduType = recommendADU(lotSqft);
  const aduSqft = aduType.includes('2BR') ? 700 : aduType.includes('1BD') ? 580 : aduType.includes('Studio') ? 460 : 390;
  const estRent = aduType.includes('2BR') ? Math.round(zd.medRent * 0.92)
                : aduType.includes('1BD') ? Math.round(zd.medRent * 0.78)
                : aduType.includes('Studio') ? Math.round(zd.medRent * 0.65)
                : Math.round(zd.medRent * 0.60);
  const buildCost = Math.round(aduSqft * 295);

  const property = {
    ain: record.AIN || '',
    address: address.replace(/,.*$/, '').trim() || parsed.street,
    city,
    zip,
    homeValue: homeVal,
    mortgage: Math.round(remainingMtg),
    equity,
    yearsOwned,
    lotSqft,
    backyardSqft: Math.round(availableBackyard),
    neighborhoodRent: zd.medRent,
    transitScore: zd.transit,
    aduType, aduSqft, estRent, buildCost,
    valueAdded: aduType.includes('2BR') ? 270000 : aduType.includes('1BD') ? 200000 : 170000,
    hasExistingADU,
    poolLikely: poolLikely === 1,
    propertyNote: 'Built ' + (built || '—') + '. ' + (record.Bedrooms1 || '?') + 'BR/' + (record.Bathrooms1 || '?') + 'BA · ' +
      sqft.toLocaleString() + ' sqft home on est. ' + lotSqft.toLocaleString() + ' sqft lot · ~' +
      Math.round(availableBackyard).toLocaleString() + ' sqft available backyard' +
      (poolLikely ? ' (possible pool deducted)' : '') +
      (hasExistingADU ? '. ⚠ Records suggest existing second structure — verify before pursuing.' : '') +
      '. AIN: ' + (record.AIN || '—') + '.',
  };

  property.score = aduScore(property);
  property.tier = property.score >= 75 ? 'A' : property.score >= 55 ? 'B' : 'C';

  // If existing ADU detected, cap score
  if(hasExistingADU) {
    property.score = Math.min(property.score, 35);
    property.tier = 'C';
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, property }),
  };
};
