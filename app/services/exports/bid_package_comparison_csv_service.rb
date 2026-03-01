require 'csv'

module Exports
  class BidPackageComparisonCsvService
    def initialize(
      bid_package:,
      price_modes: {},
      cell_price_modes: {},
      excluded_spec_item_ids: [],
      comparison_mode: 'average',
      show_product: true,
      show_brand: true,
      show_lead_time: false,
      show_notes: false
    )
      @bid_package = bid_package
      @price_modes = price_modes || {}
      @cell_price_modes = cell_price_modes || {}
      @excluded_spec_item_ids = Array(excluded_spec_item_ids).map(&:to_i).uniq
      @comparison_mode = comparison_mode.to_s
      @show_product = show_product
      @show_brand = show_brand
      @show_lead_time = show_lead_time
      @show_notes = show_notes
    end

    def call
      comparison = Comparison::BidPackageComparisonService.new(
        bid_package: @bid_package,
        price_modes: @price_modes,
        cell_price_modes: @cell_price_modes,
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
      headers = %w[code_tag]
      headers << 'product' if @show_product
      headers << 'brand' if @show_brand
      headers << 'qty_uom'
      if include_average_columns?
        headers << 'avg_unit_price'
        headers << 'avg_extended_price'
      end

      dealers.each do |dealer|
        label = dealer_header_label(dealer[:dealer_name])
        headers << "#{label}_unit_price"
        headers << "#{label}_lead_time_days" if @show_lead_time
        headers << "#{label}_notes" if @show_notes
        headers << "#{label}_quote_type"
        headers << "#{label}_extended_price"
        headers << "#{label}_percent_avg_delta" if include_delta_column?
      end

      headers.map { |value| format_header_label(value) }
    end

    def build_row(row, dealers)
      out = [row[:sku]]
      out << row[:product_name] if @show_product
      out << row[:manufacturer] if @show_brand
      out << qty_uom(row[:quantity], row[:uom])
      if include_average_columns?
        out << row[:avg_unit_price]
        out << extended_price(row[:avg_unit_price], row[:quantity])
      end

      dealers.each do |dealer|
        cell = row[:dealers].find { |d| d[:invite_id] == dealer[:invite_id] }
        unit_price = cell&.dig(:unit_price)

        out << unit_price
        out << (cell&.dig(:lead_time_days) || nil) if @show_lead_time
        out << (cell&.dig(:dealer_notes) || nil) if @show_notes
        out << quote_type_label(cell)
        out << extended_price(unit_price, row[:quantity])
        out << percent_avg_delta(unit_price, row[:avg_unit_price]) if include_delta_column?
      end

      out
    end

    def include_average_columns?
      @comparison_mode == 'average'
    end

    def include_delta_column?
      @comparison_mode != 'none'
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
        product = cell&.dig(:selected_alt_product_name).to_s.strip
        product = cell&.dig(:alt_product_name).to_s.strip if product.blank?
        brand = cell&.dig(:selected_alt_brand_name).to_s.strip
        brand = cell&.dig(:alt_brand_name).to_s.strip if brand.blank?
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
