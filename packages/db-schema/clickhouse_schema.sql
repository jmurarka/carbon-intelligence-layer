-- ClickHouse Schema: High-Volume Analytics Event Logs

CREATE TABLE IF NOT EXISTS usage_logs (
    event_time DateTime,
    event_date Date,
    partner_id UUID,
    client_ip String,
    device_type LowCardinality(String), -- 'mobile_app', 'web'
    action_type LowCardinality(String), -- 'score_lookup', 'checkout_summary', 'suggestions_lookup', 'catalog_upload'
    sku String,
    category_id String,
    co2e_calculated Float32,
    co2e_saved Float32 DEFAULT 0.0,
    latency_ms UInt32
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (partner_id, action_type, event_date);
