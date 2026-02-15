require_relative 'boot'

require 'rails'
require 'active_model/railtie'
require 'active_job/railtie'
require 'active_record/railtie'
require 'action_controller/railtie'
require 'action_view/railtie'
require 'action_mailer/railtie'
require 'active_storage/engine'
require 'action_cable/engine'
require 'rails/test_unit/railtie'

Bundler.require(*Rails.groups)

module BidCollections
  class Application < Rails::Application
    config.load_defaults 7.1
    config.api_only = true

    config.secret_key_base = ENV.fetch('SECRET_KEY_BASE', 'dev-secret-key-base')

    # Dealer invite unlock uses signed cookies in API mode.
    config.middleware.use ActionDispatch::Cookies
    config.middleware.use ActionDispatch::Session::CookieStore, key: '_bid_collections_session'

    config.generators do |g|
      g.test_framework :rspec
      g.helper false
      g.assets false
      g.view_specs false
      g.helper_specs false
      g.routing_specs false
      g.request_specs true
      g.controller_specs false
    end
  end
end
