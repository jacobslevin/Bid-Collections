require 'csv'

module Exports
  class BidPackageComparisonCsvService
    def initialize(bid_package:)
      @bid_package = bid_package
    end

    def call
      comparison = Comparison::BidPackageComparisonService.new(bid_package: @bid_package).call
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
      headers = %w[
        source_spec_item_id sku product_name image_url source_url manufacturer category notes description attributes_text nested_products quantity uom avg_unit_price best_unit_price
      ]

      dealers.each do |dealer|
        headers << "#{dealer[:dealer_name]}_unit_price"
        headers << "#{dealer[:dealer_name]}_delta"
      end

      headers
    end

    def build_row(row, dealers)
      out = [
        row[:source_spec_item_id],
        row[:sku],
        row[:product_name],
        row[:image_url],
        row[:source_url],
        row[:manufacturer],
        row[:category],
        row[:notes],
        row[:description],
        row[:attributes_text],
        row[:nested_products],
        row[:quantity],
        row[:uom],
        row[:avg_unit_price],
        row[:best_unit_price]
      ]

      dealers.each do |dealer|
        cell = row[:dealers].find { |d| d[:invite_id] == dealer[:invite_id] }
        out << cell&.dig(:unit_price)
        out << cell&.dig(:delta)
      end

      out
    end
  end
end
