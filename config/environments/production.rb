require 'active_support/core_ext/integer/time'

Rails.application.configure do
  config.cache_classes = true
  config.eager_load = true
  config.consider_all_requests_local = false
  config.action_controller.perform_caching = true

  config.public_file_server.enabled = ENV['RAILS_SERVE_STATIC_FILES'].present?

  config.log_level = ENV.fetch('RAILS_LOG_LEVEL', 'info')
  config.log_tags = [:request_id]

  config.active_job.queue_adapter = :async

  config.force_ssl = ENV['FORCE_SSL'].present?
end
