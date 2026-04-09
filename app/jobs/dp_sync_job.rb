require 'net/http'
require 'json'
require 'openssl'

class DpSyncJob < ApplicationJob
  queue_as :default

  def perform(dp_sync_request_id)
    sync = DpSyncRequest.find(dp_sync_request_id)
    sync.update!(status: :running, started_at: Time.current, errors_json: [])

    ids = Array(sync.received_ids).map(&:to_s).uniq

    # Resolve specs from DP. If DP isn't configured, mark as failed but keep sync record.
    dp_base_url = ENV['DP_API_BASE_URL'].to_s.strip
    shared_secret = ENV['BC_SERVICE_SHARED_SECRET'].to_s.strip

    if dp_base_url.blank?
      return sync.update!(
        status: :failed,
        resolved_count: 0,
        missing_count: ids.length,
        missing_ids: ids,
        errors_json: ['DP_API_BASE_URL not configured'],
        finished_at: Time.current
      )
    end

    project_dp_id = sync.project.dp_project_id.to_s
    response = fetch_specs_from_dp(dp_base_url, project_dp_id, ids, shared_secret)

    items = Array(response['items'])
    missing_ids = Array(response['missing_ids']).map(&:to_s)

    ActiveRecord::Base.transaction do
      upsert_spec_items!(sync.bid_package, items)
      sync.update!(
        status: :completed,
        resolved_count: items.length,
        missing_count: missing_ids.length,
        missing_ids: missing_ids,
        errors_json: [],
        finished_at: Time.current
      )
    end
  rescue StandardError => e
    begin
      sync = DpSyncRequest.find(dp_sync_request_id)
      errors = Array(sync.errors_json)
      errors << "#{e.class}: #{e.message}"
      sync.update!(status: :failed, errors_json: errors, finished_at: Time.current)
    rescue StandardError
      # swallow
    end
    raise
  end

  private

  def fetch_specs_from_dp(dp_base_url, project_id, project_product_ids, shared_secret)
    uri = URI.join(dp_base_url, "/dp_api/projects/#{project_id}/specs/batch")
    payload = { project_product_ids: project_product_ids }.to_json

    req = Net::HTTP::Post.new(uri)
    req['Content-Type'] = 'application/json'

    # Reuse the same HMAC scheme for DP->BC and BC->DP if a shared secret is set.
    if shared_secret.present?
      timestamp = Time.now.to_i.to_s
      nonce = SecureRandom.hex(12)
      body_sha256 = OpenSSL::Digest::SHA256.hexdigest(payload)
      canonical = [timestamp, nonce, 'POST', uri.request_uri, body_sha256].join('.')
      signature = OpenSSL::HMAC.hexdigest('SHA256', shared_secret, canonical)

      req['X-BC-Timestamp'] = timestamp
      req['X-BC-Nonce'] = nonce
      req['X-BC-Signature'] = signature
    end

    req.body = payload

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == 'https')
    res = http.request(req)

    raise "DP spec fetch failed: HTTP #{res.code}" unless res.code.to_i == 200

    JSON.parse(res.body)
  end

  def upsert_spec_items!(bid_package, items)
    items.each do |item|
      pp_id = item['project_product_id'].to_s
      next if pp_id.blank?

      code_tag = item['code_tag'].to_s
      product = item['product_display_name'].to_s
      brand = item['brand_display_name'].to_s
      qty = item['qty']

      # SpecItem schema requires these fields.
      attrs = {
        spec_item_id: pp_id,
        sku: code_tag.presence || pp_id,
        product_name: product.presence || "Product #{pp_id}",
        manufacturer: brand.presence || 'Unknown',
        category: 'Uncategorized',
        description: '',
        quantity: qty.present? ? BigDecimal(qty.to_s) : BigDecimal('1'),
        uom: 'EA'
      }

      existing = bid_package.spec_items.find_by(spec_item_id: pp_id)
      if existing
        existing.update!(attrs)
      else
        bid_package.spec_items.create!(attrs)
      end
    end
  end
end

