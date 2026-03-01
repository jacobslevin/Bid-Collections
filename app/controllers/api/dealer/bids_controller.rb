module Api
  module Dealer
    class BidsController < BaseController
      before_action :ensure_unlocked!
      before_action :ensure_package_not_awarded!, only: [:update, :submit]
      before_action :load_bid

      def show
        bid_package = @invite.bid_package
        line_items_by_spec = @bid.bid_line_items.group_by(&:spec_item_id)
        winner_view = bid_package.awarded? && (bid_package.awarded_bid_id == @bid.id)
        comparison_snapshot = winner_view ? latest_award_comparison_snapshot_for(bid_package, @bid.id) : {}
        excluded_spec_item_ids = Array(comparison_snapshot['excluded_spec_item_ids'] || comparison_snapshot[:excluded_spec_item_ids]).map(&:to_i).uniq

        spec_scope = bid_package.spec_items.active.order(:id)
        spec_scope = spec_scope.where.not(id: excluded_spec_item_ids) if winner_view && excluded_spec_item_ids.any?

        spec_rows = spec_scope.flat_map do |item|
          lines = line_items_by_spec[item.id] || []
          basis_line = lines.find { |line| !line.is_substitution? }
          substitution_line = lines.find(&:is_substitution?)

          if winner_view
            selected_mode = selected_mode_for(item.id, @invite.id, comparison_snapshot)
            selected_line =
              if selected_mode == 'alt'
                substitution_line || basis_line
              elsif selected_mode == 'bod'
                basis_line || substitution_line
              else
                basis_line || substitution_line
              end

            [build_awarded_row(item, selected_line, selected_mode)]
          else
            rows = [build_basis_row(item, basis_line)]
            rows << build_substitution_row(item, substitution_line) if substitution_line.present?
            rows
          end
        end

        render json: {
          bid: {
            id: @bid.id,
            state: @bid.state,
            submitted_at: @bid.submitted_at,
            project_name: bid_package.project.name,
            bid_package_name: bid_package.name,
            instructions: bid_package.instructions,
            active_general_fields: bid_package.active_general_fields,
            post_award_enabled: bid_package.awarded?,
            awarded_vendor: bid_package.awarded_bid_id == @bid.id,
            post_award_uploads: bid_package.post_award_uploads
                                         .where(invite_id: @invite.id)
                                         .order(created_at: :desc)
                                         .map do |upload|
              {
                id: upload.id,
                file_name: upload.file_name,
                note: upload.note,
                spec_item_id: upload.spec_item_id,
                download_url: upload.file_available? ? "/api/invites/#{@invite.token}/post_award_uploads/#{upload.id}/download" : nil,
                uploaded_at: upload.created_at
              }
            end,
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

        active_spec_item_ids = @invite.bid_package.spec_items.active.pluck(:id).to_set

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
            next unless active_spec_item_ids.include?(line_item.spec_item_id)

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

      def create_post_award_upload
        bid_package = @invite.bid_package
        bid = @invite.bid
        return render json: { error: 'Bid package is not awarded' }, status: :conflict unless bid_package.awarded?
        unless bid && bid.id == bid_package.awarded_bid_id
          return render json: { error: 'Only the awarded vendor can upload post-award files' }, status: :forbidden
        end

        spec_item_id = params[:spec_item_id].presence
        spec_item = nil
        if spec_item_id.present?
          spec_item = bid_package.spec_items.active.find(spec_item_id)
        end

        uploaded_file = params[:file]
        upload = bid_package.post_award_uploads.create!(
          spec_item: spec_item,
          invite: @invite,
          uploader_role: :vendor,
          file_name: uploaded_file&.original_filename.presence || params.require(:file_name),
          note: params[:note]
        )
        upload.persist_uploaded_file!(uploaded_file) if uploaded_file.present?

        render json: {
          uploaded: true,
          upload: {
            id: upload.id,
            file_name: upload.file_name,
            note: upload.note,
            spec_item_id: upload.spec_item_id,
            download_url: upload.file_available? ? "/api/invites/#{@invite.token}/post_award_uploads/#{upload.id}/download" : nil,
            uploaded_at: upload.created_at
          }
        }, status: :created
      rescue StandardError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      end

      def download_post_award_upload
        upload = @invite.bid_package.post_award_uploads.where(invite_id: @invite.id).find(params[:upload_id])
        return render json: { error: 'Uploaded file not found' }, status: :not_found unless upload.file_available?

        send_file upload.stored_file_path,
                  filename: upload.file_name,
                  type: upload.content_type.presence || 'application/octet-stream',
                  disposition: 'attachment'
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

      def build_awarded_row(item, line, selected_mode)
        mode = selected_mode.presence || (line&.is_substitution? ? 'alt' : 'bod')
        {
          spec_item_id: item.id,
          sku: item.sku,
          product_name: line&.is_substitution? ? line&.substitution_product_name : item.product_name,
          brand_name: line&.is_substitution? ? line&.substitution_brand_name : item.manufacturer,
          quantity: item.quantity,
          uom: item.uom,
          is_substitution: mode == 'alt',
          approved_source: mode,
          unit_price: line&.unit_price,
          discount_percent: line&.discount_percent,
          tariff_percent: line&.tariff_percent,
          unit_net_price: line&.unit_net_price,
          lead_time_days: line&.lead_time_days,
          dealer_notes: line&.dealer_notes
        }
      end

      def selected_mode_for(spec_item_id, invite_id, comparison_snapshot)
        raw = comparison_snapshot.is_a?(Hash) ? comparison_snapshot : {}
        cell_map = raw['cell_price_mode'] || raw[:cell_price_mode] || {}
        by_spec = cell_map[spec_item_id.to_s] || cell_map[spec_item_id.to_i]
        mode = if by_spec.is_a?(Hash)
                 by_spec[invite_id.to_s] || by_spec[invite_id.to_i]
               end
        %w[bod alt].include?(mode) ? mode : nil
      end

      def latest_award_comparison_snapshot_for(bid_package, bid_id)
        event = bid_package.bid_award_events
                           .where(to_bid_id: bid_id, event_type: [BidAwardEvent.event_types[:award], BidAwardEvent.event_types[:reaward]])
                           .order(awarded_at: :desc, id: :desc)
                           .first
        event&.comparison_snapshot.is_a?(Hash) ? event.comparison_snapshot : {}
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

      def ensure_package_not_awarded!
        return unless @invite.bid_package.awarded?

        render json: { error: 'Bid package has already been awarded and is now locked' }, status: :conflict
      end
    end
  end
end
