require 'csv'

module Exports
  class BidPackageComparisonCsvService
    def initialize(bid_package:, price_modes: {}, excluded_spec_item_ids: [])
      @bid_package = bid_package
      @price_modes = price_modes || {}
      @excluded_spec_item_ids = Array(excluded_spec_item_ids).map(&:to_i).uniq
    end

    def call
      comparison = Comparison::BidPackageComparisonService.new(
        bid_package: @bid_package,
        price_modes: @price_modes,
        excluded_spec_item_ids: @excluded_spec_item_ids
      ).call
      dealers = comparison[:dealers]

      CSV.generate(headers: true) do |csv|
        csv << build_headers(dealers)

        comparison[:rows].each do |row|
          csv << build_row(row, dealers)
        end
      end
    end

    private

    def build_headers(dealers)
      headers = %w[code_tag product brand qty_uom avg_unit_price avg_extended_price]

      dealers.each do |dealer|
        label = dealer_header_label(dealer[:dealer_name])
        headers << "#{label}_unit_price"
        headers << "#{label}_quote_type"
        headers << "#{label}_extended_price"
        headers << "#{label}_percent_avg_delta"
      end

      headers.map { |value| format_header_label(value) }
    end

    def build_row(row, dealers)
      out = [
        row[:sku],
        row[:product_name],
        row[:manufacturer],
        qty_uom(row[:quantity], row[:uom]),
        row[:avg_unit_price],
        extended_price(row[:avg_unit_price], row[:quantity])
      ]

      dealers.each do |dealer|
        cell = row[:dealers].find { |d| d[:invite_id] == dealer[:invite_id] }
        unit_price = cell&.dig(:unit_price)

        out << unit_price
        out << quote_type_label(cell)
        out << extended_price(unit_price, row[:quantity])
        out << percent_avg_delta(unit_price, row[:avg_unit_price])
      end

      out
    end

    def extended_price(unit_price, quantity)
      return nil if unit_price.blank? || quantity.blank?

      unit_price.to_d * quantity.to_d
    end

    def percent_avg_delta(unit_price, avg_unit_price)
      return nil if unit_price.blank? || avg_unit_price.blank?

      avg = avg_unit_price.to_d
      return nil if avg.zero?

      (((unit_price.to_d - avg) / avg) * 100).round(4)
    end

    def qty_uom(quantity, uom)
      qty = quantity.blank? ? '—' : quantity.to_s
      unit = uom.blank? ? '' : " #{uom}"
      "#{qty}#{unit}"
    end

    def dealer_header_label(dealer_name)
      raw = dealer_name.to_s
      company = raw.split(/\s[-–—]\s/, 2).first.to_s.strip
      company.present? ? company : raw
    end

    def quote_type_label(cell)
      quote_type = cell&.dig(:quote_type).to_s.downcase
      return nil if quote_type.blank?
      return 'BoD' if quote_type == 'bod'

      if quote_type == 'alt'
        product = cell&.dig(:alt_product_name).to_s.strip
        brand = cell&.dig(:alt_brand_name).to_s.strip
        details = []
        details << "Product: #{product}" if product.present?
        details << "Brand: #{brand}" if brand.present?
        return details.any? ? "Sub (#{details.join('; ')})" : 'Sub'
      end

      quote_type
    end

    def format_header_label(value)
      label = value.to_s.tr('_', ' ').upcase
      label.gsub(/\bPERCENT\b/, '%')
    end
  end
end
