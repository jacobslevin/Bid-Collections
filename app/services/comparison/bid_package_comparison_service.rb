module Comparison
  class BidPackageComparisonService
    def initialize(bid_package:)
      @bid_package = bid_package
    end

    def call
      submitted_bids = @bid_package.invites.includes(bid: :bid_line_items).map(&:bid).compact.select(&:submitted?)
      dealers = submitted_bids.map { |b| { invite_id: b.invite_id, dealer_name: b.invite.dealer_name } }

      rows = @bid_package.spec_items.order(:id).map do |spec_item|
        line_prices = submitted_bids.filter_map do |bid|
          line = bid.bid_line_items.find { |li| li.spec_item_id == spec_item.id }
          line&.unit_price
        end

        avg = line_prices.any? ? (line_prices.sum / line_prices.size).to_d.round(4) : nil

        dealer_cells = submitted_bids.map do |bid|
          line = bid.bid_line_items.find { |li| li.spec_item_id == spec_item.id }
          price = line&.unit_price
          {
            invite_id: bid.invite_id,
            unit_price: price,
            delta: avg && price ? (price - avg).round(4) : nil
          }
        end

        best_price = line_prices.min

        {
          spec_item_id: spec_item.id,
          source_spec_item_id: spec_item.spec_item_id,
          image_url: spec_item.image_url,
          source_url: spec_item.source_url,
          category: spec_item.category,
          manufacturer: spec_item.manufacturer,
          product_name: spec_item.product_name,
          sku: spec_item.sku,
          quantity: spec_item.quantity,
          uom: spec_item.uom,
          notes: spec_item.notes,
          description: spec_item.description,
          attributes_text: spec_item.attributes_text,
          nested_products: spec_item.nested_products,
          avg_unit_price: avg,
          best_unit_price: best_price,
          dealers: dealer_cells
        }
      end

      {
        bid_package_id: @bid_package.id,
        dealers: dealers,
        rows: rows
      }
    end
  end
end
