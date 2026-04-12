require 'json'
require 'net/http'

module Analysis
  class BidResponseAiSynthesisService
    OPENAI_URI = URI.parse('https://api.openai.com/v1/chat/completions')

    def initialize(bid_package:, deterministic_payload:, model: nil)
      @bid_package = bid_package
      @deterministic_payload = deterministic_payload || {}
      @model = model.presence || ENV['OPENAI_BID_ANALYSIS_MODEL'].presence || 'gpt-4o-mini'
    end

    def call
      api_key = ENV['OPENAI_API_KEY'].to_s.strip
      return { error: 'OPENAI_API_KEY is not configured' } if api_key.empty?

      analysis = enriched_analysis_payload
      win_rate_flag = computed_win_rate_flag(analysis)
      system_prompt = build_system_prompt
      request_body = {
        model: @model,
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: system_prompt
          },
          {
            role: 'user',
            content: build_user_prompt(analysis)
          }
        ]
      }

      response_json = post_to_openai(api_key: api_key, body: request_body)
      content = response_json.dig('choices', 0, 'message', 'content').to_s
      parsed = JSON.parse(content)
      parsed['leader'] ||= []
      parsed_leader_before = parsed['leader'].inspect
      parsed['leader'] << win_rate_flag if win_rate_flag.present?
      parsed_leader_after = parsed['leader'].inspect

      Rails.logger.info("[BidAnalysis] leader before append: #{parsed_leader_before}") if defined?(Rails) && Rails.respond_to?(:logger)
      Rails.logger.info("[BidAnalysis] leader after append: #{parsed_leader_after}") if defined?(Rails) && Rails.respond_to?(:logger)

      normalized = {
        source: 'ai',
        model: @model,
        title: normalize_text(parsed['title'], fallback: '🧠 Bid Analysis'),
        leader: normalize_lines(parsed['leader'], min: 1, max: 2),
        leader_review: normalize_lines(parsed['leader_review'], min: 1, max: 2),
        high_variance_rows: normalize_lines(parsed['high_variance_rows'], min: 0, max: 8),
        watch_out: normalize_text(parsed['watch_out'], fallback: default_watch_out(analysis))
      }
      Rails.logger.info("[BidAnalysis] final normalized response: #{normalized.inspect}") if defined?(Rails) && Rails.respond_to?(:logger)
      normalized
    rescue StandardError => error
      log_error(
        'AI synthesis failed',
        error: error.class.name,
        message: error.message,
        bid_package_id: @bid_package.id,
        request_body_preview: request_body.to_json[0, 5000]
      )
      { error: "AI synthesis failed: #{error.message}" }
    end

    private

    def build_system_prompt
      <<~PROMPT.strip
        You are a bid analysis assistant for a furniture procurement platform.
        Return strict JSON only with these exact keys: title, leader, leader_review,
        high_variance_rows, watch_out. No preamble, no markdown, no extra keys.

        OUTPUT RULES — follow exactly, no deviation:

        title: "Bid Analysis"

        leader: array of 1-2 strings.
          Line 1 MUST follow this pattern exactly:
          "[winner_email] leads by $[gapDollar] ([gapPct]%) over [runnerUpLabel]"

        leader_review: array of 2-3 strings. Rules:
          - No row codes anywhere in this array.
          - No editorializing. Do not say "significant savings", "competitive", or similar.
          - Line 1: "A small number of rows in the leading bid stand out."
          - Line 2: "Look for: scope, quantity, or component differences."

        high_variance_rows: array of row code strings only. No metrics, no text.

        watch_out: use watch_out_seed from the payload as the basis. Preserve the
          vendor emails, row code, and dollar figures. You may tighten wording only.
          No hedge words: never use "may", "might", "could", "appears", "suggests".
      PROMPT
    end

    def build_user_prompt(analysis)
      {
        objective: 'Write a concise, neutral bid-review analysis. No award recommendation.',
        output_schema: {
          title: 'string',
          leader: ['string'],
          leader_review: ['string'],
          high_variance_rows: ['string'],
          watch_out: 'string'
        },
        package: {
          bid_package_id: @bid_package.id,
          name: @bid_package.name
        },
        analysis_meta: analysis['meta'] || analysis[:meta] || {},
        winner: analysis['winner'] || analysis[:winner] || {},
        best_price_win_counts: analysis['best_price_win_counts'] || analysis[:best_price_win_counts] || [],
        coverage_gaps: analysis['coverage_gaps'] || analysis[:coverage_gaps] || [],
        watch_out_seed: analysis['watch_out_seed'] || analysis[:watch_out_seed],
        top_anomalies: Array(analysis['topAnomalies'] || analysis[:topAnomalies]).first(10).map do |row|
          {
            code_tag: row['codeTag'] || row[:codeTag],
            product: row['product'] || row[:product],
            spread_pct: row['spreadPct'] || row[:spreadPct],
            impact: row['impact'] || row[:impact],
            reason: row['reason'] || row[:reason]
          }
        end,
        rules: [
          'Output format is strict: title, leader, leader_review, high_variance_rows, watch_out',
          'Do not add follow_up or any extra fields',
          'leader: state gap in dollars and percent; if any vendor wins >70% of rows in best_price_win_counts, flag it in a second line',
          'leader_review: flag rows where the leading bid stands out; list priority codes; one guidance line max',
          'high_variance_rows: row codes only, no metrics',
          'watch_out: one sentence, must reference specific row codes, vendor names, or dollar figures from this package',
          'Use watch_out_seed as the basis for watch_out. You may tighten the wording but must preserve the vendor emails, row code, and dollar figures.',
          'No award recommendation, no speculation words, no claim that bids are wrong'
        ]
      }.to_json
    end

    def enriched_analysis_payload
      analysis = @deterministic_payload.is_a?(Hash) ? @deterministic_payload.deep_dup : {}
      analysis['best_price_win_counts'] ||= best_price_win_counts
      analysis['coverage_gaps'] ||= coverage_gaps
      analysis['watch_out_seed'] ||= watch_out_seed(analysis)
      analysis
    end

    def comparison_payload
      @comparison_payload ||= Comparison::BidPackageComparisonService.new(bid_package: @bid_package).call
    end

    def best_price_win_counts
      dealers = Array(comparison_payload[:dealers] || comparison_payload['dealers'])
      wins_by_invite_id = Hash.new(0)
      comparable_rows = 0

      Array(comparison_payload[:rows] || comparison_payload['rows']).each do |row|
        priced_cells = Array(row[:dealers] || row['dealers']).each_with_object([]) do |cell, memo|
          extended = cell[:extended_price] || cell['extended_price']
          next if extended.nil?

          memo << { invite_id: cell[:invite_id] || cell['invite_id'], extended: extended.to_d }
        end
        next if priced_cells.empty?

        comparable_rows += 1
        min_extended = priced_cells.map { |cell| cell[:extended] }.min
        priced_cells.each do |cell|
          wins_by_invite_id[cell[:invite_id]] += 1 if cell[:extended] == min_extended
        end
      end

      dealers.map do |dealer|
        invite_id = dealer[:invite_id] || dealer['invite_id']
        {
          label: dealer_label(dealer),
          wins: wins_by_invite_id[invite_id],
          of: comparable_rows
        }
      end
    end

    def coverage_gaps
      dealers = Array(comparison_payload[:dealers] || comparison_payload['dealers'])
      total_dealer_count = dealers.length
      grouped = {}

      Array(comparison_payload[:rows] || comparison_payload['rows']).each do |row|
        priced_invite_ids = Array(row[:dealers] || row['dealers']).each_with_object([]) do |cell, memo|
          extended = cell[:extended_price] || cell['extended_price']
          invite_id = cell[:invite_id] || cell['invite_id']
          memo << invite_id if invite_id.present? && !extended.nil?
        end.uniq
        next if priced_invite_ids.empty? || priced_invite_ids.length == total_dealer_count

        labels = priced_invite_ids.each_with_object([]) do |invite_id, memo|
          dealer = dealers.find { |entry| (entry[:invite_id] || entry['invite_id']) == invite_id }
          memo << dealer_label(dealer) if dealer
        end
        next if labels.empty?

        category_label = coverage_category_label(row)
        key = [category_label, labels.sort]
        grouped[key] ||= { category: category_label, rows: [], priced_by: labels.sort }
        code = row[:sku] || row['sku']
        grouped[key][:rows] << code.to_s.strip if code.present?
      end

      grouped.values.map do |entry|
        entry[:rows] = entry[:rows].uniq
        entry
      end.reject { |entry| entry[:rows].empty? }
        .sort_by { |entry| [-entry[:rows].length, entry[:category].to_s] }
        .first(10)
    end

    def coverage_category_label(row)
      category = (row[:category] || row['category']).to_s.strip
      code = (row[:sku] || row['sku']).to_s.strip
      prefix = code[/\A[A-Za-z]+/]
      return category if prefix.blank?
      return "#{category} (#{prefix}-*)" if category.present?

      "#{prefix}-*"
    end

    def dealer_label(dealer)
      return '' unless dealer

      email = dealer[:dealer_email] || dealer['dealer_email']
      label = email.to_s.strip
      return label if label.present?

      name = dealer[:dealer_name] || dealer['dealer_name']
      name.to_s.strip
    end

    def default_watch_out(analysis)
      seed = analysis['watch_out_seed'] || analysis[:watch_out_seed]
      return seed.to_s.strip if seed.present?

      first_gap = Array(analysis['coverage_gaps'] || analysis[:coverage_gaps]).first
      return '' unless first_gap.is_a?(Hash)

      category = first_gap['category'] || first_gap[:category]
      rows = Array(first_gap['rows'] || first_gap[:rows]).first(3).join(', ')
      priced_by = Array(first_gap['priced_by'] || first_gap[:priced_by]).join(', ')
      [category, rows, priced_by].all?(&:present?) ? "#{category} is only priced by #{priced_by} on rows #{rows}." : ''
    end

    def computed_win_rate_flag(analysis)
      win_counts = analysis[:best_price_win_counts] ||
        analysis['best_price_win_counts'] ||
        analysis[:bestPriceWinCounts] ||
        analysis['bestPriceWinCounts']
      Rails.logger.info("[BidAnalysis] win_counts: #{win_counts.inspect}") if defined?(Rails) && Rails.respond_to?(:logger)
      counts = Array(win_counts)
      return nil if counts.empty?

      top = counts.max_by do |entry|
        wins = entry[:wins] || entry['wins']
        of = entry[:of] || entry['of']
        wins.to_f / of.to_f
      end
      return nil unless top

      wins = top[:wins] || top['wins']
      of = top[:of] || top['of']
      label = top[:label] || top['label']
      wins_value = wins.to_f
      of_value = of.to_f
      rate = wins_value / of_value
      Rails.logger.info("[BidAnalysis] win_rate_flag: #{nil.inspect}") if (!of_value.positive? || rate <= 0.70) && defined?(Rails) && Rails.respond_to?(:logger)
      return nil unless of_value.positive? && rate > 0.70

      email = label.to_s.strip
      return nil if email.blank? || wins.blank? || of.blank?

      flag = "#{email} has the lowest price on #{wins} of #{of} rows. This is atypical — confirm this bidder's scope, quantities, and product interpretation before award."
      Rails.logger.info("[BidAnalysis] win_rate_flag: #{flag.inspect}") if defined?(Rails) && Rails.respond_to?(:logger)
      flag
    end

    def watch_out_seed(analysis)
      row = Array(analysis['topAnomalies'] || analysis[:topAnomalies]).first
      return nil unless row.is_a?(Hash)

      code = (row['codeTag'] || row[:codeTag]).to_s.strip
      min_bid = row['minBid'] || row[:minBid]
      max_bid = row['maxBid'] || row[:maxBid]
      low_email = (min_bid && (min_bid['label'] || min_bid[:label])).to_s.strip
      high_email = (max_bid && (max_bid['label'] || max_bid[:label])).to_s.strip
      low_amount = min_bid && (min_bid['extended'] || min_bid[:extended])
      high_amount = max_bid && (max_bid['extended'] || max_bid[:extended])
      return nil if code.blank? || low_email.blank? || high_email.blank? || low_amount.blank? || high_amount.blank?

      "#{low_email} prices #{code} at #{money(low_amount)} vs #{high_email} at #{money(high_amount)} — confirm scope and quantity before award."
    end

    def money(value)
      amount = format('%.2f', value.to_d)
      whole, fractional = amount.split('.')
      whole_with_commas = whole.reverse.gsub(/(\d{3})(?=\d)/, '\\1,').reverse
      "$#{whole_with_commas}.#{fractional}"
    end

    def post_to_openai(api_key:, body:)
      http = Net::HTTP.new(OPENAI_URI.host, OPENAI_URI.port)
      http.use_ssl = true
      http.read_timeout = 60

      request = Net::HTTP::Post.new(OPENAI_URI.request_uri)
      request['Authorization'] = "Bearer #{api_key}"
      request['Content-Type'] = 'application/json'
      request.body = body.to_json

      response = http.request(request)
      response_body = response.body.to_s
      parsed = JSON.parse(response_body)
      unless response.code.to_i.between?(200, 299)
        log_error(
          'OpenAI bid analysis request failed',
          status: response.code.to_i,
          body: response_body,
          bid_package_id: @bid_package.id
        )
        raise parsed['error'].is_a?(Hash) ? parsed['error']['message'].to_s : "HTTP #{response.code}"
      end
      parsed
    rescue JSON::ParserError => error
      log_error(
        'OpenAI bid analysis response was not valid JSON',
        error: error.message,
        status: response&.code.to_i,
        body: response_body,
        bid_package_id: @bid_package.id
      )
      raise
    end

    def normalize_lines(value, min:, max:)
      lines = Array(value).map { |line| line.to_s.strip }.reject(&:empty?).first(max)
      return lines if lines.length >= min

      lines
    end

    def normalize_text(value, fallback:)
      text = value.to_s.strip
      text.present? ? text : fallback
    end

    def log_error(message, details = {})
      logger = defined?(Rails) && Rails.respond_to?(:logger) ? Rails.logger : nil
      return unless logger

      logger.error("[BidResponseAiSynthesisService] #{message} #{details.to_json}")
    rescue StandardError
      nil
    end
  end
end
