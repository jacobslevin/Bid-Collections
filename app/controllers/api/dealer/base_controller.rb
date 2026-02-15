module Api
  module Dealer
    class BaseController < Api::BaseController
      before_action :load_invite

      private

      def load_invite
        @invite = Invite.find_by!(token: params[:token])
      end

      def ensure_unlocked!
        return if unlocked_for_invite? || recently_unlocked_for_invite?

        render json: { error: 'Invite is locked' }, status: :unauthorized
      end

      def unlocked_for_invite?
        unlocked = cookies.signed[:unlocked_invites]
        unlocked.is_a?(Array) && unlocked.include?(@invite.token)
      end

      def mark_unlocked!
        unlocked = cookies.signed[:unlocked_invites]
        unlocked = [] unless unlocked.is_a?(Array)

        unlocked << @invite.token unless unlocked.include?(@invite.token)

        cookies.signed[:unlocked_invites] = {
          value: unlocked,
          httponly: true,
          same_site: :lax,
          expires: 7.days.from_now
        }
      end

      def recently_unlocked_for_invite?
        @invite.last_unlocked_at.present? && @invite.last_unlocked_at > 12.hours.ago
      end
    end
  end
end
