const nativeFetch = globalThis.fetch.bind(globalThis);

function rebrandText(value) {
  return String(value)
    .replace(/RentPilot AI/g, 'Mendlyx')
    .replace(/RentPilot/g, 'Mendlyx');
}

globalThis.fetch = async function mendlyxBrandedFetch(input, init = {}) {
  if (typeof init?.body === 'string' && init.body.includes('RentPilot')) {
    init = { ...init, body: rebrandText(init.body) };
  }
  return nativeFetch(input, init);
};

console.log('Mendlyx backend brand patch installed');
