module Api
  module Admin
    class InvitesController < Api::BaseController
      def create
        bid_package = BidPackage.find(params[:bid_package_id])

        invite = bid_package.invites.new(invite_params)

        if invite.save
          render json: {
            invite: invite.slice(:id, :dealer_name, :dealer_email, :token, :created_at),
            invite_url: "/invite/#{invite.token}"
          }, status: :created
        else
          render_unprocessable!(invite.errors.full_messages)
        end
      end

      private

      def invite_params
        params.require(:invite).permit(:dealer_name, :dealer_email, :password, :password_confirmation)
      end
    end
  end
end
