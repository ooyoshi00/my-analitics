module Api
  class SessionsController < ApplicationController
    allow_unauthenticated_access only: [:create]

    def create
      if (user = User.authenticate_by(email_address: params[:email_address], password: params[:password]))
        start_new_session_for(user)
        render json: { id: user.id, email_address: user.email_address }, status: :created
      else
        render json: { error: "メールアドレスまたはパスワードが違います" }, status: :unauthorized
      end
    end

    def destroy
      terminate_session
      head :no_content
    end
  end
end