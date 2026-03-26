module BidCollections
  class Engine < ::Rails::Engine
    config.paths['config/routes.rb'] = File.expand_path('../../../config/engine_routes.rb', __FILE__)

    initializer 'bid_collections.append_migrations' do |app|
      next if app.root.to_s == root.to_s

      config.paths['db/migrate'].expanded.each do |expanded_path|
        app.config.paths['db/migrate'] << expanded_path
      end
    end
  end
end
