module Api
  module Dealer
    class InvitesController < BaseController
      skip_before_action :ensure_active_invite!, only: :show

      def show
        render json: {
          invite: {
            dealer_name: @invite.dealer_name,
            project_name: @invite.bid_package.project.name,
            bid_package_name: @invite.bid_package.name,
            disabled: @invite.disabled?,
            unlocked: unlocked_for_invite?
          }
        }
      end

      def unlock
        if @invite.authenticate(params.require(:password))
          @invite.update!(last_unlocked_at: Time.current)
          mark_unlocked!
          render json: { unlocked: true }
        else
          render json: { error: 'Invalid password' }, status: :unauthorized
        end
      end
    end
  end
end
