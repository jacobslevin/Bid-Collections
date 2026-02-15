module Api
  class BaseController < ApplicationController
    private

    def render_unprocessable!(errors)
      render json: { errors: Array(errors) }, status: :unprocessable_entity
    end
  end
end
