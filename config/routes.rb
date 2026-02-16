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

      resources :bid_packages, only: [:index, :destroy] do
        resources :invites, only: [:create, :destroy] do
          member do
            get :history
            post :reopen
            patch :password
          end
        end
        get :dashboard, to: 'dashboards#show'
        get :comparison, to: 'comparisons#show'
        get :export, to: 'exports#show', defaults: { format: :csv }
      end
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
