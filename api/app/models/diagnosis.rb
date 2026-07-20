class Diagnosis < ApplicationRecord # ApplicationRecordという親クラスからの継承
    has_many :diagnosis_types, dependent: :destroy # DiagnosisモデルはDiagnosisTypeモデルを複数持つことができる（1対多の関係）

    validates :name, presence: true # name属性が必須であることを検証
    validates :slug, presence: true, uniqueness: true # slug属性が必須であり、かつ一意であることを検証
end
