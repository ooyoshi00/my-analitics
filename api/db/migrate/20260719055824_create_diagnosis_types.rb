class CreateDiagnosisTypes < ActiveRecord::Migration[8.1]
  def change
    create_table :diagnosis_types do |t|
      t.references :diagnosis, null: false, foreign_key: true
      t.string :code, null: false
      t.string :name, null: false
      t.text :description, null:false

      t.timestamps
    end
    add_index :diagnosis_types, [:diagnosis_id, :code], unique: true
  end
end
