Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    if ENV['CORS_ORIGINS'].present?
      origins(*ENV.fetch('CORS_ORIGINS').split(','))
    else
      origins(%r{\Ahttp://localhost:\d+\z}, %r{\Ahttp://127\.0\.0\.1:\d+\z})
    end

    resource '*',
             headers: :any,
             methods: [:get, :post, :put, :patch, :delete, :options, :head],
             credentials: true
  end
end
