module Api
  module Admin
    class InvitesController < Api::BaseController
      before_action :load_bid_package

      def create
        invite = @bid_package.invites.new(invite_params)
        invite.password_plaintext = invite_params[:password]

        if invite.save
          render json: {
            invite: invite.slice(:id, :dealer_name, :dealer_email, :token, :created_at, :password_plaintext),
            invite_url: "/invite/#{invite.token}"
          }, status: :created
        else
          render_unprocessable!(invite.errors.full_messages)
        end
      end

      def destroy
        invite = @bid_package.invites.find(params[:id])
        invite.destroy!

        render json: { deleted: true, invite_id: invite.id }
      end

      def history
        invite = @bid_package.invites.includes(bid: :bid_submission_versions).find(params[:id])
        bid = invite.bid
        versions = (bid&.bid_submission_versions || []).order(version_number: :desc)

        render json: {
          invite_id: invite.id,
          dealer_name: invite.dealer_name,
          current_version: versions.maximum(:version_number) || 0,
          versions: versions.map do |version|
            {
              id: version.id,
              version_number: version.version_number,
              submitted_at: version.submitted_at,
              total_amount: version.total_amount,
              line_items: version.line_items_snapshot
            }
          end
        }
      end

      def reopen
        invite = @bid_package.invites.includes(:bid).find(params[:id])
        bid = invite.bid

        unless bid&.submitted?
          return render json: { error: 'Only submitted bids can be reopened' }, status: :conflict
        end

        bid.update!(
          state: :draft,
          submitted_at: nil,
          last_reopened_at: Time.current,
          last_reopen_reason: params[:reason].to_s.strip.presence
        )

        render json: {
          reopened: true,
          state: bid.state,
          last_reopened_at: bid.last_reopened_at
        }
      end

      def password
        invite = @bid_package.invites.find(params[:id])
        new_password = params[:password].to_s

        if new_password.blank?
          return render_unprocessable!('Password cannot be blank')
        end

        invite.update!(
          password: new_password,
          password_confirmation: new_password,
          password_plaintext: new_password
        )

        render json: { updated: true, invite_id: invite.id }
      rescue ActiveRecord::RecordInvalid => e
        render_unprocessable!(e.record.errors.full_messages)
      end

      private

      def load_bid_package
        @bid_package = BidPackage.find(params[:bid_package_id])
      end

      def invite_params
        params.require(:invite).permit(:dealer_name, :dealer_email, :password, :password_confirmation)
      end
    end
  end
end
