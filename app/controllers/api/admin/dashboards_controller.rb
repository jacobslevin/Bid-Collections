module Api
  module Admin
    class DashboardsController < Api::BaseController
      def show
        bid_package = BidPackage.includes(invites: :bid).find(params[:bid_package_id])

        rows = bid_package.invites.map do |invite|
          bid = invite.bid

          {
            invite_id: invite.id,
            dealer_name: invite.dealer_name,
            dealer_email: invite.dealer_email,
            status: dashboard_status_for(bid),
            last_saved_at: bid&.updated_at,
            submitted_at: bid&.submitted_at,
            invite_url: "/invite/#{invite.token}"
          }
        end

        render json: { bid_package_id: bid_package.id, invites: rows }
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
