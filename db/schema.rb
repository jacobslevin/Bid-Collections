# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[7.1].define(version: 2026_02_26_170000) do
  create_table "bid_line_items", charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_id", null: false
    t.bigint "spec_item_id", null: false
    t.decimal "unit_price", precision: 12, scale: 4
    t.string "lead_time_days"
    t.text "dealer_notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.decimal "discount_percent", precision: 6, scale: 3
    t.decimal "tariff_percent", precision: 6, scale: 3
    t.boolean "is_substitution", default: false, null: false
    t.string "substitution_product_name"
    t.string "substitution_brand_name"
    t.index ["bid_id", "spec_item_id", "is_substitution"], name: "index_bid_line_items_on_bid_spec_substitution", unique: true
    t.index ["bid_id"], name: "index_bid_line_items_on_bid_id"
    t.index ["spec_item_id", "unit_price"], name: "index_bid_line_items_on_spec_item_id_and_unit_price"
    t.index ["spec_item_id"], name: "index_bid_line_items_on_spec_item_id"
  end

  create_table "bid_packages", charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "project_id", null: false
    t.string "name", null: false
    t.string "source_filename", null: false
    t.datetime "imported_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "visibility", default: 0, null: false
    t.json "active_general_fields", null: false
    t.string "public_token"
    t.text "instructions"
    t.index ["project_id", "created_at"], name: "index_bid_packages_on_project_id_and_created_at"
    t.index ["project_id"], name: "index_bid_packages_on_project_id"
    t.index ["public_token"], name: "index_bid_packages_on_public_token", unique: true
  end

  create_table "bid_submission_versions", charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_id", null: false
    t.integer "version_number", null: false
    t.datetime "submitted_at", null: false
    t.decimal "total_amount", precision: 14, scale: 2
    t.json "line_items_snapshot", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["bid_id", "submitted_at"], name: "index_bid_submission_versions_on_bid_id_and_submitted_at"
    t.index ["bid_id", "version_number"], name: "index_bid_submission_versions_on_bid_id_and_version_number", unique: true
    t.index ["bid_id"], name: "index_bid_submission_versions_on_bid_id"
  end

  create_table "bids", charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "invite_id", null: false
    t.integer "state", default: 0, null: false
    t.datetime "submitted_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "last_reopened_at"
    t.string "last_reopen_reason"
    t.decimal "delivery_amount", precision: 14, scale: 2
    t.decimal "install_amount", precision: 14, scale: 2
    t.decimal "escalation_amount", precision: 14, scale: 2
    t.decimal "sales_tax_amount", precision: 14, scale: 2
    t.decimal "contingency_amount", precision: 14, scale: 2
    t.index ["invite_id"], name: "index_bids_on_invite_id", unique: true
    t.index ["state"], name: "index_bids_on_state"
  end

  create_table "invites", charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_package_id", null: false
    t.string "dealer_name", null: false
    t.string "dealer_email"
    t.string "token", null: false
    t.string "password_digest", null: false
    t.datetime "last_unlocked_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "password_plaintext"
    t.boolean "disabled", default: false, null: false
    t.index ["bid_package_id", "dealer_name"], name: "index_invites_on_bid_package_id_and_dealer_name"
    t.index ["bid_package_id"], name: "index_invites_on_bid_package_id"
    t.index ["disabled"], name: "index_invites_on_disabled"
    t.index ["token"], name: "index_invites_on_token", unique: true
  end

  create_table "projects", charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "spec_items", charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_package_id", null: false
    t.string "spec_item_id", null: false
    t.string "category", null: false
    t.string "manufacturer", null: false
    t.string "product_name", null: false
    t.string "sku", null: false
    t.text "description", null: false
    t.decimal "quantity", precision: 12, scale: 3, null: false
    t.string "uom", null: false
    t.string "finish"
    t.string "color"
    t.string "location"
    t.string "dimensions"
    t.string "link"
    t.string "image_url"
    t.string "source_url"
    t.text "attributes_text"
    t.text "nested_products"
    t.text "notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "active", default: true, null: false
    t.index ["bid_package_id", "active"], name: "index_spec_items_on_bid_package_id_and_active"
    t.index ["bid_package_id", "sku"], name: "index_spec_items_on_bid_package_id_and_sku"
    t.index ["bid_package_id", "spec_item_id"], name: "index_spec_items_on_bid_package_id_and_spec_item_id", unique: true
    t.index ["bid_package_id"], name: "index_spec_items_on_bid_package_id"
  end

  add_foreign_key "bid_line_items", "bids"
  add_foreign_key "bid_line_items", "spec_items"
  add_foreign_key "bid_packages", "projects"
  add_foreign_key "bid_submission_versions", "bids"
  add_foreign_key "bids", "invites"
  add_foreign_key "invites", "bid_packages"
  add_foreign_key "spec_items", "bid_packages"
end
