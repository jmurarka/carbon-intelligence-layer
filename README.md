# Carbon Companion: Embedded Carbon-Intelligence Layer

Carbon Companion is a high-performance, embedded carbon-intelligence layer designed to be injected into host e-commerce applications (grocery, food delivery, electronic retailers) to compute and visualize product lifecycle assessment (LCA) carbon footprints in real-time.

---

## 1. Monorepo Structure

The codebase is organized as a monorepo using `pnpm` workspaces and `Turborepo`:

*   **`apps/api/`**: High-performance Go scoring engine and API gateway. Serves product scoring, batch, checkout order logistics, alternatives suggestions, and custom catalog uploads (Port `8080`).
*   **`apps/node-api/`**: Production-quality Express/TypeScript gateway serving product scoring, batch lookup, order checkout offset aggregation, and commute travel options (Port `8081`).
*   **`apps/portal/`**: Next.js partner dashboard/admin interface for viewing analytics and managing custom product factor overrides.
*   **`packages/react-widgets/`**: Modern, embeddable React component library supplying glassmorphic product label badges, interactive checkout summary offsets, and commute comparison components.
*   **`packages/sdk-js/`**: Zero-dependency frontend SDK using **Lit Web Components** (renders badges and checkout widgets inside encapsulated Shadow DOM boundaries to prevent CSS collision).
*   **`packages/db-schema/`**: Centralized PostgreSQL database configurations, Prisma schema definitions, and automated seeder scripts.
*   **`data/`**: Standard LCA carbon emission datasets parsed dynamically by the seeder:
    *   `agribalyse_categories.csv` (food and agricultural factors)
    *   `defra_categories.csv` (transport, fuel, and beverage factors)
    *   `transport_factors.csv` (freight and delivery carbon coefficients)

---

## 2. System Architecture

The scoring infrastructure uses a microservice architecture built to support sub-millisecond latencies and high concurrent loads:

```
                  +--------------------------------+
                  |  Client Host SDK Web Widget    |
                  +--------------------------------+
                                  |
                   (HTTPS / Caching Lookup Race)
                                  v
                  +--------------------------------+
                  |    Go API Scoring Server       |
                  +--------------------------------+
                      /           |            \
                     v            v             v
             [ Redis Cache ]  [ PostgreSQL ]  [ ClickHouse LogChan ]
               (Fast read)    (Catalog / Config)   (Async events queue)
                                                        |
                                                        v
                                              [ ClickHouse OLAP ]
                                              (OLAP logs batching)
```

1.  **Read-Through Caching**: API checks Redis cache (`catalog:{partner_id}:{sku}`) first. On miss, queries Postgres and populates Redis.
2.  **Asynchronous Event Logging**: Analytics logs are pushed into a buffered Go channel (`LogChan`) and flushed in batches of up to 100 entries (or every 5 seconds) to ClickHouse to prevent write locks.
3.  **Graceful Bypass Fallbacks**: If Redis or ClickHouse servers are offline/unconfigured, the system automatically logs warnings and bypasses database writes to keep the critical path active.

---

## 3. How to Run the System

### 3.1 Spin up Databases
Boot the Postgres, Redis, and ClickHouse containers in the background:
```bash
docker-compose up -d
```

### 3.2 Initialize & Seed PostgreSQL Database
Ensure you are in the `packages/db-schema` workspace:
```bash
cd packages/db-schema
npx prisma db push
npx prisma db seed
```

### 3.3 Start the APIs
*   **Go API Server** (runs on port `8080`):
    ```bash
    cd apps/api
    go run .
    ```
*   **Node.js/Express API Gateway** (runs on port `8081`):
    ```bash
    cd apps/node-api
    npm run dev
    ```

### 3.4 Compile & Build React Widgets
```bash
cd packages/react-widgets
npm run build
```
*   **EcoGrocer Sandbox Page**: To test and play with the widgets visually, open **`packages/react-widgets/index.html`** in your browser. (Ensure the Node.js/Express API is running on Port `8081` to handle the data fetching!).

### 3.5 Run the Next.js Partner Portal
Install monorepo dependencies and start the portal developer server:
```bash
# In the repository root
npx pnpm build
cd apps/portal
npx pnpm dev
```

### 3.6 Run Frontend SDK Web Components
```bash
cd packages/sdk-js
npm run dev
```

---

## 4. Running the Tests
*   **Go Unit and Integration Tests**:
    ```bash
    cd apps/api
    go test -v .
    ```
*   **Node.js Express API Tests** (with database mock fallback option):
    ```bash
    cd apps/node-api
    npm run test
    ```
*   **Full Monorepo Workspace Validation** (Turborepo CLI run):
    ```bash
    npx pnpm test
    ```

---

## 5. What's Done & What's Left

### Completed Milestones
*   **Phase 1 MVP Core**:
    *   Dynamic Prisma seeding parser for agricultural and logistics CSV factors.
    *   Stateless Go API endpoints: single scoring `GET /v1/scores/product`, batch `POST /v1/scores/batch`, checkout order summary `POST /v1/scores/checkout`, alternatives recommendation engine `GET /v1/scores/suggestions`.
    *   Lit Web Components widget with local session storage caching.
    *   Next.js React admin panel for catalog override configurations.
*   **Phase 2 Node API Gateway & React Widgets**:
    *   Express REST backend serving `GET /carbon-score/:product_id`, `POST /carbon-score/batch`, `POST /checkout/summary`, and `GET /commute/options` endpoints.
    *   Custom sliding-window rate limiter and SHA-256 HMAC-based API Key middleware.
    *   Prisma category traversal score algorithm with hierarchical parent fallback resolver.
    *   Sleek custom React Components package (`@carbon-companion/react-widgets`) bundling glassmorphic tags, interactive summaries, and delivery commute option matrices.
*   **Phase 3 Matching Engine**:
    *   Token-based classification parsing (Jaccard similarity index + synonym mapping dictionary) to match unclassified products to standard categories.
    *   Batch catalog uploader `POST /v1/catalog/upload` with dynamic upserts (`ON CONFLICT DO UPDATE`).
    *   Contextual tech-brand protection filtering to prevent electronic brands (e.g. "Apple MacBook") from mapping to produce categories (e.g. "Fruits & Vegetables").
*   **Phase 4 Scalability & Integrations**:
    *   Sub-millisecond Read-Through Redis caching.
    *   Write-Through deferred cache invalidation on save/update hooks.
    *   Non-blocking async ClickHouse logging batch pipeline for analytics ingestion.
    *   Dynamic checkout carbon offset options modeled after Cloverly/Patch portfolio APIs (Forestry, Soil Carbon, DAC).
    *   Docker Compose multi-service database orchestration.

### Future Roadmap Tasks (What's Left)
*   **Production Deployment & CI/CD**: Write Helm charts and configure Kubernetes pods for Go API scaling.
*   **Live Offset Integrations**: Connect the mock client in `offsets.go` to live Patch/Cloverly sandbox/production API keys.
*   **Edge worker caching layer**: Set up Cloudflare Worker scripts to intercept and cache SDK widget script delivery.
*   **Advanced ML Pipeline**: Train or hook up a transformer model to parse catalog item strings that fail token matches.
