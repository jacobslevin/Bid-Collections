import vendors from '../data/vendors.json'

const CUSTOM_VENDORS_STORAGE_KEY = 'bid_collections.custom_vendor_records'

function safeString(value) {
  return String(value || '').trim()
}

export function normalizeVendorRecord(raw = {}, index = 0, source = 'catalog') {
  const legacyInlineName = source === 'custom' ? safeString(raw.name) : ''
  const explicitCompanyName = safeString(raw.companyName || raw.company_name || raw['Company Name'])
  const explicitContactName = safeString(raw.contactName || raw.contact_name || raw['Contact Name'] || legacyInlineName)
  const shouldRepairLegacyCustomRecord = source === 'custom' && explicitCompanyName && !explicitContactName
  const companyName = shouldRepairLegacyCustomRecord ? '' : explicitCompanyName
  const contactName = shouldRepairLegacyCustomRecord ? explicitCompanyName : explicitContactName
  const email = safeString(raw.email || raw.dealerEmail || raw.dealer_email || raw['Email Address'])
  const phone = safeString(raw.phone || raw.phone_number || raw['Phone Number'])
  const vendorId = safeString(raw.vendorId || raw.vendor_id || raw.id) || `${source}-${email || companyName || index}`

  return {
    id: vendorId,
    key: vendorId,
    source,
    companyName,
    contactName,
    email,
    phone,
    inviteToHub: raw.inviteToHub !== false
  }
}

export function getCatalogVendorRecords() {
  return vendors.map((vendor, index) => normalizeVendorRecord(vendor, index, 'catalog'))
}

export function loadCustomVendorRecords() {
  try {
    const raw = window.localStorage.getItem(CUSTOM_VENDORS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item, index) => normalizeVendorRecord(item, index, 'custom'))
  } catch (_error) {
    return []
  }
}

export function storeCustomVendorRecords(records) {
  try {
    window.localStorage.setItem(CUSTOM_VENDORS_STORAGE_KEY, JSON.stringify(records))
  } catch (_error) {
    // no-op when localStorage is unavailable
  }
}

export function buildVendorDirectory(customVendorRecords = []) {
  return [...customVendorRecords, ...getCatalogVendorRecords()]
}

export function findVendorByEmail(records = [], email) {
  const normalizedEmail = safeString(email).toLowerCase()
  if (!normalizedEmail) return null
  return records.find((record) => safeString(record.email).toLowerCase() === normalizedEmail) || null
}

export function createLocalVendorRecord({ email, name, phone, inviteToHub = true }) {
  const normalizedEmail = safeString(email).toLowerCase()
  return normalizeVendorRecord({
    vendorId: `custom-${normalizedEmail}`,
    companyName: '',
    contactName: safeString(name),
    email: normalizedEmail,
    phone: safeString(phone),
    inviteToHub
  }, 0, 'custom')
}

export function buildInvitePayloadFromVendor(vendorRecord) {
  const email = safeString(vendorRecord?.email)
  const companyName = safeString(vendorRecord?.companyName)
  const contactName = safeString(vendorRecord?.contactName)
  const fallbackName = email ? email.split('@')[0] : ''
  const dealerName = contactName || companyName || fallbackName

  return {
    dealerName,
    dealerEmail: email
  }
}
