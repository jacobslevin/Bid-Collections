module Api
  module Dealer
    class BidsController < BaseController
      before_action :ensure_unlocked!
      before_action :load_bid

      def show
        line_items_by_spec = @bid.bid_line_items.group_by(&:spec_item_id)

        spec_rows = @invite.bid_package.spec_items.order(:id).flat_map do |item|
          lines = line_items_by_spec[item.id] || []
          basis_line = lines.find { |line| !line.is_substitution? }
          substitution_line = lines.find(&:is_substitution?)

          rows = [build_basis_row(item, basis_line)]
          rows << build_substitution_row(item, substitution_line) if substitution_line.present?
          rows
        end

        render json: {
          bid: {
            id: @bid.id,
            state: @bid.state,
            submitted_at: @bid.submitted_at,
            project_name: @invite.bid_package.project.name,
            bid_package_name: @invite.bid_package.name,
            instructions: @invite.bid_package.instructions,
            active_general_fields: @invite.bid_package.active_general_fields,
            delivery_amount: @bid.delivery_amount,
            install_amount: @bid.install_amount,
            escalation_amount: @bid.escalation_amount,
            contingency_amount: @bid.contingency_amount,
            sales_tax_amount: @bid.sales_tax_amount,
            line_items: spec_rows
          }
        }
      end

      def update
        if @bid.submitted?
          return render json: { error: 'Bid already submitted and locked' }, status: :conflict
        end

        ActiveRecord::Base.transaction do
          submitted_keys = {}

          line_items_params.each do |line_item|
            spec_item_id = line_item[:spec_item_id].to_i
            is_substitution = ActiveModel::Type::Boolean.new.cast(line_item[:is_substitution])

            attrs = line_item.to_h.slice(
              'unit_price',
              'discount_percent',
              'tariff_percent',
              'lead_time_days',
              'dealer_notes',
              'substitution_product_name',
              'substitution_brand_name'
            )

            @bid.bid_line_items.find_or_initialize_by(
              spec_item_id: spec_item_id,
              is_substitution: is_substitution
            ).update!(attrs)

            submitted_keys[[spec_item_id, is_substitution]] = true
          end

          @bid.bid_line_items.each do |line_item|
            key = [line_item.spec_item_id, line_item.is_substitution?]
            line_item.destroy! unless submitted_keys[key]
          end

          @bid.update!({ state: :draft }.merge(pricing_params.to_h))
        end

        render json: { saved: true, state: @bid.state, updated_at: @bid.reload.updated_at }
      rescue ActiveRecord::RecordInvalid => e
        render_unprocessable!(e.record.errors.full_messages)
      end

      def submit
        if @bid.submitted?
          return render json: { error: 'Bid already submitted' }, status: :conflict
        end

        ActiveRecord::Base.transaction do
          @bid.update!(state: :submitted, submitted_at: Time.current)
          @bid.create_submission_version!
        end

        render json: { submitted: true, submitted_at: @bid.submitted_at }
      end

      private

      def load_bid
        @bid = @invite.bid || @invite.create_bid!
      end

      def build_basis_row(item, line)
        {
          spec_item_id: item.id,
          sku: item.sku,
          product_name: item.product_name,
          brand_name: item.manufacturer,
          quantity: item.quantity,
          uom: item.uom,
          is_substitution: false,
          unit_price: line&.unit_price,
          discount_percent: line&.discount_percent,
          tariff_percent: line&.tariff_percent,
          unit_net_price: line&.unit_net_price,
          lead_time_days: line&.lead_time_days,
          dealer_notes: line&.dealer_notes
        }
      end

      def build_substitution_row(item, line)
        {
          spec_item_id: item.id,
          sku: item.sku,
          product_name: line&.substitution_product_name,
          brand_name: line&.substitution_brand_name,
          quantity: item.quantity,
          uom: item.uom,
          is_substitution: true,
          unit_price: line&.unit_price,
          discount_percent: line&.discount_percent,
          tariff_percent: line&.tariff_percent,
          unit_net_price: line&.unit_net_price,
          lead_time_days: line&.lead_time_days,
          dealer_notes: line&.dealer_notes,
          substitution_product_name: line&.substitution_product_name,
          substitution_brand_name: line&.substitution_brand_name
        }
      end

      def line_items_params
        params.require(:line_items).map do |item|
          item.permit(
            :spec_item_id,
            :is_substitution,
            :unit_price,
            :discount_percent,
            :tariff_percent,
            :lead_time_days,
            :dealer_notes,
            :substitution_product_name,
            :substitution_brand_name
          )
        end
      end

      def pricing_params
        return ActionController::Parameters.new unless params[:pricing].present?

        params.require(:pricing).permit(:delivery_amount, :install_amount, :escalation_amount, :contingency_amount, :sales_tax_amount)
      end
    end
  end
end
