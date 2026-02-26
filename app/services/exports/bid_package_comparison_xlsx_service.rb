module Exports
  class BidPackageComparisonXlsxService
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

      package = Axlsx::Package.new
      workbook = package.workbook

      workbook.add_worksheet(name: 'Comparison') do |sheet|
        header_style = workbook.styles.add_style(
          b: true,
          bg_color: 'F1F5F9',
          border: { style: :thin, color: 'D1D5DB' },
          alignment: { horizontal: :center, vertical: :center, wrap_text: true }
        )
        currency_style = workbook.styles.add_style(num_fmt: 5)
        percent_style = workbook.styles.add_style(format_code: '0.00%')

        base_count = 6
        per_dealer_count = 4
        total_columns = base_count + (dealers.length * per_dealer_count)

        group_headers = Array.new(total_columns, '')
        dealers.each_with_index do |dealer, index|
          start_col = base_count + (index * per_dealer_count)
          end_col = start_col + per_dealer_count - 1
          group_headers[start_col] = dealer_header_label(dealer[:dealer_name])
          sheet.merge_cells("#{excel_col_name(start_col)}1:#{excel_col_name(end_col)}1")
        end

        sheet.add_row(group_headers, style: Array.new(total_columns, header_style))

        headers = build_headers(dealers)
        sheet.add_row(headers, style: Array.new(headers.length, header_style))
        sheet.rows.first.height = 28
        sheet.rows[1].height = 46

        comparison[:rows].each do |row|
          values, types, styles = build_row(row, dealers, currency_style, percent_style)
          sheet.add_row(values, types: types, style: styles)
        end

        base_widths = [11, 20, 16, 10, 11, 12]
        dealer_widths = dealers.flat_map { [11, 9, 12, 11] }
        sheet.column_widths(*(base_widths + dealer_widths))

        sheet.sheet_view.pane do |pane|
          pane.top_left_cell = 'A3'
          pane.state = :frozen
          pane.y_split = 2
        end
      end

      package.to_stream.read
    end

    private

    def build_headers(dealers)
      headers = [
        'code_tag', 'product', 'brand', 'qty_uom', 'avg_unit_price', 'avg_extended_price'
      ]

      dealers.each do |_dealer|
        headers << 'unit_price'
        headers << 'quote_type'
        headers << 'extended_price'
        headers << 'percent_avg_delta'
      end

      headers.map { |value| format_header_label(value) }
    end

    def build_row(row, dealers, currency_style, percent_style)
      base_values = [
        row[:sku],
        row[:product_name],
        row[:manufacturer],
        qty_uom(row[:quantity], row[:uom]),
        numeric_or_nil(row[:avg_unit_price]),
        extended_price(row[:avg_unit_price], row[:quantity])
      ]

      types = [
        :string, :string, :string, :string, :float, :float
      ]

      styles = Array.new(base_values.length)
      styles[4] = currency_style
      styles[5] = currency_style

      dealers.each do |dealer|
        cell = row[:dealers].find { |d| d[:invite_id] == dealer[:invite_id] }
        unit_price = numeric_or_nil(cell&.dig(:unit_price))
        avg_price = numeric_or_nil(row[:avg_unit_price])
        delta_ratio = percent_avg_delta_ratio(unit_price, avg_price)

        base_values << unit_price
        base_values << quote_type_label(cell)
        base_values << extended_price(unit_price, row[:quantity])
        base_values << delta_ratio

        types.concat([:float, :string, :float, :float])
        styles.concat([currency_style, nil, currency_style, percent_style])
      end

      [base_values, types, styles]
    end

    def numeric_or_nil(value)
      return nil if value.blank?

      value.to_d.to_f
    end

    def extended_price(unit_price, quantity)
      unit = numeric_or_nil(unit_price)
      qty = numeric_or_nil(quantity)
      return nil if unit.nil? || qty.nil?

      unit * qty
    end

    def percent_avg_delta_ratio(unit_price, avg_unit_price)
      return nil if unit_price.nil? || avg_unit_price.nil? || avg_unit_price.zero?

      (unit_price - avg_unit_price) / avg_unit_price
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

    def excel_col_name(zero_based_index)
      n = zero_based_index.to_i + 1
      out = +''
      while n > 0
        n -= 1
        out.prepend((65 + (n % 26)).chr)
        n /= 26
      end
      out
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
      value.to_s.tr('_', ' ').upcase.gsub(/\bPERCENT\b/, '%')
    end
  end
end
