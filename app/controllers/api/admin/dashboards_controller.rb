module Api
  module Admin
    class DashboardsController < Api::BaseController
      def show
        bid_package = BidPackage.includes(invites: { bid: :bid_submission_versions }).find(params[:bid_package_id])

        rows = bid_package.invites.map do |invite|
          bid = invite.bid
          latest_version = bid&.bid_submission_versions&.maximum(:version_number) || 0

          {
            invite_id: invite.id,
            dealer_name: invite.dealer_name,
            dealer_email: invite.dealer_email,
            invite_password: invite.password_plaintext,
            status: dashboard_status_for(bid),
            access_state: invite.disabled? ? 'disabled' : 'enabled',
            current_version: latest_version,
            can_reclose: bid.present? && !bid.submitted? && latest_version.positive?,
            last_saved_at: bid&.updated_at,
            submitted_at: bid&.submitted_at,
            last_reopened_at: bid&.last_reopened_at,
            invite_url: "/invite/#{invite.token}"
          }
        end

        render json: {
          bid_package_id: bid_package.id,
          bid_package: {
            id: bid_package.id,
            name: bid_package.name,
            visibility: bid_package.visibility,
            instructions: bid_package.instructions,
            active_general_fields: bid_package.active_general_fields,
            public_url: bid_package.visibility_public? ? "/public/bid-packages/#{bid_package.public_token}" : nil
          },
          invites: rows
        }
      end

      private

      def dashboard_status_for(bid)
        return 'not_started' unless bid
        return 'submitted' if bid.submitted?

        'in_progress'
      end
    end
  end
end
