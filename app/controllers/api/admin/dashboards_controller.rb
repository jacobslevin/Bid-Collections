module Api
  module Admin
    class DashboardsController < Api::BaseController
      def show
        bid_package = BidPackage.includes(
          :bid_award_events,
          :spec_item_requirement_approvals,
          :post_award_uploads,
          invites: { bid: [:bid_submission_versions, :bid_line_items] }
        ).find(params[:bid_package_id])
        current_award_snapshot = latest_award_comparison_snapshot_for(bid_package)
        excluded_spec_item_ids = if bid_package.awarded?
          Array(current_award_snapshot['excluded_spec_item_ids'] || current_award_snapshot[:excluded_spec_item_ids]).map(&:to_i).uniq
        else
          []
        end
        active_spec_items = bid_package.spec_items.active.select(:id, :quantity)
        active_spec_item_ids = active_spec_items.map(&:id)
        active_spec_quantities = active_spec_items.each_with_object({}) do |item, memo|
          memo[item.id] = item.quantity
        end
        total_requested = active_spec_item_ids.length

        current_awarded_bid_id = bid_package.awarded_bid_id
        current_award_snapshot = if current_awarded_bid_id.present?
          bid_package
            .bid_award_events
            .where(to_bid_id: current_awarded_bid_id, event_type: %w[award reassign])
            .order(awarded_at: :desc, id: :desc)
            .limit(1)
            .pick(:awarded_amount_snapshot)
        end

        rows = bid_package.invites.map do |invite|
          bid = invite.bid
          latest_version = bid&.bid_submission_versions&.maximum(:version_number) || 0
          latest_total_amount = bid&.bid_submission_versions&.order(version_number: :desc)&.limit(1)&.pick(:total_amount)
          total_range = total_range_for_bid(bid, active_spec_quantities)
          quote_summary = quote_summary_for_bid(bid, active_spec_item_ids, total_requested)

          {
            invite_id: invite.id,
            bid_id: bid&.id,
            dealer_name: invite.dealer_name,
            dealer_email: invite.dealer_email,
            invite_password: invite.password_plaintext,
            status: dashboard_status_for(bid),
            selection_status: bid&.selection_status || 'pending',
            access_state: invite.disabled? ? 'disabled' : 'enabled',
            current_version: latest_version,
            can_reclose: bid.present? && !bid.submitted? && latest_version.positive?,
            latest_total_amount: latest_total_amount,
            min_total_amount: total_range[:min_total],
            max_total_amount: total_range[:max_total],
            awarded_amount_snapshot: (bid&.id == current_awarded_bid_id ? current_award_snapshot : nil),
            total_requested_count: quote_summary[:total_requested],
            quoted_count: quote_summary[:quoted],
            bod_only_count: quote_summary[:bod_only],
            mixed_line_count: quote_summary[:mixed],
            sub_only_count: quote_summary[:sub_only],
            completion_pct: quote_summary[:completion_pct],
            bod_skipped_pct: quote_summary[:bod_skipped_pct],
            last_saved_at: bid&.updated_at,
            submitted_at: bid&.submitted_at,
            last_reopened_at: bid&.last_reopened_at,
            invite_url: "/invite/#{invite.token}"
          }
        end

        all_requirement_columns = PostAward::RequiredApprovalsService::REQUIREMENTS
        render json: {
          bid_package_id: bid_package.id,
          bid_package: {
            id: bid_package.id,
            name: bid_package.name,
            visibility: bid_package.visibility,
            instructions: bid_package.instructions,
            active_general_fields: bid_package.active_general_fields,
            awarded_bid_id: bid_package.awarded_bid_id,
            awarded_at: bid_package.awarded_at,
            public_url: bid_package.visibility_public? ? "/public/bid-packages/#{bid_package.public_token}" : nil
          },
          required_approval_columns: all_requirement_columns,
          current_awarded_bid_id: current_awarded_bid_id,
          spec_items: bid_package.spec_items
                                 .yield_self { |scope| excluded_spec_item_ids.any? ? scope.where.not(id: excluded_spec_item_ids) : scope }
                                 .order(:id)
                                 .map do |item|
            item_requirement_keys = PostAward::RequiredApprovalsService
                                    .requirements_for_spec_item(item)
                                    .map { |req| req[:key] }
            approvals_by_key = bid_package.spec_item_requirement_approvals
                                         .select { |approval| approval.spec_item_id == item.id && approval.bid_id == current_awarded_bid_id }
                                         .index_by(&:requirement_key)
            uploads = bid_package.post_award_uploads
                                 .select { |upload| upload.spec_item_id == item.id }
                                 .sort_by(&:created_at)
                                 .reverse
            {
              id: item.id,
              active: item.active?,
              code_tag: item.sku,
              product_name: item.product_name,
              brand_name: item.manufacturer,
              quantity: item.quantity,
              uom: item.uom,
              required_approvals: all_requirement_columns.map do |req|
                applies = item_requirement_keys.include?(req[:key])
                approval = approvals_by_key[req[:key]]
                {
                  key: req[:key],
                  label: req[:label],
                  applies: applies,
                  approved: applies && approval.present?,
                  approved_at: approval&.approved_at,
                  approved_by: approval&.approved_by
                }
              end,
              uploads: uploads.map do |upload|
                {
                  id: upload.id,
                  file_name: upload.file_name,
                  download_url: upload.file_available? ? "/api/bid_packages/#{bid_package.id}/post_award_uploads/#{upload.id}/download" : nil,
                  note: upload.note,
                  uploader_role: upload.uploader_role,
                  uploaded_by: upload.invite&.dealer_name || upload.uploader_role,
                  uploaded_at: upload.created_at
                }
              end
            }
          end,
          general_uploads: bid_package.post_award_uploads
                                      .select { |upload| upload.spec_item_id.nil? }
                                      .sort_by(&:created_at)
                                      .reverse
                                      .map do |upload|
            {
              id: upload.id,
              file_name: upload.file_name,
              download_url: upload.file_available? ? "/api/bid_packages/#{bid_package.id}/post_award_uploads/#{upload.id}/download" : nil,
              note: upload.note,
              uploader_role: upload.uploader_role,
              uploaded_by: upload.invite&.dealer_name || upload.uploader_role,
              uploaded_at: upload.created_at
            }
          end,
          invites: rows
        }
      end

      private

      def quote_summary_for_bid(bid, active_spec_item_ids, total_requested)
        return zero_quote_summary(total_requested) unless bid
        return zero_quote_summary(total_requested) if active_spec_item_ids.empty?

        by_spec_item = Hash.new { |h, k| h[k] = { bod: false, sub: false } }

        bid.bid_line_items.each do |line_item|
          spec_item_id = line_item.spec_item_id
          next unless active_spec_item_ids.include?(spec_item_id)
          next if line_item.unit_price.blank?

          if line_item.is_substitution?
            by_spec_item[spec_item_id][:sub] = true
          else
            by_spec_item[spec_item_id][:bod] = true
          end
        end

        bod_only = 0
        mixed = 0
        sub_only = 0

        by_spec_item.each_value do |flags|
          if flags[:bod] && flags[:sub]
            mixed += 1
          elsif flags[:bod]
            bod_only += 1
          elsif flags[:sub]
            sub_only += 1
          end
        end

        quoted = bod_only + mixed + sub_only
        rows_with_bod = bod_only + mixed
        bod_skipped_count = [total_requested - rows_with_bod, 0].max
        completion_pct = total_requested.positive? ? ((quoted.to_f / total_requested) * 100.0) : 0.0
        bod_skipped_pct = total_requested.positive? ? ((bod_skipped_count.to_f / total_requested) * 100.0) : 0.0

        {
          total_requested: total_requested,
          quoted: quoted,
          bod_only: bod_only,
          mixed: mixed,
          sub_only: sub_only,
          completion_pct: completion_pct.round(1),
          bod_skipped_pct: bod_skipped_pct.round(1)
        }
      end

      def zero_quote_summary(total_requested)
        {
          total_requested: total_requested,
          quoted: 0,
          bod_only: 0,
          mixed: 0,
          sub_only: 0,
          completion_pct: 0.0,
          bod_skipped_pct: 0.0
        }
      end

      def dashboard_status_for(bid)
        return 'not_started' unless bid
        return 'submitted' if bid.submitted?

        'in_progress'
      end

      def total_range_for_bid(bid, active_spec_quantities)
        return { min_total: nil, max_total: nil } unless bid
        return { min_total: nil, max_total: nil } if active_spec_quantities.empty?

        by_spec_item = Hash.new { |h, k| h[k] = { bod: nil, sub: nil } }

        bid.bid_line_items.each do |line_item|
          spec_item_id = line_item.spec_item_id
          next unless active_spec_quantities.key?(spec_item_id)
          next if line_item.unit_net_price.blank?

          if line_item.is_substitution?
            by_spec_item[spec_item_id][:sub] = line_item.unit_net_price.to_d
          else
            by_spec_item[spec_item_id][:bod] = line_item.unit_net_price.to_d
          end
        end

        min_subtotal = 0.to_d
        max_subtotal = 0.to_d
        priced_row_count = 0

        by_spec_item.each do |spec_item_id, prices|
          quantity = active_spec_quantities[spec_item_id]
          next unless quantity.present?

          options = [prices[:bod], prices[:sub]].compact
          next if options.empty?

          qty = quantity.to_d
          min_subtotal += options.min * qty
          max_subtotal += options.max * qty
          priced_row_count += 1
        end

        return { min_total: nil, max_total: nil } if priced_row_count.zero?

        general_total = bid.active_general_pricing_total
        {
          min_total: min_subtotal + general_total,
          max_total: max_subtotal + general_total
        }
      end

      def latest_award_comparison_snapshot_for(bid_package)
        event = bid_package.bid_award_events
                           .where(event_type: [BidAwardEvent.event_types[:award], BidAwardEvent.event_types[:reaward]])
                           .order(awarded_at: :desc, id: :desc)
                           .first
        event&.comparison_snapshot.is_a?(Hash) ? event.comparison_snapshot : {}
      end
    end
  end
end
