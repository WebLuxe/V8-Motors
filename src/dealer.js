// The dealership's details: address, phones, hours, leasing partner. Kept apart from the stock list,
// so pages that only need these (opening hours, contact links) don't download every car.
export const DEALER = {
  name: 'V8 Motors',
  legalName: 'V8 Motors Ltd',
  phone: '5259 0327',
  phoneHref: 'tel:+23052590327',
  phones: [
    ['5259 0327', 'tel:+23052590327'],
    ['5750 7912', 'tel:+23057507912'],
    ['5500 9527', 'tel:+23055009527'],
    ['5532 9727', 'tel:+23055329727'],
  ],
  whatsapp: '23052590327',
  tiktok: 'https://www.tiktok.com/@v8motorsltd', // given by the owner
  tiktokName: '@v8motorsltd',
  email: 'veightmotorsv8@gmail.com',
  street: '59B Royal Road',
  locality: 'Coromandel',
  address: '59B Royal Road, Coromandel, Mauritius',
  mapsQuery: 'V8 Motors 59B Royal Road Coromandel Mauritius',
  timeZone: 'Indian/Mauritius',
  position: { lat: -20.18, lon: 57.47 }, // two decimals: the forecast is only for the area
  // index 0 = Sunday … 6 = Saturday; null = closed
  hours: [null, ['09:00', '17:00'], ['09:00', '17:00'], ['09:00', '17:00'], ['09:00', '17:00'], ['09:00', '17:00'], ['09:00', '16:00']],
  // an example rate for the calculators only; the leasing company sets the real one
  financeRate: 7.5,
  leasing: 'Rogers Capital',
};
