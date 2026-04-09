module Api
  module Dp
    class BaseController < Api::BaseController
      include Api::ServiceAuth

      before_action :authenticate_service!
    end
  end
end

