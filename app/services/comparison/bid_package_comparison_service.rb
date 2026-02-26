module Comparison
  class BidPackageComparisonService
    def initialize(bid_package:, price_modes: {}, excluded_spec_item_ids: [])
      @bid_package = bid_package
      @price_modes = price_modes || {}
      @excluded_spec_item_ids = Array(excluded_spec_item_ids).map(&:to_i).uniq
    end

    def call
      submitted_bids = @bid_package.invites.includes(bid: :bid_line_items).map(&:bid).compact.select(&:submitted?)
      dealers = submitted_bids.map do |b|
        {
          invite_id: b.invite_id,
          dealer_name: b.invite.dealer_name,
          delivery_amount: b.delivery_amount,
          install_amount: b.install_amount,
          escalation_amount: b.escalation_amount,
          contingency_amount: b.contingency_amount,
          sales_tax_amount: b.sales_tax_amount
        }
      end

      rows = @bid_package.spec_items
                         .where.not(id: @excluded_spec_item_ids)
                         .order(:id)
                         .map do |spec_item|
        line_prices = submitted_bids.filter_map do |bid|
          selected_line_item_for_spec_item(bid, spec_item.id, dealer_price_mode_for_invite(bid.invite_id))&.unit_net_price
        end

        avg = line_prices.any? ? (line_prices.sum / line_prices.size).to_d.round(4) : nil

        dealer_cells = submitted_bids.map do |bid|
          details = line_item_details_for_spec_item(bid, spec_item.id, dealer_price_mode_for_invite(bid.invite_id))
          price = details[:selected_line]&.unit_net_price
          {
            invite_id: bid.invite_id,
            unit_price: price,
            delta: avg && price ? (price - avg).round(4) : nil,
            quote_type: details[:selected_line].present? ? (details[:selected_line].is_substitution? ? 'alt' : 'bod') : nil,
            has_bod_price: details[:basis_line].present?,
            has_alt_price: details[:substitution_line].present?,
            bod_unit_price: details[:basis_line]&.unit_net_price,
            alt_unit_price: details[:substitution_line]&.unit_net_price,
            alt_product_name: details[:substitution_line]&.substitution_product_name,
            alt_brand_name: details[:substitution_line]&.substitution_brand_name
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
        active_general_fields: @bid_package.active_general_fields,
        dealers: dealers,
        rows: rows
      }
    end

    private

    def dealer_price_mode_for_invite(invite_id)
      raw = @price_modes[invite_id.to_s] || @price_modes[invite_id.to_i]
      raw.to_s.downcase == 'alt' ? 'alt' : 'bod'
    end

    def selected_line_item_for_spec_item(bid, spec_item_id, preferred_mode)
      details = line_item_details_for_spec_item(bid, spec_item_id, preferred_mode)
      details[:selected_line]
    end

    def line_item_details_for_spec_item(bid, spec_item_id, preferred_mode)
      lines = bid.bid_line_items.select { |line| line.spec_item_id == spec_item_id }
      return { selected_line: nil, basis_line: nil, substitution_line: nil } if lines.empty?

      basis_priced = lines.find { |line| !line.is_substitution? && line.unit_price.present? }
      substitution_priced = lines.find { |line| line.is_substitution? && line.unit_price.present? }
      selected_line =
        if basis_priced && substitution_priced
          preferred_mode == 'alt' ? substitution_priced : basis_priced
        else
          basis_priced || substitution_priced
        end

      selected_line ||= lines.find { |line| !line.is_substitution? } || lines.find(&:is_substitution?)

      {
        selected_line: selected_line,
        basis_line: basis_priced,
        substitution_line: substitution_priced
      }
    end
  end
end
