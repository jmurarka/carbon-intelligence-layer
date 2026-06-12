# Carbon Companion: Architecture Blueprint
### Embedded Carbon-Intelligence Layer (SDK, API & Widgets)

---

## 1. Requirements Analysis

### 1.1 Functional Requirements
"Carbon Companion" operates as a frictionless, embedded layer inside host applications (e-commerce, food delivery, grocery, and ride-booking). The functional requirements focus on providing clear, real-time insights without requiring changes to user purchasing behaviors.

*   **Carbon Scoring & Attribution**:
    *   **Products & Groceries**: Calculate carbon footprint (kg $CO_2e$) per unit or weight based on category, brand, origin, and packaging.
    *   **Rides & Logistics**: Calculate travel-related carbon footprint based on transport mode (EV, hybrid, ICE, motorcycle), distance, fuel type, and passenger count.
    *   **Orders & Deliveries**: Calculate aggregate footprint for a multi-item checkout basket, adding delivery logistics overhead.
*   **Real-time Label Rendering**:
    *   Frictionless SDK-driven widget mounting on host apps (e.g., search results, product details pages, cart views, checkout summaries).
    *   Support for clean visual badges representing impact tiering (e.g., Low / Medium / High, or Eco-Score A-E).
*   **Checkout Carbon Summary**:
    *   Visualize total carbon cost at checkout.
    *   Provide equivalent contextual comparisons (e.g., "equivalent to driving X miles") to make carbon metrics tangible.
    *   Provide micro-offsetting opportunities (e.g., "Add $0.12 to plant a tree / fund carbon removal").
*   **Alternative Suggestions (Eco-Swapping)**:
    *   Provide intelligent, lower-carbon alternatives in real-time (e.g., "Swap for local apples and save 0.4kg $CO_2e$," or "Switch to EV ride for $0.50 more").
    *   Track and credit "Carbon Saved" metrics to user profiles upon choosing alternatives.

### 1.2 Non-Functional Requirements
To prevent degrading the host application's user experience or page-load speed, Carbon Companion adheres to strict non-functional bounds.

*   **Ultra-Low Latency (<200ms Target)**:
    *   The SDK must fetch and render carbon labels within 200ms. If calls exceed 200ms, the SDK must fail silently (gracefully hide), ensuring zero disruption to the host app's Core Web Vitals (specifically LCP and CLS).
*   **Scalability**:
    *   Scale to support millions of SKUs across multiple large enterprise partners simultaneously.
    *   Handle ingestion of multi-million item catalogs and process high peak traffic (e.g., Black Friday, lunchtime rush for food delivery) exceeding 50,000 requests per second (RPS).
*   **Multi-Tenant Isolation**:
    *   Ensure logical separation of tenant data, catalogs, customer transaction logs, and usage metrics.
    *   Support custom tenant-level rules (e.g., specific store locations, custom delivery fleet profiles, proprietary packaging assumptions).
*   **Security & Compliance**:
    *   Provide secure API-key authentication for widgets and backend-to-backend calls.
    *   Fulfill zero-PII data transfer policies. The SDK must only read product IDs, quantity, transport mode, and distance, avoiding transmission of user identities or addresses.

---

## 2. System Architecture

The architecture uses a service-oriented, API-first structure designed to offload heavy computations, optimize database read performance, and distribute assets globally via edge nodes.

```mermaid
graph TD
    subgraph Host Application (Client Browser / App)
        SDK[Carbon Companion JS SDK / Widget]
        HostApp[Host E-Commerce App]
    end

    subgraph Edge / CDN Layer
        Cloudflare[Cloudflare CDN / Edge Rules]
    end

    subgraph Integration Gateway
        APIGateway[API Gateway / Kong]
    end

    subgraph Microservices Layer
        ScoringEngine[Carbon Scoring Engine]
        DataService[Carbon Data Service]
        AnalyticsService[Partner Analytics Service]
    end

    subgraph Cache & Storage Layer
        Redis[(Redis Cache Cluster)]
        Postgres[(PostgreSQL Master/Replica - Catalog & Config)]
        ClickHouse[(ClickHouse OLAP - Usage Logs & Analytics)]
    end

    subgraph Data Pipeline & ETL
        Pipeline[Airflow ETL Pipeline]
        LCADB[(LCA Databases: ecoinvent, DEFRA, Agribalyse)]
    end

    %% Client Interactions
    HostApp -->|Loads SDK| Cloudflare
    SDK -->|GET /v1/scores (Cached Widget Data)| Cloudflare
    Cloudflare -->|Cache Miss| APIGateway
    SDK -->|POST /v1/scores/batch /checkout| APIGateway

    %% Gateway Routing
    APIGateway -->|Route Score Requests| ScoringEngine
    APIGateway -->|Route Portal Traffic| AnalyticsService

    %% Service Dependencies
    ScoringEngine -->|Fetch Rules & Mappings| Redis
    ScoringEngine -->|Lookup Factors| DataService
    DataService -->|Query Factors / Precomputed Scores| Postgres
    DataService -.->|Cache Read/Write| Redis

    %% Analytics & Logging
    APIGateway -.->|Async Usage Logs| ClickHouse
    AnalyticsService -->|Read Aggregated Dashboard Metrics| ClickHouse
    AnalyticsService -->|Read Configurations| Postgres

    %% ETL Data Flow
    Pipeline -->|Import & Standardize Factors| Postgres
    LCADB -->|Daily/Weekly Updates| Pipeline
```

### 2.1 Component Specifications

1.  **Host App SDK / Widget**:
    *   A lightweight, zero-dependency JavaScript wrapper loaded asynchronously.
    *   Scans the DOM for specific data attributes (e.g., `data-carbon-sku`, `data-carbon-category`) and injects styling and carbon values.
    *   Leverages local browser cache (`localStorage` / `sessionStorage`) to store frequently seen SKU scores for a session, bypassing API hops.
2.  **API Gateway (Kong / Cloudflare Workers)**:
    *   Handles edge routing, multi-tenant API key validation, rate-limiting, and geo-routing.
    *   Serves as the TLS termination point and handles static CORS rules for partner domains.
3.  **Carbon Scoring Engine**:
    *   A stateless microservice that matches product details or travel parameters against emission factors.
    *   Applies tenant-specific rules (e.g., packaging offsets, regional grid mix adjustments) and falls back to hierarchical estimations if exact factors are missing.
4.  **Carbon Data Service**:
    *   Exposes a unified query interface for emission factor datasets (LCA indices, government reporting factors).
    *   Manages versioning of lifecycle assessment (LCA) databases to prevent sudden changes in carbon scoring historical records.
5.  **Partner Analytics Service**:
    *   Provides backend query logic for the partner-facing analytics dashboard.
    *   Pulls from a column-oriented database to display metrics like aggregate carbon avoided, popular green products, and widget impression stats.
6.  **Data Ingestion Pipeline (Airflow/dbt)**:
    *   Periodically pulls, normalizes, and integrates public/private LCA databases (ecoinvent, DEFRA, Agribalyse).
    *   Executes classification routines mapping raw product catalogs to normalized carbon database categories.

---

## 3. Tech Stack Recommendation

| Layer | Recommended Technology | Justification |
| :--- | :--- | :--- |
| **SDK & Widget** | Lit (Web Components) & TypeScript | Compiles to native Custom Elements with zero framework footprint (~5KB gzipped). Encapsulates styles via Shadow DOM, preventing host application CSS pollution. |
| **API Gateway** | Cloudflare Workers / Kong | Workers provide routing, tenant verification, and edge caching with <10ms execution overhead. Excellent for enforcing rate limits at the edge. |
| **Backend Services** | Go (Golang) | High concurrency (goroutines), minimal memory footprint, and rapid startup time. Matches the CPU-bound nature of the scoring engine's categorization and calculation rules. |
| **Transactional DB** | PostgreSQL (Amazon RDS) | Strong relational integrity for tenant configurations, API key mappings, and product catalogs. Read replicas satisfy geo-distributed read workloads. |
| **Analytics DB** | ClickHouse | A columnar database optimized for fast aggregates over billions of usage log records, powering real-time partner dashboards at low cost. |
| **Caching Layer** | Redis | Provides sub-millisecond lookups for precomputed SKU scores and holds active rate-limiting counters. |
| **Data Ingestion** | Apache Airflow + Python | Standard for handling diverse raw files (CSV, XML, JSON) from LCA providers, with libraries for matching, entity resolution, and data validation. |

---

## 4. Database Design

The data layer separates transactional configuration from high-volume usage log storage.

```
+------------------+         +------------------+         +-----------------------+
|  partners        |         |  partner_keys    |         |  partner_overrides    |
+------------------+         +------------------+         +-----------------------+
| PK partner_id    |<--------| PK key_id        |         | PK override_id        |
|    company_name  |         | FK partner_id    |         | FK partner_id         |
|    tier          |         |    hashed_key    |         |    category_id (null) |
|    created_at    |         |    status        |         |    sku (null)         |
+------------------+         |    created_at    |         |    custom_factor      |
         |                   +------------------+         +-----------------------+
         |
         |                   +-----------------------+
         |                   |  product_catalog      |
         |                   +-----------------------+
         +------------------>| PK catalog_item_id    |
         |                   | FK partner_id         |
         |                   |    sku                |
         |                   |    gtin               |
         |                   |    title              |
         |                   | FK category_id        |<----+
         |                   |    attributes (JSONB) |     |
         |                   +-----------------------+     |
         |                                                 |
         |                   +-----------------------+     |
         |                   |  categories           |     |
         |                   +-----------------------+     |
         +------------------>| PK category_id        |-----+
                             |    name               |
                             | FK parent_id          |
                             +-----------------------+
                                        ^
                                        |
+--------------------------+            |
|  emission_factors        |            |
+--------------------------+            |
| PK factor_id             |            |
|    source_dataset        |            |
|    source_code           |            |
|    co2e_per_kg           |            |
|    scope_type            |            |
| FK category_id           |------------+
|    valid_from            |
|    valid_to              |
+--------------------------+
```

### 4.1 Schema Definition (PostgreSQL)

```sql
-- Partner Accounts
CREATE TABLE partners (
    partner_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    industry_vertical VARCHAR(50) NOT NULL, -- 'ecommerce', 'grocery', 'delivery', 'transport'
    tier VARCHAR(20) DEFAULT 'standard', -- 'standard', 'enterprise'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Hashed Partner API Keys
CREATE TABLE partner_keys (
    key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES partners(partner_id) ON DELETE CASCADE,
    key_preview VARCHAR(10) NOT NULL, -- e.g., 'cc_live_ab7...'
    hashed_key VARCHAR(64) UNIQUE NOT NULL, -- SHA256 hash of API key
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'revoked'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Master Categories Hierarchy
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES categories(category_id),
    unspsc_code VARCHAR(20), -- Standardized classification code
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Global Emission Factors Registry
CREATE TABLE emission_factors (
    factor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_dataset VARCHAR(50) NOT NULL, -- 'ecoinvent', 'defra', 'agribalyse'
    source_code VARCHAR(100) NOT NULL,
    co2e_per_kg NUMERIC(10, 4) NOT NULL, -- CO2 equivalent in kg
    scope_type INT CHECK (scope_type IN (1, 2, 3)),
    category_id UUID REFERENCES categories(category_id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_to TIMESTAMP WITH TIME ZONE,
    metadata JSONB -- captures data quality scores, physical boundary info
);

-- Partner Custom Product Catalog
CREATE TABLE product_catalog (
    catalog_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES partners(partner_id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    gtin VARCHAR(14),
    title VARCHAR(255) NOT NULL,
    category_id UUID REFERENCES categories(category_id),
    attributes JSONB, -- stores origin, weight, packaging type
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(partner_id, sku)
);

-- Partner-Specific Score Overrides
CREATE TABLE partner_overrides (
    override_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES partners(partner_id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(category_id), -- applied to all SKUs in category
    sku VARCHAR(100), -- applied to specific SKU
    custom_factor NUMERIC(10, 4) NOT NULL, -- custom CO2e per kg override
    justification TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK (category_id IS NOT NULL OR sku IS NOT NULL)
);

-- Transport Emission Factors
CREATE TABLE transport_factors (
    transport_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mode_name VARCHAR(100) NOT NULL, -- 'ev_car', 'diesel_van', 'electric_scooter'
    co2e_per_km_passenger NUMERIC(10, 4) NOT NULL, -- kg CO2e per passenger km
    co2e_per_km_ton NUMERIC(10, 4) NOT NULL, -- kg CO2e per ton km
    source_dataset VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 ClickHouse Analytics Schema (High-Volume Logs)

```sql
CREATE TABLE usage_logs (
    event_time DateTime,
    event_date Date,
    partner_id UUID,
    client_ip String,
    device_type LowCardinality(String), -- 'mobile_app', 'web'
    action_type LowCardinality(String), -- 'score_lookup', 'checkout_summary', 'swap_clicked'
    sku String,
    category_id UUID,
    co2e_calculated Float32,
    co2e_saved Float32 DEFAULT 0.0,
    latency_ms UInt16
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (partner_id, action_type, event_date);
```

---

## 5. API Design

### 5.1 REST Authentication
All endpoints require a bearer API token passed in the request header:
`Authorization: Bearer <API_KEY>`

---

### 5.2 Endpoints Definition

#### `GET /v1/scores/product`
Retrieve the carbon score for a single product using query parameters. Useful for dynamic product details pages.

**Query Parameters**:
*   `sku` (String, required): Partner's product identifier.
*   `title` (String, optional): Fallback categorization if SKU is unmapped.
*   `category` (String, optional): Category string if available.
*   `weight_grams` (Integer, optional): Weight of product to apply mass-based footprint calculation.

**Response (`200 OK`)**:
```json
{
  "sku": "prod-99881",
  "co2e_kg": 1.42,
  "confidence_score": "high",
  "tier": "low", // low | medium | high
  "calculation_method": "exact_sku_match", // exact_sku_match | category_fallback | llm_approximation
  "comparison_statement": "equivalent to charging 173 smartphones",
  "breakdown": {
    "product_materials": 1.12,
    "packaging": 0.20,
    "transport_estimate": 0.10
  }
}
```

---

#### `POST /v1/scores/batch`
Batch lookups for list pages, search results, or cart lists. Maximum of 50 SKUs per payload.

**Request Body**:
```json
{
  "items": [
    { "sku": "sku-112", "title": "Organic Bananas", "weight_grams": 500 },
    { "sku": "sku-113", "title": "Almond Milk 1L", "weight_grams": 1000 }
  ]
}
```

**Response (`200 OK`)**:
```json
{
  "results": [
    {
      "sku": "sku-112",
      "co2e_kg": 0.45,
      "tier": "low",
      "calculation_method": "exact_sku_match"
    },
    {
      "sku": "sku-113",
      "co2e_kg": 0.70,
      "tier": "medium",
      "calculation_method": "category_fallback"
    }
  ]
}
```

---

#### `POST /v1/scores/checkout`
Calculates total checkout footprint and provides eco-alternatives comparison values.

**Request Body**:
```json
{
  "items": [
    { "sku": "sku-112", "quantity": 2, "price_cents": 399 },
    { "sku": "sku-113", "quantity": 1, "price_cents": 450 }
  ],
  "logistics": {
    "transport_mode": "diesel_van",
    "distance_km": 6.8
  }
}
```

**Response (`200 OK`)**:
```json
{
  "order_total_co2e_kg": 2.76,
  "logistics_co2e_kg": 1.16,
  "grand_total_co2e_kg": 3.92,
  "comparisons": {
    "miles_driven": 9.8,
    "tree_days_absorbed": 57
  },
  "offset_options": {
    "suggested_offset_cents": 12,
    "project_name": "Reforestation in Pacific Northwest"
  }
}
```

---

#### `GET /v1/scores/suggestions`
Provides alternative, lower-carbon product suggestions based on a reference SKU.

**Query Parameters**:
*   `sku` (String, required): The target product to replace.
*   `limit` (Integer, optional): Max results. Defaults to 3.

**Response (`200 OK`)**:
```json
{
  "original_sku": "sku-113",
  "original_co2e_kg": 0.70,
  "suggestions": [
    {
      "sku": "sku-554",
      "title": "Oat Milk 1L (Local)",
      "co2e_kg": 0.31,
      "co2e_saved_kg": 0.39,
      "price_cents": 420,
      "reasoning": "Oat milk consumes less water and land to produce compared to almonds."
    }
  ]
}
```

---

### 5.3 GraphQL Alternative (For Complex Checkout Frontends)
Useful when partners want to select specific fields (e.g., retrieving alternative descriptions alongside carbon scores in a single request).

```graphql
query GetProductScore($sku: String!, $includeAlternatives: Boolean!) {
  product(sku: $sku) {
    sku
    co2eKg
    tier
    calculationMethod
    alternatives(limit: 2) @include(if: $includeAlternatives) {
      sku
      title
      co2eKg
      co2eSavedKg
      priceCents
    }
  }
}
```

---

## 6. Monorepo Repository Structure

A monorepo structure using standard tools (such as Turborepo, pnpm workspaces, and TypeScript project references) keeps code sharing clear and simplifies deployment.

```
/carbon-companion (monorepo root)
├── apps/
│   ├── api/                   # Go API Gateway & scoring engine router
│   ├── portal/                # Next.js partner dashboard / admin interface
│   ├── data-pipeline/         # Python Airflow DAGs & matching ML tasks
│   └── docs/                  # API docs, integration manuals (Docusaurus)
├── packages/
│   ├── sdk-js/                # Lit-based frontend SDK containing:
│   │   ├── src/
│   │   │   ├── widgets/       # UI Web Components (badge, cart overlay)
│   │   │   ├── client.ts      # API consumer and caching wrappers
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── rollup.config.js
│   ├── scoring-core/          # Go logic library for carbon scoring rules
│   │   ├── scoring.go
│   │   └── scoring_test.go
│   ├── db-schema/             # Postgres & ClickHouse schema definitions
│   │   ├── migrations/
│   │   └── schema.prisma
│   └── shared-configs/        # Shared ESLint, TSConfig, Prettier configurations
├── docker/                    # Dockerfiles for services
├── pnpm-workspace.yaml        # pnpm workspaces config
├── turbo.json                 # Turborepo cache configuration
└── README.md
```

---

## 7. Carbon Scoring Methodology

The scoring methodology ensures users receive actionable footprint values while handling product catalog anomalies and missing source data.

```
                  +--------------------------------+
                  |  SKU Carbon Score Resolution  |
                  +--------------------------------+
                                  |
                                  v
                       [ Exact SKU Map Check ]
                       /                     \
                (Found)                       (Not Found)
                  /                                 \
                 v                                   v
      +----------------------+             [ GTIN/EAN Database Lookup ]
      |  Use Custom Override |             /                          \
      |   or Direct Mapping  |      (Found)                            (Not Found)
      +----------------------+        /                                      \
                                     v                                        v
                          +----------------------+                  [ Brand + Subcategory Match ]
                          | Apply Database Factor|                  /                           \
                          +----------------------+           (Found)                             (Not Found)
                                                               /                                       \
                                                              v                                         v
                                                   +----------------------+                    [ Parent Category Match ]
                                                   | Average Category Val |                    /                       \
                                                   +----------------------+             (Found)                         (Not Found)
                                                                                          /                                   \
                                                                                         v                                     v
                                                                              +----------------------+               +-----------------------+
                                                                              | Parent Category Avg  |               | Default Global Match  |
                                                                              +----------------------+               | (e.g. 1.5 kg CO2e/kg) |
                                                                                                                     +-----------------------+
```

### 7.1 Data Sources & LCA Integrations
*   **Primary Databases**: ecoinvent (global materials/processes), Agribalyse (groceries and agriculture), and DEFRA (UK Government factors for transport, fuels, and food).
*   **API Interconnectivity**: Integrates fallback calls to Climatiq or similar carbon APIs when processing highly localized transport corridors.
*   **Normalization Layer**: Converts input weights and categories into unified functional units (e.g., $kg\ CO_2e\ per\ kg$ of product, or $kg\ CO_2e\ per\ passenger\ km$).

---

### 7.2 Scoring Algorithm
1.  **Direct Mapping**: Extract product weight ($W_{kg}$), lookup standard category factor ($CF_{category\_id}$), and check for any tenant overrides ($OF_{sku}$).
    
    $$\text{Footprint}_{\text{product}} = W_{kg} \times (CF_{category\_id} + \text{PackagingFactor} + \text{LogisticsFactor})$$

2.  **Relative Categorization Tiers**: Scores are mapped to tiers relative to their category average (e.g., grocery item compared to other grocery items).
    *   **Low Impact (Tier A/B)**: Footprint is $< 1\ \sigma$ (standard deviation) below category median.
    *   **Medium Impact (Tier C)**: Footprint is within $\pm 1\ \sigma$ of category median.
    *   **High Impact (Tier D/E)**: Footprint is $> 1\ \sigma$ above category median.

---

### 7.3 Fallback and Estimation Tree
If direct product information is not available, the Scoring Engine resolves calculations down an estimation tree to guarantee a <200ms response time:

1.  **Exact Catalog Match**: Checks if the partner has mapped the SKU to an exact emission factor.
2.  **GTIN Match**: Resolves global barcode indexes (GTIN/EAN) against normalized brand carbon databases.
3.  **Specific Subcategory Average**: Uses the average footprint of the item's subcategory (e.g., "Organic Cow's Milk" under "Dairy").
4.  **Macro Category Fallback**: Uses the parent category average (e.g., "Dairy Products" or "Beverages").
5.  **Global Default Baseline**: Fallback value of $1.5\ kg\ CO_2e\ per\ kg$ of payload (derived from standard consumer package goods averages), accompanied by a "Low" confidence rating metadata flag.
6.  **Text Classification System**: If the category string is absent or ambiguous, an asynchronous text classifier (NLP / lightweight embeddings) parses the product title against UNSPSC taxons to assign a matching category for future requests.

---

## 8. Development Roadmap

```
+-------------------------------------------------------------------------------------------------------+
|  ROADMAP STAGES                                                                                       |
+-------------------------------------------------------------------------------------------------------+
| PHASE 1: MVP (Months 1-2)                                                                             |
|   - Core Go API serving basic REST endpoints                                                           |
|   - Basic JS SDK/Widget (CSS variables for customizable themes)                                        |
|   - Standard CSV-based Category maps (Agribalyse + DEFRA)                                             |
|   - Basic local caching in SDK                                                                        |
+-------------------------------------------------------------------------------------------------------+
                                          |
                                          v
+-------------------------------------------------------------------------------------------------------+
| PHASE 2: PILOT (Months 3-5)                                                                           |
|   - Partner Integration with early adopters (e.g., single food delivery pilot)                         |
|   - Postgres and Redis cluster implementations                                                        |
|   - Matching engine text-parser (NLP categorization for custom catalogs)                              |
|   - Multi-tenant admin dashboard (analytics and manual mappings)                                      |
+-------------------------------------------------------------------------------------------------------+
                                          |
                                          v
+-------------------------------------------------------------------------------------------------------+
| PHASE 3: SCALE (Months 6+)                                                                            |
|   - ClickHouse integration for high-volume logs                                                        |
|   - Edge worker caching layer (Cloudflare Workers)                                                     |
|   - Full fallback ML pipeline for catalog classifications                                             |
|   - Certified ISO-compliant offsets integrations                                                      |
+-------------------------------------------------------------------------------------------------------+
```

---

## 9. Key Technical Decisions & Tradeoffs

### 9.1 Score Precomputation vs. Real-Time Calculation
*   **Approach Chosen**: **Hybrid System**. Product scores are precomputed nightly during ETL runs or when catalogs are uploaded. Real-time computation is reserved for ride/logistics queries (where distance and vehicle type vary per request) and applying dynamic offsets.
*   **Tradeoff**: This design prioritizes low response latencies. Precomputing product catalog footprints cuts DB lookups down to a simple key-value read in Redis, avoiding multi-table joins during checkout.

---

### 9.2 SDK Fail-Safe Mechanics (Graceful Degradation)
*   **Decision**: **Silent SDK Fallback**. The SDK initiates a timeout race condition set to 150ms. If the Carbon Companion API does not return a score within this window, the Promise is discarded, and the DOM elements containing the badges are left unmounted/hidden.
*   **Tradeoff**: Ensuring the host site remains responsive takes priority over rendering carbon labels. Under heavy loads, users may not see carbon badges, but their shopping flow remains unaffected.

---

### 9.3 Client-Side vs Server-Side Rendering of Widgets
*   **Decision**: **Client-Side Hydration via SDK**. The SDK loads from a CDN, queries the API, and renders inside the host app DOM using Shadow DOM boundaries.
*   **Tradeoff**: Requires client-side JS execution, which adds a minimal scripting overhead to the client. However, this protects the client from rendering blocking delays and saves partners from modifying their server-side templates or backend routing.

---

## 10. Security & Data Privacy

```
                                      +---------------------------------------------+
                                      | Partner API Key Request                     |
                                      +---------------------------------------------+
                                                             |
                                                             v
                                            [ SHA-256 Hashed Check in Gateway ]
                                            /                                 \
                                     (Valid)                               (Invalid)
                                       /                                         \
                                      v                                           v
                        +---------------------------+                      +---------------+
                        | Check Rate Limits         |                      | Return 401    |
                        | (Leaky Bucket Counter)    |                      | Unauthorized  |
                        +---------------------------+                      +---------------+
                               /                     \
                       (Under Limit)              (Over Limit)
                             /                         \
                            v                           v
              +---------------------------+       +-------------------------+
              | Execute Sandbox Request   |       | Return 429              |
              | (No PII passed, only SKUs)|       | Too Many Requests       |
              +---------------------------+       +-------------------------+
```

*   **API Key Architecture**:
    *   API keys follow a standard format: `cc_live_` or `cc_test_` followed by an alphabet sequence.
    *   API keys are hashed with SHA-256 before storing in the database.
    *   The gateway extracts the key, hashes it, and checks against active keys. A memory cache on edge workers prevents key-verification db lookups on every request.
*   **Zero-PII Commitment**:
    *   The API does not receive customer names, street addresses, or billing details.
    *   For delivery route calculation, host apps send only the pre-calculated distance ($km$) and transit modes (e.g., `electric_bicycle`). For geolocated energy grid mix adjustments, only the country or state/province is sent.
*   **Rate Limiting**:
    *   Implemented via Redis using a sliding-window rate limit algorithm.
    *   Default limits: 5,000 requests/minute per partner credentials for standard tiers. Enterprise tiers run on dedicated instances.

---

## 11. Scalability Planning

### 11.1 Caching Strategy
*   **Edge Caching**: Static widget resources (`sdk.js`) are distributed using a global CDN with long-lived TTLs (e.g., `Cache-Control: public, max-age=31536000`).
*   **Score Caching (Redis)**: Precomputed catalog scores use a key design format: `score:{partner_id}:{sku}`. Cache eviction uses a Least Recently Used (LRU) policy.
*   **Browser Caching**: The SDK uses session storage to store SKU lookups. This prevents redundant API requests when a user navigates back and forth between search lists and details views.

---

### 11.2 Asynchronous Database Updates
*   **Catalog Imports**: Large partner catalog additions are processed asynchronously. Partners submit their catalog CSVs/JSONs via a dashboard, which writes to an SQS queue.
*   **Worker Pool**: A pool of background workers pulls from the queue, executes category matches, computes baseline carbon estimates, updates Postgres, and invalidates matching Redis keys.
*   **Read/Write Split**: Heavy dashboard queries pull from ClickHouse (read replica), ensuring PostgreSQL transactional workloads (write/updates) face no resource lockups during peak business hours.
