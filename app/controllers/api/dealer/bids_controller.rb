module Api
  module Dealer
    class BidsController < BaseController
      before_action :ensure_unlocked!
      before_action :load_bid

      def show
        existing_line_items = @bid.bid_line_items.index_by(&:spec_item_id)
        spec_rows = @invite.bid_package.spec_items.order(:id).map do |item|
          line = existing_line_items[item.id]
          {
            spec_item_id: item.id,
            sku: item.sku,
            product_name: item.product_name,
            brand_name: item.manufacturer,
            quantity: item.quantity,
            uom: item.uom,
            unit_price: line&.unit_price,
            discount_percent: line&.discount_percent,
            tariff_percent: line&.tariff_percent,
            unit_net_price: line&.unit_net_price,
            lead_time_days: line&.lead_time_days,
            dealer_notes: line&.dealer_notes
          }
        end

        render json: {
          bid: {
            id: @bid.id,
            state: @bid.state,
            submitted_at: @bid.submitted_at,
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
          line_items_params.each do |line_item|
            @bid.bid_line_items.find_or_initialize_by(spec_item_id: line_item[:spec_item_id]).update!(line_item)
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

      def line_items_params
        params.require(:line_items).map do |item|
          item.permit(:spec_item_id, :unit_price, :discount_percent, :tariff_percent, :lead_time_days, :dealer_notes)
        end
      end

      def pricing_params
        return ActionController::Parameters.new unless params[:pricing].present?

        params.require(:pricing).permit(:delivery_amount, :install_amount, :escalation_amount, :contingency_amount, :sales_tax_amount)
      end
    end
  end
end
