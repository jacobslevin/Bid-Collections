require 'openssl'
require 'securerandom'

module Api
  # Service-to-service authentication for DP <-> Bid Collections API calls.
  #
  # This is intentionally not JWT-based because:
  # - browser clients must never hold a signing secret
  # - mounted-engine mode can authenticate via the host app and proxy requests
  # - HMAC signatures are simple, dependency-free, and work for both modes
  #
  # Expected headers:
  # - X-BC-Timestamp: unix epoch seconds
  # - X-BC-Nonce: random string (unique per request)
  # - X-BC-Signature: hex HMAC-SHA256 over canonical string
  #
  # Canonical string:
  #   "#{timestamp}.#{nonce}.#{method}.#{path}.#{body_sha256}"
  #
  # Secret:
  #   ENV['BC_SERVICE_SHARED_SECRET']
  module ServiceAuth
    MAX_SKEW_SECONDS = 5 * 60
    NONCE_TTL_SECONDS = 10 * 60

    def authenticate_service!
      secret = ENV['BC_SERVICE_SHARED_SECRET'].to_s
      return render_service_unauthorized('Service auth not configured') if secret.empty?

      timestamp = request.headers['X-BC-Timestamp'].to_s
      nonce = request.headers['X-BC-Nonce'].to_s
      signature = request.headers['X-BC-Signature'].to_s

      return render_service_unauthorized('Missing service auth headers') if timestamp.empty? || nonce.empty? || signature.empty?

      ts_i = timestamp.to_i
      now = Time.now.to_i
      return render_service_unauthorized('Invalid timestamp') if ts_i <= 0 || (now - ts_i).abs > MAX_SKEW_SECONDS

      return render_service_unauthorized('Replay detected') if nonce_used?(nonce)

      body = request.raw_post.to_s
      body_sha256 = OpenSSL::Digest::SHA256.hexdigest(body)
      canonical = [timestamp, nonce, request.request_method.upcase, request.fullpath, body_sha256].join('.')

      expected = OpenSSL::HMAC.hexdigest('SHA256', secret, canonical)
      unless secure_compare_hex(signature, expected)
        return render_service_unauthorized('Bad signature')
      end

      mark_nonce_used!(nonce)
      true
    end

    private

    def render_service_unauthorized(message)
      render json: { error: message }, status: :unauthorized
    end

    def nonce_cache_key(nonce)
      "bc:service_nonce:#{nonce}"
    end

    def nonce_used?(nonce)
      Rails.cache.read(nonce_cache_key(nonce)).present?
    rescue StandardError
      false
    end

    def mark_nonce_used!(nonce)
      Rails.cache.write(nonce_cache_key(nonce), true, expires_in: NONCE_TTL_SECONDS)
    rescue StandardError
      # If cache is unavailable, still allow request (best-effort replay protection).
      true
    end

    # Constant-time comparison for hex strings.
    def secure_compare_hex(a, b)
      return false if a.blank? || b.blank?
      return false unless a.bytesize == b.bytesize

      ActiveSupport::SecurityUtils.secure_compare(a, b)
    end
  end
end

