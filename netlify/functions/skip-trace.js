// ══════════════════════════════════════════════════════════════════
// BackLot Builds — Skip Trace Function
// Per-lead BatchData lookup — pay only for leads you choose
// Returns owner name, phones, email, ownership type
// ══════════════════════════════════════════════════════════════════

const https = require('https');

function postBatchData(url, body, apiKey) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'BackLotBuilds/1.0',
        'Accept': 'application/json'
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch(e) {
          resolve({ status: res.statusCode, data: { raw: body.slice(0, 500), parseError: e.message } });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-batchdata-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if(event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if(event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'POST required' }) };
  }

  const apiKey = event.headers['x-batchdata-key'] || event.headers['X-BatchData-Key'] || '';
  if(!apiKey) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Missing x-batchdata-key header' }) };
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Invalid JSON body' }) };
  }

  const { address, city, zip } = payload;
  if(!address || !zip) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'address and zip are required' }) };
  }

  console.log('Skip trace request:', { address, city, zip });

  try {
    // BatchData Skip Trace endpoint — uses address-based search with skipTrace flag
    // This is billed per-record-returned, so failed lookups cost nothing
    const reqBody = {
      searchCriteria: {
        query: address + ', ' + (city || '') + ', CA ' + zip
      },
      options: {
        take: 1,
        skipTrace: true,
        includeContacts: true
      }
    };

    const result = await postBatchData('https://api.batchdata.com/api/v1/property/skip-trace', reqBody, apiKey);

    if(result.status === 401) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'Invalid API key' }) };
    }
    if(result.status === 402 || result.status === 403) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'Insufficient credits or no permission for skip trace' }) };
    }
    if(result.status !== 200) {
      console.error('BatchData error:', JSON.stringify(result.data).slice(0, 500));
      return { statusCode: 200, headers, body: JSON.stringify({
        ok: false,
        error: 'BatchData HTTP ' + result.status,
        debug: result.data
      }) };
    }

    // Parse the response — BatchData wraps in results.persons or results.properties
    const data = result.data;
    const persons = data.results?.persons || data.persons || [];
    const properties = data.results?.properties || data.properties || [];

    let name = '', phone = '', phone2 = '', email = '', ownerType = '';

    // Try persons first (skip trace response)
    if(persons.length > 0) {
      const p = persons[0];
      name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ') || p.fullName || '';
      const phones = p.phoneNumbers || p.phones || [];
      const emails = p.emails || p.emailAddresses || [];
      phone = phones[0]?.number || phones[0]?.phoneNumber || (typeof phones[0] === 'string' ? phones[0] : '');
      phone2 = phones[1]?.number || phones[1]?.phoneNumber || (typeof phones[1] === 'string' ? phones[1] : '');
      email = emails[0]?.email || emails[0]?.emailAddress || (typeof emails[0] === 'string' ? emails[0] : '');
    }

    // Fallback to property owner data
    if(!name && properties.length > 0) {
      const r = properties[0];
      const owner = r.owner || {};
      name = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.fullName || owner.ownerName || '';
      const phones = r.skipTrace?.phones || owner.phones || [];
      const emails = r.skipTrace?.emails || owner.emails || [];
      phone = phones[0]?.number || (typeof phones[0] === 'string' ? phones[0] : '');
      phone2 = phones[1]?.number || (typeof phones[1] === 'string' ? phones[1] : '');
      email = emails[0]?.email || (typeof emails[0] === 'string' ? emails[0] : '');
      ownerType = owner.isCorporate ? 'Corporate' : 'Individual';
    }

    if(!name && !phone && !email) {
      return { statusCode: 200, headers, body: JSON.stringify({
        ok: true,
        name: '',
        phone: '',
        email: '',
        message: 'No contact information found for this address. Owner may use a corporate entity, LLC, or have privacy protections.',
        cost: 0
      }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        name,
        phone,
        phone2,
        email,
        ownerType,
        cost: 0.30,
        source: 'BatchData Skip Trace'
      })
    };

  } catch(err) {
    console.error('Skip trace error:', err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
