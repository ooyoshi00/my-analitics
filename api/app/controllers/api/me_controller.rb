module Api
  class MeController < ApplicationController
    def show
      render json: { id: current_user.id, email_address: current_user.email_address }
    end
  end
end