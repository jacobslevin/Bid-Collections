const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })

  let data = null
  try {
    data = await response.json()
  } catch (_error) {
    data = null
  }

  if (!response.ok) {
    const message = data?.error || data?.errors?.join(', ') || `Request failed (${response.status})`
    const error = new Error(message)
    error.details = data
    throw error
  }

  return data
}

export async function createProject(payload) {
  return request('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ project: payload })
  })
}

export async function fetchProjects() {
  return request('/api/projects')
}

export async function deleteProject(projectId) {
  return request(`/api/projects/${projectId}`, {
    method: 'DELETE'
  })
}

export async function previewBidPackage({ projectId, csvContent, sourceProfile }) {
  return request(`/api/projects/${projectId}/bid_packages/preview`, {
    method: 'POST',
    body: JSON.stringify({ csv_content: csvContent, source_profile: sourceProfile })
  })
}

export async function createBidPackage({ projectId, name, sourceFilename, csvContent, sourceProfile }) {
  return request(`/api/projects/${projectId}/bid_packages`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      source_filename: sourceFilename,
      csv_content: csvContent,
      source_profile: sourceProfile
    })
  })
}

export async function fetchBidPackageDashboard(bidPackageId) {
  return request(`/api/bid_packages/${bidPackageId}/dashboard`)
}

export async function fetchBidPackages() {
  return request('/api/bid_packages')
}

export async function deleteBidPackage(bidPackageId) {
  return request(`/api/bid_packages/${bidPackageId}`, {
    method: 'DELETE'
  })
}

export async function createInvite({ bidPackageId, dealerName, dealerEmail, password }) {
  return request(`/api/bid_packages/${bidPackageId}/invites`, {
    method: 'POST',
    body: JSON.stringify({
      invite: {
        dealer_name: dealerName,
        dealer_email: dealerEmail,
        password,
        password_confirmation: password
      }
    })
  })
}

export async function deleteInvite({ bidPackageId, inviteId }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/${inviteId}`, {
    method: 'DELETE'
  })
}

export async function fetchInviteHistory({ bidPackageId, inviteId }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/${inviteId}/history`)
}

export async function reopenInviteBid({ bidPackageId, inviteId, reason }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/${inviteId}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  })
}

export async function updateInvitePassword({ bidPackageId, inviteId, password }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/${inviteId}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ password })
  })
}

export async function fetchComparison(bidPackageId) {
  return request(`/api/bid_packages/${bidPackageId}/comparison`)
}

export function comparisonExportUrl(bidPackageId) {
  return `${API_BASE_URL}/api/bid_packages/${bidPackageId}/export.csv`
}

export async function fetchInvite(token) {
  return request(`/api/invites/${token}`)
}

export async function unlockInvite(token, password) {
  return request(`/api/invites/${token}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ password })
  })
}

export async function fetchDealerBid(token) {
  return request(`/api/invites/${token}/bid`)
}

export async function saveDealerBid(token, lineItems, pricing = {}) {
  return request(`/api/invites/${token}/bid`, {
    method: 'PUT',
    body: JSON.stringify({ line_items: lineItems, pricing })
  })
}

export async function submitDealerBid(token) {
  return request(`/api/invites/${token}/bid/submit`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}
