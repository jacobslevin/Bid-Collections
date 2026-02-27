module Exports
  class BidPackageComparisonXlsxService
    def initialize(
      bid_package:,
      price_modes: {},
      excluded_spec_item_ids: [],
      comparison_mode: 'average',
      show_product: true,
      show_brand: true,
      show_lead_time: false,
      show_notes: false
    )
      @bid_package = bid_package
      @price_modes = price_modes || {}
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

        base_count = base_headers.length
        per_dealer_count = dealer_column_count
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

        base_widths = []
        base_widths << 11 # code tag
        base_widths << 20 if @show_product
        base_widths << 16 if @show_brand
        base_widths << 10 # qty/uom
        if include_average_columns?
          base_widths << 11
          base_widths << 12
        end

        dealer_widths = dealers.flat_map do
          widths = [11] # unit
          widths << 11 if @show_lead_time
          widths << 20 if @show_notes
          widths << 9  # quote type
          widths << 12 # extended
          widths << 11 if include_delta_column?
          widths
        end
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
      headers = base_headers.dup

      dealers.each do |_dealer|
        headers << 'unit_price'
        headers << 'lead_time_days' if @show_lead_time
        headers << 'notes' if @show_notes
        headers << 'quote_type'
        headers << 'extended_price'
        headers << 'percent_avg_delta' if include_delta_column?
      end

      headers.map { |value| format_header_label(value) }
    end

    def build_row(row, dealers, currency_style, percent_style)
      base_values = [row[:sku]]
      types = [:string]
      styles = [nil]

      if @show_product
        base_values << row[:product_name]
        types << :string
        styles << nil
      end
      if @show_brand
        base_values << row[:manufacturer]
        types << :string
        styles << nil
      end
      base_values << qty_uom(row[:quantity], row[:uom])
      types << :string
      styles << nil

      if include_average_columns?
        base_values << numeric_or_nil(row[:avg_unit_price])
        base_values << extended_price(row[:avg_unit_price], row[:quantity])
        types.concat([:float, :float])
        styles.concat([currency_style, currency_style])
      end

      dealers.each do |dealer|
        cell = row[:dealers].find { |d| d[:invite_id] == dealer[:invite_id] }
        unit_price = numeric_or_nil(cell&.dig(:unit_price))
        avg_price = numeric_or_nil(row[:avg_unit_price])
        delta_ratio = percent_avg_delta_ratio(unit_price, avg_price)

        base_values << unit_price
        base_values << (cell&.dig(:lead_time_days) || nil) if @show_lead_time
        base_values << (cell&.dig(:dealer_notes) || nil) if @show_notes
        base_values << quote_type_label(cell)
        base_values << extended_price(unit_price, row[:quantity])
        base_values << delta_ratio if include_delta_column?

        types << :float
        styles << currency_style
        if @show_lead_time
          types << :string
          styles << nil
        end
        if @show_notes
          types << :string
          styles << nil
        end
        types << :string
        styles << nil
        types << :float
        styles << currency_style
        if include_delta_column?
          types << :float
          styles << percent_style
        end
      end

      [base_values, types, styles]
    end

    def base_headers
      headers = ['code_tag']
      headers << 'product' if @show_product
      headers << 'brand' if @show_brand
      headers << 'qty_uom'
      if include_average_columns?
        headers << 'avg_unit_price'
        headers << 'avg_extended_price'
      end
      headers
    end

    def dealer_column_count
      count = 1 # unit
      count += 1 if @show_lead_time
      count += 1 if @show_notes
      count += 1 # quote_type
      count += 1 # extended
      count += 1 if include_delta_column?
      count
    end

    def include_average_columns?
      @comparison_mode == 'average'
    end

    def include_delta_column?
      @comparison_mode != 'none'
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
