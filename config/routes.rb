Rails.application.routes.draw do
  namespace :api, defaults: { format: :json } do
    scope module: :admin do
      resources :projects, only: [:index, :create, :destroy]

      resources :projects, only: [] do
        resources :bid_packages, only: [:create] do
          collection do
            post :preview
          end
        end
      end

      resources :bid_packages, only: [:index, :destroy, :update] do
        member do
          post :import_rows
          patch 'spec_items/:spec_item_id/deactivate', to: 'bid_packages#deactivate_spec_item'
          patch 'spec_items/:spec_item_id/reactivate', to: 'bid_packages#reactivate_spec_item'
        end

        resources :invites, only: [:create, :destroy] do
          collection do
            post :bulk_disable
            post :bulk_enable
            post :bulk_reopen
            post :bulk_destroy
          end

          member do
            get :history
            post :reopen
            post :reclose
            patch :password
            patch :disable
            patch :enable
          end
        end
        get :dashboard, to: 'dashboards#show'
        get :comparison, to: 'comparisons#show'
        get :export, to: 'exports#show'
      end
    end

    scope module: :public do
      get 'public/bid_packages/:token', to: 'bid_packages#show'
    end

    scope module: :dealer do
      get 'invites/:token', to: 'invites#show'
      post 'invites/:token/unlock', to: 'invites#unlock'

      get 'invites/:token/bid', to: 'bids#show'
      put 'invites/:token/bid', to: 'bids#update'
      post 'invites/:token/bid/submit', to: 'bids#submit'
    end
  end
end
