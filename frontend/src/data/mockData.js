export const projects = [
  { id: 1, name: 'Pine Ridge Campus Renovation', packages: 2, lastActivity: '2026-02-12' },
  { id: 2, name: 'North Tower Patient Rooms', packages: 1, lastActivity: '2026-02-11' }
]

export const previewRows = [
  {
    sku: '*CL-1',
    product_name: 'INTELLECT WAVE',
    image_url: 'https://content.designerpages.com/assets/82412733/Wavechaircant15.jpg',
    source_url: 'http://designerpages.com/manufacturers/ki',
    manufacturer: 'KI',
    category: 'CHAIR - LEARNING',
    notes: '',
    description: 'Cantilever chair with polypropylene seat and back with chrome base.',
    attributes_text: 'Model #: IWC18CHPEVNG',
    nested_products: 'Everglade Shade - KI|Chrome - KI',
    quantity: 1,
    uom: 'EA'
  },
  {
    sku: '*DSK-1',
    product_name: 'TEXT',
    image_url: 'https://content.designerpages.com/assets/80625882/textdesk.png',
    source_url: 'http://designerpages.com/manufacturers/virco-2',
    manufacturer: 'Virco',
    category: 'DESK - STUDENT',
    notes: '',
    description: 'Height-adjustable desk with hard plastic top and T-base legs.',
    attributes_text: 'Model #: DESK-TD2128YADJM-GRY91-GRY02',
    nested_products: 'Grey Nebula - Virco|Silver Mist - Virco',
    quantity: 1,
    uom: 'EA'
  }
]

export const invites = [
  { id: 1, dealer: 'Workplace Source', email: 'ops@workplace-source.com', status: 'submitted', lastSaved: '2026-02-13 10:22', submittedAt: '2026-02-13 10:27' },
  { id: 2, dealer: 'FurnishWest', email: 'bids@furnishwest.com', status: 'in_progress', lastSaved: '2026-02-13 09:54', submittedAt: '' },
  { id: 3, dealer: 'Civic Interiors', email: '', status: 'not_started', lastSaved: '', submittedAt: '' }
]

export const dealerBidRows = previewRows.map((row, index) => ({
  id: index + 1,
  ...row,
  unit_price: index === 0 ? '145.50' : '',
  lead_time_days: index === 0 ? '14' : '',
  dealer_notes: ''
}))

export const comparisonRows = [
  {
    id: 1,
    sku: '*CL-1',
    product: 'INTELLECT WAVE',
    quantity: 1,
    uom: 'EA',
    avg: 140,
    best: 135,
    dealerA: 135,
    dealerB: 145
  },
  {
    id: 2,
    sku: '*DSK-1',
    product: 'TEXT',
    quantity: 1,
    uom: 'EA',
    avg: 390,
    best: 380,
    dealerA: 400,
    dealerB: 380
  }
]
